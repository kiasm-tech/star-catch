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
import type { ScriptWriter, SectionBrief, UnitChange, WrittenSentence } from "../ports/script-writer.js";
import { buildVisual, type PrInfo, type VisualInput } from "../visuals/build.js";
import { revealable } from "../visuals/elements.js";
import { labelsOf, mapLabels } from "../visuals/labels.js";
import { clip, deCode, humanize } from "../visuals/words.js";
import { checkSection, labelProblem, wordCount, type Checked } from "./checks.js";
import { CHAPTER_TITLES, SECTION_FACTS, SECTION_PURPOSES, SECTION_TITLES } from "./sections.js";
import { CAP_SECONDS, WORDS_PER_MINUTE, selectSections } from "./select.js";

export interface ScriptOptions {
  writer: ScriptWriter;
  /** The PR is still open: the technical article gets its draft-only appendix. */
  open: boolean;
  /** A developer's request for every section, from `@star-catch fix …`. */
  instruction?: string;
  /** Fold a section too thin for its own scene into the article (exports do; tests of selection don't). */
  foldThin?: boolean;
  signal?: AbortSignal;
}

/** Fewer spoken words than this, and a section shares its chapter's scene time with nothing to show for it. */
const THIN_WORDS = 12;
/** Sections whose one line is the point. */
const ONE_LINERS = new Set(["title", "headline", "wrap"]);

const CHANGE_WORDS: Record<string, string> = {
  added: "added",
  removed: "removed",
  signatureChanged: "what it takes or returns changed",
  conditionChanged: "a condition in it changed",
  bodyChanged: "what it does changed",
  moved: "moved",
};

