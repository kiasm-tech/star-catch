import { loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { toAnalyzeInput } from "./input.js";
import { ChangeSetSchema, type AnalyzeInput } from "./schema.js";

describe("analyze", () => {
  it("returns a change set that matches the schema for every fixture", async () => {
    for (const { snapshot } of loadSyntheticFixtures()) {
      const changes = await analyze(toAnalyzeInput(snapshot));
      expect(ChangeSetSchema.parse(changes)).toEqual(changes);
    }
  });

  it("rejects input that isn't an analysis input", async () => {
    const input = { files: [{ path: "a.ts", status: "copied" }] } as unknown as AnalyzeInput;
    await expect(analyze(input)).rejects.toThrow(/status/);
  });
});
