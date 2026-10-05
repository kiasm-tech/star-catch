import type { Intent, Kind, SentenceClass, Visibility } from "@kiasm-tech/star-catch-contracts";
import type { Classifier } from "./port.js";
import type { ClassifyResult, SentenceItem, UnitItem } from "./schema.js";

/** Conventional Commits types → intent. */
const INTENT_BY_TYPE: Record<string, Intent> = {
  feat: "feature",
  fix: "fix",
  refactor: "refactor",
  perf: "performance",
  security: "security",
  sec: "security",
  chore: "maintenance",
  build: "maintenance",
  ci: "maintenance",
  docs: "maintenance",
  style: "maintenance",
  test: "maintenance",
  revert: "fix",
};

const SENTENCE_RULES: [RegExp, SentenceClass][] = [
  [/\b(never|bug|broken|breaks?|fails?|failing|errors?|crash(es)?|wrong|can'?t|cannot|doesn'?t|didn'?t|did not|does not|tickets?|races?|stale|regression|asked|needs?|guessing|confus\w*|unclear|mixed|(was|were) (doing|using|computing|summing|counting))\b/i, "problem"],
  [/\b(so (that|the|both|it|we|they)|because|in order to|otherwise|which means|(for|ahead of) (the|a|an|our) [\w -]*?(campaign|launch|release))\b/i, "rationale"],
  [/^(run|set|make sure|migrate|deploy|update|please|remember)\b/i, "instruction"],
  [/\b(now|will|adds?|removes?|lowers?|raises?|returns?|changes?|supports?|uses?)\b/i, "behaviour"],
];

function kindOf(item: UnitItem): Kind {
  if (item.language === "tsx") return "ui";
  if (/(^|\/)(models?|entities|schema|db)\//.test(item.path)) return "data";
  if (/(^|\/)(types|contracts|interfaces)\//.test(item.path) || /\.d\.ts$/.test(item.path)) return "interface";
  return "logic";
}

function visibilityOf(item: UnitItem, kind: Kind | undefined): Visibility {
  if (item.entryPoint === "page" || kind === "ui") return "user";
  if (item.entryPoint === "apiRoute") return "apiConsumer";
  if (item.entryPoint === "job" || item.entryPoint === "command") return "operator";
  return item.exported ? "apiConsumer" : "internal";
}

function unitResult(item: UnitItem): ClassifyResult {
  const kind = item.decided.kind ? undefined : kindOf(item);
  const prefix = /^(\w+)(\(.*?\))?!?:/.exec(item.title)?.[1]?.toLowerCase() ?? "";
  return {
    type: "unit",
    id: item.id,
    ...(kind && { kind }),
    intent: item.decided.intent ?? INTENT_BY_TYPE[prefix] ?? "maintenance",
    visibility: item.decided.visibility ?? visibilityOf(item, item.decided.kind ?? kind),
    breaking: /!:/.test(item.title),
    securitySensitive: /(^|\/)(auth|security|crypto|permissions?)(\/|\.)/i.test(item.path),
    confidence: { ...(kind && { kind: 1 }), intent: 1, visibility: 1, risks: 1 },
  };
}

function sentenceResult(item: SentenceItem): ClassifyResult {
  if (item.origin.startsWith("commit:")) return { type: "sentence", id: item.id, class: "behaviour", confidence: 1 };
  const rule = SENTENCE_RULES.find(([pattern]) => pattern.test(item.text));
  return { type: "sentence", id: item.id, class: rule?.[1] ?? "noise", confidence: 1 };
}

/** A deterministic stand-in for the model: the same input always gets the same labels. */
export const mockClassifier: Classifier = {
  id: "mock@1",
  classify: async (items) => items.map((item) => (item.type === "unit" ? unitResult(item) : sentenceResult(item))),
};
