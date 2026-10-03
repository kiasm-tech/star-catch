import { loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { analyze } from "../analyze.js";
import { toAnalyzeInput } from "../input.js";
import type { Unit } from "../schema.js";
import { ruleLabels, structuralLabels } from "./rules.js";

async function fixtureUnits(name: string): Promise<Unit[]> {
  const fixture = loadSyntheticFixtures().find((f) => f.name === name)!;
  return (await analyze(toAnalyzeInput(fixture.snapshot))).units;
}

const unit = (fields: Partial<Unit>): Unit => ({
  id: "src/a.ts#f",
  file: "src/a.ts",
  name: "f",
  unitKind: "declaration",
  language: "typescript",
  verdict: "behavioural",
  changeType: "bodyChanged",
  refactorings: [],
  component: "src",
  fileClass: "source",
  span: {},
  references: [],
  ...fields,
});

describe("ruleLabels", () => {
  it("decides the kinds and risks the fixtures expect", async () => {
    const decided = async (name: string) => (await fixtureUnits(name)).map((u) => [u.name, ruleLabels(u)]);
    expect(await decided("06-config-key")).toEqual([["expressShipping", { kind: "configuration", risks: [] }]]);
    expect(await decided("07-migration")).toEqual([["orders.gift_note", { kind: "data", risks: ["dataMigration"] }]]);
    expect(await decided("08-ui-with-test")).toEqual([
      ["BillingPage", { kind: "ui", risks: [] }],
      ["BillingPage > explains when the plan renews", { kind: "test", risks: [] }],
    ]);
  });

  it.each<[string, Partial<Unit>, string | undefined]>([
    ["a test file's unit", { fileClass: "test" }, "test"],
    ["a dependency", { unitKind: "dependency", fileClass: "manifest" }, "dependency"],
    ["the rest of a manifest", { unitKind: "file", fileClass: "manifest" }, "dependency"],
    ["a doc section", { unitKind: "docSection", fileClass: "docs" }, "documentation"],
    ["a workflow file", { unitKind: "file", fileClass: "buildCi" }, "buildCi"],
    ["a TSX component", { language: "tsx", after: "export const B = () => <span />;" }, "ui"],
    ["a JSX component", { file: "src/a.jsx", language: "javascript", after: "function A() {\n  return (\n    <div/>\n  );\n}" }, "ui"],
    ["a TSX helper that returns no JSX", { language: "tsx", after: "export function f(a: number) { return a < b; }" }, undefined],
    ["plain logic", {}, undefined],
  ])("kind of %s", (_case, fields, kind) => {
    expect(ruleLabels(unit(fields)).kind).toBe(kind);
  });

  it("only calls a schema entity in a migration folder a data migration", () => {
    expect(ruleLabels(unit({ unitKind: "schemaEntity", file: "db/migrations/1.sql", fileClass: "schema" })).risks).toEqual(["dataMigration"]);
    expect(ruleLabels(unit({ unitKind: "schemaEntity", file: "queries/report.sql", fileClass: "schema" })).risks).toEqual([]);
  });

  it("gives structural units the refactor intent and leaves the rest open for behavioural ones", () => {
    expect(ruleLabels(unit({ verdict: "structural" }))).toEqual({ intent: "refactor", risks: [] });
    expect(ruleLabels(unit({}))).toEqual({ risks: [] });
  });
});

describe("structuralLabels", () => {
  it("decides every axis by rule", async () => {
    const [renamed] = await fixtureUnits("03-rename-only");
    expect(structuralLabels(renamed)).toEqual({
      kind: "logic",
      intent: "refactor",
      visibility: "internal",
      risks: [],
      confidence: { kind: 1, intent: 1, visibility: 1, risks: 1 },
      source: { kind: "rule", intent: "rule", visibility: "rule", risks: "rule" },
    });
    expect(structuralLabels(unit({ verdict: "structural", fileClass: "test" })).kind).toBe("test");
  });
});
