import { describe, expect, it } from "vitest";
import { analyze } from "../analyze.js";
import { applyClasses, applyLabels, classifyItems } from "./labels.js";
import { mockClassifier } from "./mock.js";
import type { UnitItem } from "./schema.js";

const item = (fields: Partial<UnitItem>): UnitItem => ({
  type: "unit",
  id: "src/a.ts#f",
  path: "src/a.ts",
  language: "typescript",
  fileClass: "source",
  unitKind: "declaration",
  changeType: "bodyChanged",
  name: "f",
  siblings: [],
  references: [],
  exported: false,
  title: "fix: f",
  decided: { risks: [] },
  ...fields,
});

const classify = async (fields: Partial<UnitItem>) => (await mockClassifier.classify([item(fields)]))[0];

describe("mockClassifier", () => {
  it.each([
    ["feat(cart): add totals", "feature"],
    ["fix: rounding", "fix"],
    ["perf!: faster", "performance"],
    ["chore: bump", "maintenance"],
    ["Update the README", "maintenance"],
  ])("takes the intent of %j from its conventional prefix", async (title, intent) => {
    expect(await classify({ title })).toMatchObject({ intent });
  });

  it.each<[Partial<UnitItem>, string]>([
    [{ entryPoint: "page" }, "user"],
    [{ entryPoint: "apiRoute" }, "apiConsumer"],
    [{ entryPoint: "job" }, "operator"],
    [{ exported: true }, "apiConsumer"],
    [{}, "internal"],
  ])("visibility of %j", async (fields, visibility) => {
    expect(await classify(fields)).toMatchObject({ visibility });
  });

  it("decides a kind only when the rules didn't, and flags a breaking title and security paths", async () => {
    expect(await classify({ decided: { kind: "test", risks: [] } })).not.toHaveProperty("kind");
    expect(await classify({ path: "src/types/orders.ts" })).toMatchObject({ kind: "interface" });
    expect(await classify({ path: "app/api/orders/route.ts" })).toMatchObject({ kind: "logic" });
    expect(await classify({ title: "feat!: drop v1", path: "src/auth/login.ts" })).toMatchObject({ breaking: true, securitySensitive: true });
  });

  it.each([
    ["Customers never got the discount.", "problem"],
    ["The invoice email needs the same total.", "problem"],
    ["The name did not say which tax it adds.", "problem"],
    ["Cart.total mixed summing with discounts.", "problem"],
    ["OrderService was doing its own formatting.", "problem"],
    ["Marketing is lowering the threshold for the autumn campaign.", "rationale"],
    ["This lowers the threshold so the discount applies.", "rationale"],
    ["This moves the sum out so both can share it.", "rationale"],
    ["Run the migration before deploying.", "instruction"],
    ["The cart now rounds up.", "behaviour"],
    ["Thanks!", "noise"],
  ])("classes %j as %s", async (text, sentenceClass) => {
    const [result] = await mockClassifier.classify([{ type: "sentence", id: "description:0", origin: "description", text, title: "" }]);
    expect(result).toMatchObject({ class: sentenceClass });
  });

  it("classes a commit subject as behaviour", async () => {
    const [result] = await mockClassifier.classify([{ type: "sentence", id: "commit:abc1234:0", origin: "commit:abc1234", text: "fix: the crash", title: "" }]);
    expect(result).toMatchObject({ class: "behaviour" });
  });
});

describe("classifyItems and applyLabels", () => {
  const files = [
    { path: "src/a.ts", status: "modified" as const, base: "export function f() {\n  return 1;\n}\nfunction g() {\n    return 1;\n}\n", head: "export function f() {\n  return 2;\n}\nfunction g() {\n  return 1;\n}\n" },
  ];

  it("sends behavioural units and sentences, never unchanged ones", async () => {
    const changes = await analyze({ files });
    const items = classifyItems(changes, [{ id: "description:0", origin: "description", text: "Fixes f.", numbers: [] }], "fix: f");
    expect(items.map((i) => `${i.type} ${i.id}`)).toEqual(["unit src/a.ts#f", "sentence description:0"]);
    expect(items[0]).toMatchObject({ exported: true, siblings: ["g"], title: "fix: f" });
  });

  it("leaves a behavioural unit unlabelled without a result, and classes sentences it has results for", async () => {
    const changes = await analyze({ files });
    expect(applyLabels(changes, []).map((u) => u.labels)).toEqual([undefined, undefined]);
    const sentences = [{ id: "description:0", origin: "description" as const, text: "x", numbers: [] }];
    expect(applyClasses(sentences, [{ type: "sentence", id: "description:0", class: "noise", confidence: 1 }])[0].class).toBe("noise");
    expect(applyClasses(sentences, [])[0]).not.toHaveProperty("class");
  });
});
