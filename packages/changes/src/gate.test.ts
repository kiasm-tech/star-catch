import { expectChangesMatch, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { toAnalyzeInput } from "./input.js";

/** Synthetic fixtures whose expected units and exclusions the analysis must already reproduce. */
const PASSING: string[] = ["04-lockfile-only"];

const fixtures = loadSyntheticFixtures();

describe("fixture gate", () => {
  it("only lists fixtures that exist", () => {
    const names = new Set(fixtures.map((f) => f.name));
    expect(PASSING.filter((name) => !names.has(name))).toEqual([]);
  });

  it.each(fixtures.filter((f) => PASSING.includes(f.name)).map((f) => [f.name, f] as const))(
    "%s",
    async (_name, { snapshot, expected }) => {
      expectChangesMatch(await analyze(toAnalyzeInput(snapshot)), expected);
    },
  );
});
