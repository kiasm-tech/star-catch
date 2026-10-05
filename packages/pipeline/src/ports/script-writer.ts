import type { Cut, Fact, Sentence, Visual } from "@kiasm-tech/star-catch-contracts";

/** Everything one section's narration may be written from: never the diff. */
export interface WriteRequest {
  cut: Cut;
  section: { id: string; heading: string };
  visual: Visual;
  /** What the narration may reveal: element ids for `<mark name="…"/>`, with what each shows. */
  elements: { id: string; label: string }[];
  facts: Fact[];
  /** The PR's sentences that aren't noise. */
  sentences: Sentence[];
  pr: { title: string };
  wordLimit: number;
  /** A developer's request, from `@star-catch fix …` or the Fix panel. */
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
}
