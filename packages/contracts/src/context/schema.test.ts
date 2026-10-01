import { describe, expect, it } from "vitest";
import { LABEL_SET_VERSION } from "./labels.js";
import { ContextExpectationSchema, ContextSchema, type Context } from "./schema.js";

const UNIT = "src/pricing/discount.ts#bulkDiscount";
const TEST_UNIT = "src/pricing/discount.test.ts#discount.test.ts";

function validContext(): Context {
  return {
    version: 1,
    labelSetVersion: LABEL_SET_VERSION,
    pr: { fullName: "acme/shop", number: 105, headSha: "a".repeat(40) },
    degraded: false,
    truncated: false,
    units: [
      {
        id: UNIT,
        file: "src/pricing/discount.ts",
        name: "bulkDiscount",
        unitKind: "declaration",
        language: "typescript",
        verdict: "behavioural",
        changeType: "conditionChanged",
        refactorings: [],
        component: "pricing",
        before: "if (quantity >= 10) {",
        after: "if (quantity >= 5) {",
        labels: {
          kind: "logic",
          intent: "fix",
          visibility: "user",
          risks: [],
          confidence: { kind: 1, intent: 0.8, visibility: 0.7, risks: 1 },
          source: { kind: "rule", intent: "model", visibility: "model", risks: "rule" },
        },
      },
      {
        id: TEST_UNIT,
        file: "src/pricing/discount.test.ts",
        name: "discount.test.ts",
        unitKind: "file",
        language: "typescript",
        verdict: "behavioural",
        changeType: "bodyChanged",
        refactorings: [],
        component: "pricing",
      },
    ],
    links: [{ from: TEST_UNIT, to: UNIT, type: "covers" }],
    entryPoints: [{ unitId: UNIT, type: "exportedApi" }],
    concerns: [{ id: "c1", unitIds: [UNIT, TEST_UNIT], importance: 2, rank: 1 }],
    sentences: [
      {
        id: "description:0",
        origin: "description",
        text: "Orders of 5 to 9 units got no discount.",
        class: "problem",
        numbers: ["5", "9"],
      },
      { id: "issue#12:0", origin: "issue#12", text: "Discount missing.", numbers: [] },
      { id: "commit:abcdef0:0", origin: "commit:abcdef0", text: "fix: threshold", numbers: [] },
    ],
    facts: [
      { group: "rules", key: "threshold", value: ["10", "5"], sources: [UNIT] },
      {
        group: "intent",
        key: "problem",
        value: "Orders of 5 to 9 units got no discount.",
        sources: ["description:0"],
      },
      { group: "quality", key: "covered", value: true, sources: [TEST_UNIT] },
    ],
    excluded: [{ file: "pnpm-lock.yaml", reason: "lockfile" }],
  };
}

function issuesOf(context: unknown) {
  const result = ContextSchema.safeParse(context);
  expect(result.success).toBe(false);
  return result.error!.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

describe("ContextSchema", () => {
  it("accepts a valid context", () => {
    expect(ContextSchema.parse(validContext())).toEqual(validContext());
  });

  it("rejects a label outside its set", () => {
    const context = validContext() as unknown as { units: { labels: { kind: string } }[] };
    context.units[0].labels.kind = "business";
    expect(issuesOf(context)[0].path).toBe("units.0.labels.kind");
  });

  it("rejects a fact with no sources", () => {
    const context = validContext();
    context.facts[0].sources = [];
    expect(issuesOf(context)[0].path).toBe("facts.0.sources");
  });

  it("rejects a link to a missing unit and reports its path", () => {
    const context = validContext();
    context.links[0].to = "src/gone.ts#gone";
    expect(issuesOf(context)).toEqual([
      { path: "links.0.to", message: "unknown unit src/gone.ts#gone" },
    ]);
  });

  it("rejects references to missing units or sentences elsewhere", () => {
    const context = validContext();
    context.entryPoints[0].unitId = "x#y";
    context.concerns[0].unitIds.push("x#z");
    context.facts[1].sources = ["description:9"];
    expect(issuesOf(context).map((i) => i.path)).toEqual([
      "entryPoints.0.unitId",
      "concerns.0.unitIds.2",
      "facts.1.sources.0",
    ]);
  });

  it("rejects a confidence outside 0–1", () => {
    const context = validContext();
    context.units[0].labels!.confidence.intent = 1.2;
    expect(issuesOf(context)[0].path).toBe("units.0.labels.confidence.intent");
  });

  it("rejects duplicate ids and an id that is not file#name", () => {
    const duplicated = validContext();
    duplicated.units.push({ ...duplicated.units[0] });
    expect(issuesOf(duplicated)).toEqual([{ path: "units.2.id", message: `duplicate id ${UNIT}` }]);

    const misnamed = validContext();
    misnamed.units[0].name = "other";
    expect(issuesOf(misnamed).map((i) => i.path)).toEqual(["units.0.id"]);
  });

  it("rejects code over the size cap and an unknown sentence origin", () => {
    const context = validContext() as unknown as {
      units: { after: string }[];
      sentences: { origin: string }[];
    };
    context.units[0].after = "x".repeat(2_001);
    context.sentences[1].origin = "issue#abc";
    expect(issuesOf(context).map((i) => i.path)).toEqual(["units.0.after", "sentences.1.origin"]);
  });
});

describe("ContextExpectationSchema", () => {
  it("accepts a sparse expectation", () => {
    const expectation = {
      units: [{ id: UNIT, verdict: "behavioural", labels: { kind: "logic" } }],
    };
    expect(() => ContextExpectationSchema.parse(expectation)).not.toThrow();
  });

  it("applies the same reference checks to what it states", () => {
    const result = ContextExpectationSchema.safeParse({
      units: [{ id: UNIT }],
      links: [{ from: TEST_UNIT, to: UNIT }],
    });
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual(["links.0.from"]);
  });

  it("still rejects unknown labels", () => {
    const result = ContextExpectationSchema.safeParse({ units: [{ verdict: "maybe" }] });
    expect(result.success).toBe(false);
  });
});
