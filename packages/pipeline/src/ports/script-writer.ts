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
  /** The words the picture shows, by element id, which a writer may put at the cut's level. */
  labels: { id: string; text: string; max: number }[];
  facts: Fact[];
  wordLimit: number;
  /** Enough to make the point and say what it means; 0 where one line is the point (title, wrap). */
  minWords: number;
}

/** What moved in the code, in words: what the writer needs to describe a change, never to quote. */
export interface UnitChange {
  /** The unit id: a source the writer may cite. */
  id: string;
  name: string;
  file: string;
  component: string;
  change: string;
  /** Other units that call it, and the ones it calls, by name. */
  callers: number;
  calls: string[];
}

/** Everything one section's narration may be written from: never the diff. */
export interface WriteRequest extends SectionBrief {
  cut: Cut;
  /** The PR's sentences that aren't noise, code names already spelled as words. */
  sentences: Sentence[];
  /** The changed units, most important first. */
  changes: UnitChange[];
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
  changes: UnitChange[];
  pr: { title: string };
  instruction?: string;
}

/** One sentence and what it says it came from: unit or sentence ids, or `pr:title`. */
export interface WrittenSentence {
  text: string;
  sources: string[];
}

/** A whole cut's writing: narration by section, and optionally the picture's words by section and element. */
export interface CutWriting {
  sections: Record<string, WrittenSentence[]>;
  labels?: Record<string, Record<string, string>>;
}

/** Writes narration (spec-update-structure.md §10): the only step that generates text. */
export interface ScriptWriter {
  id: string;
  write(request: WriteRequest, signal?: AbortSignal): Promise<WrittenSentence[]>;
  /** Optional: every section of a cut in one go, by section id. A missing section gets nothing. */
  writeCut?(request: CutRequest, signal?: AbortSignal): Promise<CutWriting>;
}
