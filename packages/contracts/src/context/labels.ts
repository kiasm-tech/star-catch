/** Closed label sets for the context (docs/pr-analysis.md §3). Bump on any change. */
export const LABEL_SET_VERSION = 1;

export const VERDICTS = ["notAChange", "structural", "behavioural"] as const;
export const CHANGE_TYPES = [
  "added",
  "removed",
  "signatureChanged",
  "conditionChanged",
  "bodyChanged",
  "moved",
] as const;
export const UNIT_KINDS = [
  "declaration",
  "configKey",
  "schemaEntity",
  "dependency",
  "docSection",
  "file",
] as const;
export const KINDS = [
  "logic",
  "interface",
  "data",
  "configuration",
  "dependency",
  "ui",
  "test",
  "documentation",
  "buildCi",
] as const;
export const INTENTS = [
  "feature",
  "fix",
  "refactor",
  "performance",
  "security",
  "maintenance",
] as const;
export const VISIBILITIES = ["user", "apiConsumer", "operator", "internal"] as const;
export const RISKS = [
  "breaking",
  "dataMigration",
  "securitySensitive",
  "untested",
  "gated",
] as const;
export const REFACTORINGS = ["rename", "move", "extract", "inline"] as const;
export const SENTENCE_CLASSES = [
  "problem",
  "rationale",
  "behaviour",
  "instruction",
  "noise",
] as const;
export const LINK_TYPES = ["calls", "sharesData", "covers"] as const;
export const ENTRY_POINTS = ["page", "apiRoute", "command", "job", "exportedApi"] as const;
export const FACT_GROUPS = [
  "identity",
  "intent",
  "shape",
  "interactions",
  "data",
  "contracts",
  "rules",
  "users",
  "rollout",
  "quality",
  "reach",
  "evidence",
] as const;
// The model's name is deliberately not recorded.
export const LABEL_SOURCES = ["rule", "model", "human"] as const;

export type Verdict = (typeof VERDICTS)[number];
export type ChangeType = (typeof CHANGE_TYPES)[number];
export type UnitKind = (typeof UNIT_KINDS)[number];
export type Kind = (typeof KINDS)[number];
export type Intent = (typeof INTENTS)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type Risk = (typeof RISKS)[number];
export type Refactoring = (typeof REFACTORINGS)[number];
export type SentenceClass = (typeof SENTENCE_CLASSES)[number];
export type LinkType = (typeof LINK_TYPES)[number];
export type EntryPointType = (typeof ENTRY_POINTS)[number];
export type FactGroup = (typeof FACT_GROUPS)[number];
export type LabelSource = (typeof LABEL_SOURCES)[number];
