import { FACT_GROUPS, type ChangeUnit, type Kind, type Risk, type Sentence, type Visibility } from "@kiasm-tech/star-catch-contracts";
import { describe, expect, it } from "vitest";
import { factsOf } from "./facts.js";

type Fields = Partial<ChangeUnit> & { kind?: Kind; visibility?: Visibility; risks?: Risk[] };

const unit = (name: string, fields: Fields = {}): ChangeUnit => {
  const { kind = "logic", visibility = "internal", risks = [], ...rest } = fields;
  return {
    id: `src/a.ts#${name}`,
    file: "src/a.ts",
    name,
    unitKind: "declaration",
    language: "typescript",
    verdict: "behavioural",
    changeType: "bodyChanged",
    refactorings: [],
    component: "src",
    labels: {
      kind,
      intent: "fix",
      visibility,
      risks,
      confidence: { kind: 1, intent: 1, visibility: 1, risks: 1 },
      source: { kind: "rule", intent: "rule", visibility: "rule", risks: "rule" },
    },
    ...rest,
  };
};

const id = (name: string) => `src/a.ts#${name}`;

const sentence = (index: number, text: string, cls: Sentence["class"], numbers: string[] = []): Sentence => ({
  id: `description:${index}`,
  origin: "description",
  text,
  ...(cls && { class: cls }),
  numbers,
});

const facts = (input: Partial<Parameters<typeof factsOf>[0]>) => factsOf({ units: [], links: [], entryPoints: [], concerns: [], sentences: [], ...input });
const keyed = (input: Partial<Parameters<typeof factsOf>[0]>) => facts(input).map((f) => [`${f.group}.${f.key}`, f.value, f.sources]);

