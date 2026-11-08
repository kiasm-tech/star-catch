/** Edits to a draft catch from Crux: a person's own narration or picture wording, or the writer's narration on their instruction. */
import {
  CatchVersionSchema,
  PullRequestSnapshotSchema,
  type CatchVersion,
  type Cut,
  type NarrationEdit,
  type RevisionRequest,
  type Script,
  type ScriptSection,
  type VisualEdit,
} from "@kiasm-tech/star-catch-contracts";
import type { CatchStore, RunLog } from "../ports/catch-store.js";
import type { SnapshotStore } from "../ports/snapshot-store.js";
import type { UsageMeter } from "../ports/usage.js";
import { reviseSection, voiceMarks } from "../script/generate.js";
import { elementIds } from "../visuals/elements.js";
import { rewordingProblems } from "../visuals/rewording.js";
import { buildContext, type ContextOptions } from "./build-context.js";
import { prInfoOf, type ScriptPorts } from "./build-scripts.js";

export type EditOutcome =
  | { outcome: "edited"; headSha: string; generatedAt: Date; version: CatchVersion }
  | { outcome: "no-catch" }
  | { outcome: "no-section" }
  /** Merged or closed: what was published stays as it was. */
  | { outcome: "not-draft" }
  /** Another save came first; read the catch again. */
  | { outcome: "conflict" }
  /** The snapshot it was built from is gone: regenerate instead. */
  | { outcome: "no-snapshot" }
  | { outcome: "invalid"; reasons: string[] };

export interface EditDeps {
  catches: CatchStore;
}

export interface ReviseDeps extends EditDeps {
  snapshots: SnapshotStore;
  ports: ScriptPorts;
  runs?: Pick<RunLog, "start" | "finish">;
  meter?: UsageMeter;
  options?: ContextOptions;
}

type Loaded = { headSha: string; basedOn: Date; version: CatchVersion; script: Script; section: ScriptSection };

/** The latest version and the section asked for, if it can be edited. */
async function load(catches: CatchStore, catchId: string, cut: Cut, sectionId: string): Promise<Loaded | EditOutcome> {
  const row = await catches.latest(catchId);
  const parsed = row && CatchVersionSchema.safeParse(row.version);
  if (!row || !parsed?.success) return { outcome: "no-catch" };
  const version = parsed.data;
  if (version.pr.state !== "open") return { outcome: "not-draft" };
  const script = version[cut];
  const section = script && [...script.chapters.flatMap((c) => c.sections), ...script.draft].find((s) => s.id === sectionId);
  if (!script || !section) return { outcome: "no-section" };
  return { headSha: row.headSha, basedOn: row.generatedAt, version, script, section };
}

/** The script with one section replaced, and that section's flags replaced too. */
function withSection(script: Script, section: ScriptSection, flags: string[]): Script {
  const swap = (s: ScriptSection) => (s.id === section.id ? section : s);
  return {
    ...script,
    chapters: script.chapters.map((c) => ({ ...c, sections: c.sections.map(swap) })),
    draft: script.draft.map(swap),
    flags: [...script.flags.filter((f) => f.sectionId !== section.id), ...flags.map((message) => ({ sectionId: section.id, message }))],
  };
}

async function store(catches: CatchStore, loaded: Loaded, cut: Cut, section: ScriptSection, flags: string[]): Promise<EditOutcome> {
  const version = CatchVersionSchema.parse({ ...loaded.version, [cut]: withSection(loaded.script, section, flags) });
  if (!(await catches.edit(version, loaded.headSha, loaded.basedOn))) return { outcome: "conflict" };
  return { outcome: "edited", headSha: loaded.headSha, generatedAt: new Date(), version };
}

const MARK = /<mark name="([^"]*)"\/>/g;

/**
 * A person's narration for one section. Marks may name the section's voice marks or its picture's
 * elements; they're numbered again in reading order. A person's words are theirs: the writer's
 * checks don't run, and the section's flags are cleared.
 */
export async function editNarration({ catches }: EditDeps, catchId: string, edit: NarrationEdit): Promise<EditOutcome> {
  const loaded = await load(catches, catchId, edit.cut, edit.sectionId);
  if ("outcome" in loaded) return loaded;
  const elements = elementIds(loaded.section.visual);
  const unknown = new Set<string>();
  const text = edit.narration.replace(MARK, (_tag, name: string) => {
    const id = loaded.section.reveals[name] ?? (elements.has(name) ? name : undefined);
    if (id === undefined) unknown.add(name);
    return `<mark name="${id}"/>`;
  });
  const reasons = [...[...unknown].map((name) => `no element or voice mark named "${name}"`)];
  if (/[<>]/.test(text.replace(MARK, ""))) reasons.push('the only markup allowed is <mark name="…"/>');
  if (reasons.length > 0) return { outcome: "invalid", reasons };
  const section = { ...loaded.section, ...voiceMarks([{ text, sources: [] }]) };
  return store(catches, loaded, edit.cut, section, []);
}

/**
 * A person's rewording of one section's picture: only its prose may differ (VISUAL_TEXT_FIELDS), so its ids,
 * and the narration's marks on them, still hold. The section's flags are about its narration and stay.
 */
export async function editVisual({ catches }: EditDeps, catchId: string, edit: VisualEdit): Promise<EditOutcome> {
  const loaded = await load(catches, catchId, edit.cut, edit.sectionId);
  if ("outcome" in loaded) return loaded;
  const reasons = rewordingProblems(loaded.section.visual, edit.visual);
  if (reasons.length > 0) return { outcome: "invalid", reasons };
  const flags = loaded.script.flags.filter((f) => f.sectionId === loaded.section.id).map((f) => f.message);
  return store(catches, loaded, edit.cut, { ...loaded.section, visual: edit.visual }, flags);
}

/** The writer rewrites one section as asked, checked like a generated one; the run and its tokens are recorded. */
export async function reviseNarration(deps: ReviseDeps, catchId: string, request: RevisionRequest, signal?: AbortSignal): Promise<EditOutcome> {
  const loaded = await load(deps.catches, catchId, request.cut, request.sectionId);
  if ("outcome" in loaded) return loaded;
  const raw = await deps.snapshots.find(loaded.version.pr.fullName, loaded.headSha);
  const snapshot = raw === null ? null : PullRequestSnapshotSchema.safeParse(raw);
  if (!snapshot?.success) return { outcome: "no-snapshot" };

  const pr = snapshot.data;
  const run = await deps.runs?.start({ fullName: pr.fullName, number: pr.number, headSha: loaded.headSha });
  deps.meter?.take();
  const finish = async (status: "done" | "failed", step: string, error?: string) => {
    if (run === undefined) return;
    await deps.runs!.finish(run, { status, step, ...(error && { error }), ...(deps.meter && { usage: deps.meter.take() }) });
  };
  try {
    const context = await buildContext(pr, deps.ports, { ...deps.options, ...(signal && { signal }) });
    const revision = await reviseSection(context, prInfoOf(pr, context), request.cut, loaded.section, {
      writer: deps.ports.writer,
      open: true,
      instruction: request.instruction,
      ...(signal && { signal }),
    });
    if (revision.outcome === "missing") {
      await finish("done", "revise");
      return { outcome: "no-section" };
    }
    if (revision.outcome === "rejected") {
      await finish("done", "revise");
      return { outcome: "invalid", reasons: revision.reasons };
    }
    const outcome = await store(deps.catches, loaded, request.cut, revision.section, revision.flags);
    await finish("done", "revise");
    return outcome;
  } catch (error) {
    await finish("failed", "revise", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
