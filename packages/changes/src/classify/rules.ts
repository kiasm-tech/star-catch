import type { Kind, Risk, UnitLabels } from "@kiasm-tech/star-catch-contracts";
import type { Unit } from "../schema.js";
import type { RuleLabels } from "./schema.js";

const MIGRATIONS = /(^|\/)(migrations|migration|migrate)\//;
/** `return (<main>…` or `=> <span />`: a component, by changes.md §6.1. */
const RETURNS_JSX = /(\breturn\s*\(?\s*|=>\s*\(?\s*)<[A-Za-z>]/;

const KIND_BY_UNIT: Partial<Record<Unit["unitKind"], Kind>> = {
  configKey: "configuration",
  schemaEntity: "data",
  dependency: "dependency",
  docSection: "documentation",
};

const KIND_BY_FILE: Partial<Record<Unit["fileClass"], Kind>> = {
  test: "test",
  config: "configuration",
  schema: "data",
  manifest: "dependency",
  docs: "documentation",
  buildCi: "buildCi",
};

function kindOf(unit: Unit): Kind | undefined {
  if (unit.fileClass === "test") return "test";
  const byUnit = KIND_BY_UNIT[unit.unitKind] ?? KIND_BY_FILE[unit.fileClass];
  if (byUnit) return byUnit;
  const component = unit.language === "tsx" || unit.file.endsWith(".jsx");
  if (component && unit.unitKind === "declaration" && RETURNS_JSX.test(unit.after ?? unit.before ?? "")) return "ui";
  return undefined;
}

/** Labels the rules decide (changes.md §6.1); the rest are the classifier's. `untested` comes with links. */
export function ruleLabels(unit: Unit): RuleLabels {
  const kind = kindOf(unit);
  const risks: Risk[] = unit.unitKind === "schemaEntity" && MIGRATIONS.test(unit.file) ? ["dataMigration"] : [];
  return { ...(kind && { kind }), ...(unit.verdict === "structural" && { intent: "refactor" as const }), risks };
}

/**
 * Structural units never reach the classifier (changes.md §6): rules decide every axis. Behaviour
 * is unchanged, so they are internal; a kind the rules can't tell is `logic`.
 */
export function structuralLabels(unit: Unit): UnitLabels {
  const decided = ruleLabels(unit);
  return {
    kind: decided.kind ?? "logic",
    intent: "refactor",
    visibility: "internal",
    risks: decided.risks,
    confidence: { kind: 1, intent: 1, visibility: 1, risks: 1 },
    source: { kind: "rule", intent: "rule", visibility: "rule", risks: "rule" },
  };
}
