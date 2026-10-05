/** Checks before anyone sees a draft (spec-update-structure.md §12): fix what can be fixed, flag the rest. */
import type { Cut, Visual } from "@kiasm-tech/star-catch-contracts";
import type { WrittenSentence } from "../ports/script-writer.js";
import { numbersIn } from "../text.js";
import { elementIds, revealable } from "../visuals/elements.js";
import { WORDS_PER_MINUTE } from "./select.js";

export const MAX_SECTION_SECONDS = 60;
const MARK = /<mark name="([^"]*)"\/>/g;

const FILE_PATH = /(?:^|[\s(])(?:[\w.-]+\/)+[\w.-]+\.\w{1,5}\b/;
const CALL = /\b[A-Za-z_$][\w$]*\(/;
const CAMEL = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/;
const SNAKE = /\b[a-z0-9]+_[a-z0-9_]+\b/;
/** Folder names that read as code to someone who doesn't write it. */
const CODE_WORDS = new Set(["api", "apis", "graphql", "db", "sql", "src", "lib", "utils", "middleware", "config", "cli", "repo", "endpoint"]);
const ACRONYM = /\b[A-Z]{2,}s?\b/g;

export interface CheckInput {
  cut: Cut;
  /** Draft-only appendices are for reviewers: code names are allowed there. */
  draft: boolean;
  sentences: WrittenSentence[];
  visual: Visual;
  /** Unit and sentence ids in the context, and `pr:title`. */
  known: Set<string>;
  /** Numbers as written in evidence facts. */
  evidence: Set<string>;
  components: string[];
  /** The PR's own declaration names that read as code (`BillingPage`, `persistImpl`); brand names like GraphQL don't. */
  codeNames: string[];
  /** The section's share of the cut's length; half as much again is flagged. */
  wordLimit?: number;
  /** The least it should say; well under it is flagged. */
  minWords?: number;
}

export interface Checked {
  sentences: WrittenSentence[];
  flags: string[];
}

const spoken = (text: string) => text.replace(MARK, "");
const wordCount = (text: string) => spoken(text).split(/\s+/).filter(Boolean).length;

/** Why a sentence can't be shown at this cut's altitude, if it can't. */
function altitude(text: string, cut: Cut, components: string[], codeNames: string[]): string | undefined {
  const plain = spoken(text);
  if (FILE_PATH.test(plain)) return "a file path";
  if (/`/.test(plain) || CALL.test(plain)) return "code";
  if (CAMEL.test(plain) || SNAKE.test(plain) || codeNames.some((name) => new RegExp(`\\b${name}\\b`).test(plain))) return "a code name";
  if (cut === "business") {
    // Lowercase only: "the api" is a folder, "an API key" is everyday language (flagged as an acronym).
    const named = components.find((c) => CODE_WORDS.has(c) && new RegExp(`\\b${c}\\b`).test(plain));
    if (named) return `the component name "${named}"`;
  }
  return undefined;
}

export function checkSection({ cut, draft, sentences, visual, known, evidence, components, codeNames, wordLimit, minWords }: CheckInput): Checked {
  const flags: string[] = [];
  const ids = elementIds(visual);
  const shown = new Set(numbersIn(JSON.stringify(visual.data)));
  const kept: WrittenSentence[] = [];
  for (const sentence of sentences) {
    const sources = sentence.sources.filter((id) => known.has(id));
    if (sources.length === 0) {
      flags.push(`dropped a sentence with no known source: "${spoken(sentence.text)}"`);
      continue;
    }
    const invented = numbersIn(spoken(sentence.text)).filter((n) => !evidence.has(n) && !shown.has(n));
    if (invented.length > 0) {
      flags.push(`dropped a sentence with a number that isn't evidence (${invented.join(", ")})`);
      continue;
    }
    const wrong = draft ? undefined : altitude(sentence.text, cut, components, codeNames);
    if (wrong) {
      flags.push(`dropped a sentence that names ${wrong}: "${spoken(sentence.text)}"`);
      continue;
    }
    const text = sentence.text.replace(MARK, (tag, name: string) => {
      if (ids.has(name)) return tag;
      flags.push(`removed a mark for an element the visual doesn't have: ${name}`);
      return "";
    });
    kept.push({ text, sources });
  }
  if (cut === "business" && !draft) {
    const acronyms = [...new Set(kept.flatMap((s) => spoken(s.text).match(ACRONYM) ?? []))];
    if (acronyms.length > 0) flags.push(`acronym without a glossary card: ${acronyms.join(", ")}`);
  }
  const limit = (MAX_SECTION_SECONDS * WORDS_PER_MINUTE) / 60;
  while (kept.length > 1 && kept.reduce((n, s) => n + wordCount(s.text), 0) > limit) {
    kept.pop();
    if (!flags.includes("trimmed to stay under a minute")) flags.push("trimmed to stay under a minute");
  }
  const total = kept.reduce((n, s) => n + wordCount(s.text), 0);
  if (wordLimit !== undefined && total > wordLimit * 1.5) flags.push(`longer than its ${wordLimit}-word budget (${total} words)`);
  if (minWords && kept.length > 0 && total < minWords * 0.6) flags.push(`shorter than its ${minWords}-word floor (${total} words)`);
  const marked = new Set(kept.flatMap((s) => [...s.text.matchAll(MARK)].map((m) => m[1]!)));
  const silent = revealable(visual).filter((e) => !marked.has(e.id));
  if (!draft && silent.length > 0) flags.push(`never revealed by the narration: ${silent.map((e) => e.id).join(", ")}`);
  if (kept.length === 0) flags.push("no narration left");
  return { sentences: kept, flags };
}

export { wordCount };

export interface LabelInput {
  cut: Cut;
  text: string;
  /** What the element said before: its numbers may stay. */
  original: string;
  max: number;
  evidence: Set<string>;
  components: string[];
  codeNames: string[];
}

/** Why a writer's label for an element can't replace the original, if it can't. */
export function labelProblem({ cut, text, original, max, evidence, components, codeNames }: LabelInput): string | undefined {
  const label = text.trim();
  if (!label) return "it's empty";
  if (label.length > max) return `it's longer than ${max} characters`;
  if (/<mark /.test(label)) return "it has a mark";
  const wrong = altitude(label, cut, components, codeNames);
  if (wrong) return `it names ${wrong}`;
  const allowed = new Set([...evidence, ...numbersIn(original)]);
  const invented = numbersIn(label).filter((n) => !allowed.has(n));
  if (invented.length > 0) return `it has a number that isn't evidence (${invented.join(", ")})`;
  return undefined;
}
