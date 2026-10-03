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

  it("lists what it analyses and what it sets aside, in input order", async () => {
    const file = (path: string, head = "export const a = 1;\n") => ({ path, status: "modified" as const, base: head, head });
    const changes = await analyze({
      files: [
        file("src/cart.ts"),
        file("pnpm-lock.yaml"),
        file("config/flags.json"),
        file("assets/logo.png", "\u0000"),
        file("tests/cart.test.ts"),
      ],
    });
    expect(changes.files).toEqual([
      { path: "src/cart.ts", language: "typescript", fileClass: "source", engine: "code", degraded: false },
      { path: "config/flags.json", language: "json", fileClass: "config", engine: "structured", degraded: false },
      { path: "tests/cart.test.ts", language: "typescript", fileClass: "test", engine: "code", degraded: false },
    ]);
    expect(changes.excluded).toEqual([
      { file: "pnpm-lock.yaml", reason: "lockfile" },
      { file: "assets/logo.png", reason: "binary" },
    ]);
  });

  it("rejects input that isn't an analysis input", async () => {
    const input = { files: [{ path: "a.ts", status: "copied" }] } as unknown as AnalyzeInput;
    await expect(analyze(input)).rejects.toThrow(/status/);
  });
});
