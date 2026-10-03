import { describe, expect, it } from "vitest";
import { ClassifyItemSchema, ClassifyResultSchema } from "./schema.js";

const unit = {
  type: "unit",
  id: "src/a.ts#f",
  path: "src/a.ts",
  language: "typescript",
  fileClass: "source",
  unitKind: "declaration",
  changeType: "conditionChanged",
  name: "f",
  after: "function f() {}",
  siblings: [],
  references: [],
  exported: true,
  title: "fix: f",
  decided: { risks: [] },
};

describe("classifier schemas", () => {
  it("accepts units and sentences", () => {
    expect(ClassifyItemSchema.parse(unit)).toEqual(unit);
    const sentence = { type: "sentence", id: "description:0", origin: "description", text: "It broke.", title: "fix: f" };
    expect(ClassifyItemSchema.parse(sentence)).toEqual(sentence);
  });

  it("refuses a label outside its set", () => {
    const result = {
      type: "unit",
      id: "src/a.ts#f",
      intent: "fix",
      visibility: "user",
      breaking: false,
      securitySensitive: false,
      confidence: { intent: 0.9, visibility: 0.8, risks: 0.7 },
    };
    expect(ClassifyResultSchema.safeParse(result).success).toBe(true);
    expect(ClassifyResultSchema.safeParse({ ...result, intent: "cleanup" }).success).toBe(false);
    expect(ClassifyResultSchema.safeParse({ type: "sentence", id: "d:0", class: "complaint", confidence: 1 }).success).toBe(false);
  });
});