describe("factsOf", () => {
  it("lists facts in group order, every one with a source", () => {
    const units = [
      unit("Page", { kind: "ui", visibility: "user", component: "app" }),
      unit("price", { changeType: "conditionChanged", visibility: "apiConsumer", risks: ["untested"] }),
      unit("flag", { kind: "configuration", changeType: "added", component: "config", risks: ["gated"] }),
      unit("Page > renders", { kind: "test", component: "app" }),
    ];
    const result = facts({
      units,
      links: [
        { from: id("Page"), to: id("price"), type: "calls" },
        { from: id("Page > renders"), to: id("Page"), type: "covers" },
      ],
      entryPoints: [{ unitId: id("Page"), type: "page" }],
      sentences: [sentence(0, "Prices were wrong for 5 items.", "problem", ["5"]), sentence(1, "Run the backfill after deploying.", "instruction")],
    });
    const order = result.map((f) => FACT_GROUPS.indexOf(f.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(result.every((f) => f.sources.length > 0)).toBe(true);
    expect(result.map((f) => `${f.group}.${f.key}`)).toEqual([
      "intent.problem",
      "shape.components",
      "shape.added",
      "interactions.entryPoints",
      "interactions.flow",
      "rules.conditionChanged",
      "users.screens",
      "rollout.config",
      "rollout.gated",
      "rollout.instruction",
      "quality.tests",
      "quality.covered",
      "quality.untested",
      "reach.callers",
      "evidence.numbers",
    ]);
  });

  it("follows calls from an entry point only when the path crosses components", () => {
    const units = [unit("handler", { component: "api" }), unit("rule", { component: "api" }), unit("store", { component: "db" })];
    const links = [
      { from: id("handler"), to: id("rule"), type: "calls" as const },
      { from: id("rule"), to: id("store"), type: "calls" as const },
    ];
    const entryPoints = [{ unitId: id("handler"), type: "apiRoute" as const }];
    expect(keyed({ units, links, entryPoints }).filter(([k]) => k === "interactions.flow")).toEqual([
      ["interactions.flow", ["handler", "rule", "store"], [id("handler"), id("rule"), id("store")]],
    ]);
    expect(keyed({ units: units.slice(0, 2), links: links.slice(0, 1), entryPoints }).map(([k]) => k)).not.toContain("interactions.flow");
  });

  it("calls a changed signature or interface a contract change, a changed condition a rule", () => {
    const units = [
      unit("total", { changeType: "signatureChanged", visibility: "apiConsumer" }),
      unit("Order", { kind: "interface" }),
      unit("discount", { changeType: "conditionChanged", visibility: "apiConsumer", risks: ["breaking"] }),
      unit("hidden", { changeType: "conditionChanged" }),
      unit("moved", { verdict: "structural", kind: "interface" }),
    ];
    expect(keyed({ units }).filter(([k]) => /^(contracts|rules)/.test(k as string))).toEqual([
      ["contracts.changed", ["total", "Order"], [id("total"), id("Order")]],
      ["contracts.breaking", ["discount"], [id("discount")]],
      ["rules.conditionChanged", ["discount"], [id("discount")]],
    ]);
  });

  it("counts an API route as a contract change only when its signature changed", () => {
    const units = [unit("GET"), unit("POST", { changeType: "signatureChanged" })];
    const entryPoints = [
      { unitId: id("GET"), type: "apiRoute" as const },
      { unitId: id("POST"), type: "apiRoute" as const },
    ];
    expect(keyed({ units, entryPoints }).find(([k]) => k === "contracts.changed")).toEqual(["contracts.changed", ["POST"], [id("POST")]]);
  });

  it("counts a migration's data-only statements as a migration, not a data change", () => {
    const units = [
      unit("usage", { kind: "data", unitKind: "schemaEntity", changeType: "added", risks: ["dataMigration"], after: "UPDATE usage SET subject = org_id;" }),
      unit("orders.note", { kind: "data", unitKind: "schemaEntity", changeType: "added", risks: ["dataMigration"], after: "ALTER TABLE orders ADD COLUMN note text;" }),
    ];
    expect(keyed({ units }).filter(([k]) => /^(data|rollout)/.test(k as string))).toEqual([
      ["data.added", ["orders.note"], [id("orders.note")]],
      ["rollout.migration", true, [id("usage"), id("orders.note")]],
    ]);
  });

  it("files data changes by change type and flags a migration", () => {
    const units = [
      unit("orders.note", { kind: "data", changeType: "added", risks: ["dataMigration"] }),
      unit("orders.legacy", { kind: "data", changeType: "removed", risks: ["dataMigration"] }),
    ];
    expect(keyed({ units }).filter(([k]) => /^(data|rollout)/.test(k as string))).toEqual([
      ["data.added", ["orders.note"], [id("orders.note")]],
      ["data.removed", ["orders.legacy"], [id("orders.legacy")]],
      ["rollout.migration", true, [id("orders.note"), id("orders.legacy")]],
    ]);
  });

  it("quotes intent sentences and takes evidence only from numbers written in sentences that aren't noise", () => {
    const sentences = [
      sentence(0, "Totals were off by 1 cent.", "problem", ["1"]),
      sentence(1, "So the receipt matches the invoice.", "rationale"),
      sentence(2, "Thanks to 2 reviewers!", "noise", ["2"]),
      sentence(3, "Retries 3 times.", undefined, ["3"]),
    ];
    expect(keyed({ sentences })).toEqual([
      ["intent.problem", "Totals were off by 1 cent.", ["description:0"]],
      ["intent.rationale", "So the receipt matches the invoice.", ["description:1"]],
      ["evidence.numbers", ["1"], ["description:0"]],
      ["evidence.numbers", ["3"], ["description:3"]],
    ]);
  });

  it("orders callers by the rank of the concern they call into", () => {
    const units = [unit("low"), unit("high"), unit("callsLow"), unit("callsHigh")];
    const links = [
      { from: id("callsLow"), to: id("low"), type: "calls" as const },
      { from: id("callsHigh"), to: id("high"), type: "calls" as const },
    ];
    const concerns = [
      { id: "concern-1", unitIds: [id("high"), id("callsHigh")], importance: 2, rank: 1 },
      { id: "concern-2", unitIds: [id("low"), id("callsLow")], importance: 1, rank: 2 },
    ];
    expect(keyed({ units, links, concerns }).find(([k]) => k === "reach.callers")?.[1]).toEqual(["callsHigh", "callsLow"]);
  });

  it("says nothing about unchanged units, and leaves test units out of the shape", () => {
    const units = [unit("same", { verdict: "notAChange", labels: undefined }), unit("t", { kind: "test", changeType: "added" })];
    expect(keyed({ units }).map(([k]) => k)).toEqual(["shape.components", "quality.tests"]);
  });
});
