import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR, loadRecordedSnapshots, loadSyntheticFixtures } from "./fixtures.js";

describe("fixture loaders", () => {
  it("load every synthetic fixture, sorted, parsed against the contracts", () => {
    const fixtures = loadSyntheticFixtures();
    const dirs = readdirSync(path.join(FIXTURES_DIR, "synthetic"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(fixtures).toHaveLength(15);
    expect(fixtures.map((f) => f.name)).toEqual(dirs);
  });

  it("load every recorded snapshot", () => {
    expect(loadRecordedSnapshots().length).toBeGreaterThan(0);
  });
});
