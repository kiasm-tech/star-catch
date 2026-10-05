import type { Cut, Fact, Sentence, Visual } from "@kiasm-tech/star-catch-contracts";

/** One section to narrate: what it's for, what its picture shows, and only the facts it's about. */
export interface SectionBrief {
  id: string;
  heading: string;
  /** The one question this section answers; the others answer theirs. */
  purpose: string;
  visual: Visual;
  /** What the narration may reveal: element ids for `<mark name="…"/>`, with what each shows. */
  elements: { id: string; label: string }[];
  facts: Fact[];
  wordLimit: number;
}

/** Everything one section's narration may be written from: never the diff. */
export interface WriteRequest extends SectionBrief {
  cut: Cut;
  /** The PR's sentences that aren't noise, code names already spelled as words. */
  sentences: Sentence[];
  pr: { title: string };
  /** A developer's request, from `@star-catch fix …` or the Fix panel. */
  instruction?: string;
  /** Why the checks dropped sentences of a first attempt: the writer gets one more try. */
  repair?: string[];
}

/** A whole cut at once, so the sections tell one story without repeating each other. */
export interface CutRequest {
  cut: Cut;
  sections: SectionBrief[];
  sentences: Sentence[];
  pr: { title: string };
  instruction?: string;
}

/** One sentence and what it says it came from: unit or sentence ids, or `pr:title`. */
export interface WrittenSentence {
  text: string;
  sources: string[];
}

/** Writes narration (spec-update-structure.md §10): the only step that generates text. */
export interface ScriptWriter {
  id: string;
  write(request: WriteRequest, signal?: AbortSignal): Promise<WrittenSentence[]>;
  /** Optional: every section of a cut in one go, by section id. A missing section gets nothing. */
  writeCut?(request: CutRequest, signal?: AbortSignal): Promise<Record<string, WrittenSentence[]>>;
}