/** The changed units, most important first, described in words for the writer. */
function changesOf(context: Context, max = 12): UnitChange[] {
  const rank = new Map(context.concerns.flatMap((c) => c.unitIds.map((id) => [id, c.rank] as const)));
  const order = new Map(context.units.map((u, i) => [u.id, i]));
  const names = new Map(context.units.map((u) => [u.id, humanize(u.name)]));
  const calls = context.links.filter((l) => l.type === "calls");
  return context.units
    .filter((u) => u.verdict !== "notAChange")
    .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || order.get(a.id)! - order.get(b.id)!)
    .slice(0, max)
    .map((u) => ({
      id: u.id,
      name: names.get(u.id)!,
      file: u.file.split("/").at(-1)!,
      component: u.component,
      change: [u.refactorings.includes("rename") ? "renamed" : "", CHANGE_WORDS[u.changeType] ?? u.changeType].filter(Boolean).join(", "),
      callers: calls.filter((l) => l.to === u.id).length,
      calls: calls.filter((l) => l.from === u.id).flatMap((l) => names.get(l.to) ?? []).slice(0, 3),
    }));
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
  // The writer reads the PR's words with code names spelled out, so it has nothing to copy them from.
  const sentences = context.sentences.filter((s) => s.class !== "noise").map((s) => ({ ...s, text: deCode(s.text) }));
  const flags: ScriptFlag[] = [];
  const fail = (sectionId: string, error: unknown) =>
    flags.push({ sectionId, message: `the writer failed: ${error instanceof Error ? error.message : String(error)}` });

  type Planned = { brief: SectionBrief; readMore: boolean; draft: boolean; visualFlags: string[] };
  const planned: Planned[] = [
    ...plan.chapters.flatMap((c) => c.sections.map((s) => ({ id: s.id as string, wordLimit: s.wordLimit, readMore: s.readMore, draft: false }))),
    ...plan.draft.map((d) => ({ id: d.id as string, wordLimit: d.wordLimit, readMore: false, draft: true })),
  ].map(({ id, wordLimit, readMore, draft }) => {
    const built = buildVisual(id as never, input);
    const scope = SECTION_FACTS[id as keyof typeof SECTION_FACTS];
    const brief: SectionBrief = {
      id,
      // A floor of 0 reads as "write nothing"; a one-liner still needs its line.
      minWords: Math.min(wordLimit, ONE_LINERS.has(id) ? 8 : Math.max(15, Math.round(wordLimit * 0.5))),
      heading: SECTION_TITLES[id as keyof typeof SECTION_TITLES],
      purpose: SECTION_PURPOSES[id as keyof typeof SECTION_PURPOSES],
      visual: built.visual,
      elements: revealable(built.visual).map((e) => ({ ...e, label: deCode(e.label) })),
      labels: labelsOf(built.visual, cut).map((l) => ({ ...l, text: deCode(l.text) })),
      facts: context.facts
        .filter((f) => scope.some((s) => s === f.group || s === `${f.group}.${f.key}`))
        .map((f) => ({ ...f, value: typeof f.value === "string" ? deCode(f.value) : Array.isArray(f.value) ? f.value.map(deCode) : f.value })),
      wordLimit,
    };
    return { brief, readMore, draft, visualFlags: built.flags.map((f) => f.replace(/^[^:]+: /, "")) };
  });

  const shared = { cut, sentences, changes: changesOf(context), pr: { title: pr.title }, ...(options.instruction && { instruction: options.instruction }) };
  const first = new Map<string, WrittenSentence[]>();
  const relabels = new Map<string, Record<string, string>>();
  if (options.writer.writeCut) {
    try {
      const all = await options.writer.writeCut({ ...shared, sections: planned.map((p) => p.brief) }, options.signal);
      for (const p of planned) first.set(p.brief.id, all.sections[p.brief.id] ?? []);
      for (const [id, labels] of Object.entries(all.labels ?? {})) relabels.set(id, labels);
    } catch (error) {
      fail("script", error);
    }
  } else {
    for (const p of planned) {
      try {
        first.set(p.brief.id, await options.writer.write({ ...shared, ...p.brief }, options.signal));
      } catch (error) {
        fail(p.brief.id, error);
      }
    }
  }

  const check = (p: Planned, written: WrittenSentence[]): Checked =>
    checkSection({ cut, draft: p.draft, sentences: written, visual: p.brief.visual, known, evidence, components, codeNames, wordLimit: p.brief.wordLimit, minWords: p.brief.minWords });
  const dropped = (c: Checked) => c.flags.filter((f) => f.startsWith("dropped"));

  /** The picture in the writer's words where they pass the checks; else its own, code spelled out for business. */
  const pictureOf = (p: Planned): ScriptSection["visual"] => {
    const originals = new Map(labelsOf(p.brief.visual, cut).map((l) => [l.id, l]));
    const accepted = new Map<string, string>();
    for (const [id, text] of Object.entries(relabels.get(p.brief.id) ?? {})) {
      const original = originals.get(id);
      if (!original) continue;
      const problem = labelProblem({ cut, text, original: original.text, max: original.max, evidence, components, codeNames });
      if (problem) flags.push({ sectionId: p.brief.id, message: `kept the picture's own words for ${id}: ${problem}` });
      else accepted.set(id, text.trim());
    }
    return mapLabels(p.brief.visual, cut, (id, text) => accepted.get(id) ?? (cut === "business" ? clip(deCode(text), originals.get(id)!.max) : text));
  };

  const sections = new Map<string, ScriptSection>();
  for (const p of planned) {
    let checked = check(p, first.get(p.brief.id) ?? []);
    // One more try for a section the checks emptied or cut, told exactly why; or that came back with nothing.
    const nothing = (first.get(p.brief.id) ?? []).length === 0;
    if (dropped(checked).length > 0 || nothing) {
      try {
        const retry = check(p, await options.writer.write({ ...shared, ...p.brief, repair: nothing ? ["nothing was written for this section"] : dropped(checked) }, options.signal));
        if (nothing ? retry.sentences.length > 0 : dropped(retry).length < dropped(checked).length) checked = retry;
      } catch (error) {
        fail(p.brief.id, error);
      }
    }
    flags.push(...[...p.visualFlags, ...checked.flags].map((message) => ({ sectionId: p.brief.id, message })));
    sections.set(p.brief.id, {
      id: p.brief.id,
      visual: pictureOf(p),
      ...voiceMarks(checked.sentences),
      sources: [...new Set(checked.sentences.flatMap((s) => s.sources))],
      article: { heading: p.brief.heading, readMore: p.readMore },
    });
  }

  // A thin section beside a fuller one in its chapter goes to the article: fewer, fuller scenes.
  if (options.foldThin) {
    for (const c of plan.chapters) {
      for (const s of c.sections) {
        const section = sections.get(s.id)!;
        if (section.article.readMore || ONE_LINERS.has(s.id)) continue;
        const words = wordCount(section.narration);
        const others = c.sections.filter((o) => o.id !== s.id && !sections.get(o.id)!.article.readMore && wordCount(sections.get(o.id)!.narration) >= THIN_WORDS);
        if (words >= THIN_WORDS || others.length === 0) continue;
        sections.set(s.id, { ...section, article: { ...section.article, readMore: true } });
        flags.push({ sectionId: s.id, message: `folded into the article: ${words} words is too thin for its own scene` });
      }
    }
  }

  const chapters = plan.chapters.map((c) => ({ id: c.id, title: CHAPTER_TITLES[c.id], sections: c.sections.map((s) => sections.get(s.id)!) }));
  const draft = plan.draft.map((d) => sections.get(d.id)!);

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
