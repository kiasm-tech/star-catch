import { expectChangesMatch, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, it } from "vitest";
import { analyze } from "./analyze.js";
import { toAnalyzeInput } from "./input.js";

describe("fixture gate", () => {
  it.each(loadSyntheticFixtures().map((f) => [f.name, f] as const))("%s", async (_name, { snapshot, expected }) => {
    expectChangesMatch(await analyze(toAnalyzeInput(snapshot)), expected);
  });
});
