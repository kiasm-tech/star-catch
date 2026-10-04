import type { Risk, Sentence, UnitLabels } from "@kiasm-tech/star-catch-contracts";
import { untested } from "../links.js";
import type { ChangeSet, Unit } from "../schema.js";
import { ruleLabels, structuralLabels } from "./rules.js";
import type { ClassifyItem, ClassifyResult, UnitItem } from "./schema.js";

/** Whether other code can reach the unit: exported in TS/JS, public in Java, not `_private` in Python. */
function exported(unit: Unit): boolean {
  const code = unit.after ?? unit.before ?? "";
  if (unit.language === "python") return !unit.name.split(".").at(-1)!.startsWith("_");
  if (unit.language === "java") return /\bpublic\b/.test(code.split("{")[0]);
  return /^export\b/.test(code);
}

/** What the classifier sees: behavioural units and every sentence. Structural and unchanged units never reach it. */
export function classifyItems(changes: ChangeSet, sentences: Sentence[], title: string): ClassifyItem[] {
  const entryPoints = new Map(changes.entryPoints.map((e) => [e.unitId, e.type]));
  const units: UnitItem[] = changes.units
    .filter((u) => u.verdict === "behavioural")
    .map((u) => ({
      type: "unit",
      id: u.id,
      path: u.file,
      language: u.language,
      fileClass: u.fileClass,
      unitKind: u.unitKind,
      changeType: u.changeType,
      name: u.name,
      ...(u.before !== undefined && { before: u.before }),
      ...(u.after !== undefined && { after: u.after }),
      siblings: changes.units.filter((o) => o.file === u.file && o.id !== u.id).map((o) => o.name),
      references: u.references,
      exported: exported(u),
      ...(entryPoints.has(u.id) && { entryPoint: entryPoints.get(u.id) }),
      title,
      decided: ruleLabels(u),
    }));
  return [...units, ...sentences.map((s) => ({ type: "sentence" as const, id: s.id, origin: s.origin, text: s.text, title }))];
}

/**
 * Labels on every unit that can have them: structural ones by rule; behavioural ones by rule and
 * classifier together, with `untested` from links. A behavioural unit without a result stays
 * unlabelled, since a label needs every axis.
 */
export function applyLabels(changes: ChangeSet, results: ClassifyResult[]): Unit[] {
  const byId = new Map(results.filter((r) => r.type === "unit").map((r) => [r.id, r]));
  return changes.units.map((unit) => {
    if (unit.verdict === "notAChange") return unit;
    if (unit.verdict === "structural") return { ...unit, labels: structuralLabels(unit) };
    const result = byId.get(unit.id);
    if (!result || result.type !== "unit") return unit;
    const decided = ruleLabels(unit);
    const kind = decided.kind ?? result.kind;
    if (!kind) return unit;
    const risks = new Set<Risk>(decided.risks);
    if (result.breaking) risks.add("breaking");
    if (result.securitySensitive) risks.add("securitySensitive");
    if (untested(unit, kind, changes.links)) risks.add("untested");
    const labels: UnitLabels = {
      kind,
      intent: decided.intent ?? result.intent,
      visibility: decided.visibility ?? result.visibility,
      risks: [...risks],
      confidence: {
        kind: decided.kind ? 1 : (result.confidence.kind ?? 0),
        intent: decided.intent ? 1 : result.confidence.intent,
        visibility: decided.visibility ? 1 : result.confidence.visibility,
        risks: result.confidence.risks,
      },
      source: {
        kind: decided.kind ? "rule" : "model",
        intent: decided.intent ? "rule" : "model",
        visibility: decided.visibility ? "rule" : "model",
        risks: "model",
      },
    };
    return { ...unit, labels };
  });
}

/** Sentences with the class the classifier gave them. */
export function applyClasses(sentences: Sentence[], results: ClassifyResult[]): Sentence[] {
  const byId = new Map(results.filter((r) => r.type === "sentence").map((r) => [r.id, r]));
  return sentences.map((s) => {
    const result = byId.get(s.id);
    return result?.type === "sentence" ? { ...s, class: result.class } : s;
  });
}
