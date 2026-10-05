/** Context → one script per cut (spec-update-structure.md §10): sections, visuals, checked narration. */
import {
  CUTS,
  ScriptSchema,
  type Context,
  type Cut,
  type Script,
  type ScriptFlag,
  type ScriptSection,
  type SectionPlan,
} from "@kiasm-tech/star-catch-contracts";
import type { ScriptWriter, WrittenSentence } from "../ports/script-writer.js";
import { buildVisual, type PrInfo, type VisualInput } from "../visuals/build.js";
import { revealable } from "../visuals/elements.js";
import { checkSection, wordCount } from "./checks.js";
import { CHAPTER_TITLES, SECTION_TITLES } from "./sections.js";
import { CAP_SECONDS, WORDS_PER_MINUTE, selectSections } from "./select.js";

export interface ScriptOptions {
  writer: ScriptWriter;
  /** The PR is still open: the technical article gets its draft-only appendix. */
  open: boolean;
  /** A developer's request for every section, from `@star-catch fix …`. */
  instruction?: string;
  signal?: AbortSignal;
}

export type Scripts = Record<Cut, Script | null>;

/** Marks named after element ids become `m1`, `m2`… in reading order; `reveals` maps them back. */
function voiceMarks(sentences: WrittenSentence[]): { narration: string; reveals: Record<string, string> } {
  const reveals: Record<string, string> = {};
  const names = new Map<string, string>();
  const narration = sentences
    .map((s) => s.text)
    .join(" ")
    .replace(/<mark name="([^"]*)"\/>/g, (_tag, id: string) => {
      if (!names.has(id)) {
        names.set(id, `m${names.size + 1}`);
        reveals[names.get(id)!] = id;
      }
      return `<mark name="${names.get(id)}"/>`;
    });
  return { narration, reveals };
}

async function scriptFor(context: Context, pr: PrInfo, cut: Cut, plan: SectionPlan, options: ScriptOptions): Promise<Script> {
  const input: VisualInput = { context, pr, cut, plan };
  const known = new Set(["pr:title", ...context.units.map((u) => u.id), ...context.sentences.map((s) => s.id)]);
  const evidence = new Set(context.facts.filter((f) => f.group === "evidence").flatMap((f) => (Array.isArray(f.value) ? f.value : [])));
  const components = [...new Set(context.units.map((u) => u.component))];
  // Names that look like code: camelCase, PascalCase with two humps, snake_case. `POST` or `orders` don't.
  const codeNames = [
    ...new Set(
      context.units
        .map((u) => u.name.split(" > ")[0]!.split(".").at(-1)!.replace(/ \(\d+\)$/, ""))
        .filter((n) => /^[a-z]+[A-Z]|^[A-Z][a-z0-9]+[A-Z]|_/.test(n) && /^[\w$]+$/.test(n)),
    ),
  ];
  const sentences = context.sentences.filter((s) => s.class !== "noise");
  const flags: ScriptFlag[] = [];

  const section = async (id: ScriptSection["id"], wordLimit: number, readMore: boolean, draft: boolean): Promise<ScriptSection> => {
    const built = buildVisual(id as never, input);
    const heading = SECTION_TITLES[id as keyof typeof SECTION_TITLES];
    let written: WrittenSentence[] = [];
    try {
      written = await options.writer.write(
        {
          cut,
          section: { id, heading },
          visual: built.visual,
          elements: revealable(built.visual),
          facts: context.facts,
          sentences,
          pr: { title: pr.title },
          wordLimit,
          ...(options.instruction && { instruction: options.instruction }),
        },
        options.signal,
      );
    } catch (error) {
      flags.push({ sectionId: id, message: `the writer failed: ${error instanceof Error ? error.message : String(error)}` });
    }
    const checked = checkSection({ cut, draft, sentences: written, visual: built.visual, known, evidence, components, codeNames });
    flags.push(...[...built.flags.map((f) => f.replace(/^[^:]+: /, "")), ...checked.flags].map((message) => ({ sectionId: id, message })));
    return {
      id,
      visual: built.visual,
      ...voiceMarks(checked.sentences),
      sources: [...new Set(checked.sentences.flatMap((s) => s.sources))],
      article: { heading, readMore },
    };
  };

  const chapters = [];
  for (const chapter of plan.chapters) {
    const sections = [];
    for (const s of chapter.sections) sections.push(await section(s.id, s.wordLimit, s.readMore, false));
    chapters.push({ id: chapter.id, title: CHAPTER_TITLES[chapter.id], sections });
  }
  const draft = [];
  for (const d of plan.draft) draft.push(await section(d.id, d.wordLimit, false, true));

  const spokenWords = chapters.flatMap((c) => c.sections.filter((s) => !s.article.readMore)).reduce((n, s) => n + wordCount(s.narration), 0);
  const cap = (CAP_SECONDS[cut] * WORDS_PER_MINUTE) / 60;
  if (plan.gate.outcome === "full" && spokenWords > cap) flags.push({ sectionId: "script", message: `${spokenWords} words, over the ${cap}-word cap` });

  return ScriptSchema.parse({ cut, pr: { fullName: pr.fullName, number: pr.number, title: pr.title }, gate: plan.gate, chapters, draft, skipped: plan.skipped, flags });
}

/** Both cuts; a cut the gates rule out is null. */
export async function generateScripts(context: Context, pr: PrInfo, options: ScriptOptions): Promise<Scripts> {
  const scripts = {} as Scripts;
  for (const cut of CUTS) {
    const plan = selectSections(context, cut, { open: options.open });
    scripts[cut] = plan.gate.outcome === "none" ? null : await scriptFor(context, pr, cut, plan, options);
  }
  return scripts;
}
