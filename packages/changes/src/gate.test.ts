import { expectChangesMatch, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { toAnalyzeInput } from "./input.js";

/** Synthetic fixtures whose expected units and exclusions the analysis must already reproduce. */
const PASSING: string[] = [
  "01-formatting-only",
  "02-comment-only",
  "03-rename-only",
  "04-lockfile-only",
  "05-condition-change",
  "06-config-key",
  "08-ui-with-test",
  "09-ts-extract",
  "10-python-rename",
  "11-python-condition",
  "12-python-extract",
  "13-java-extract-move",
];

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
