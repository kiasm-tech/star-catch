import { loadRecordedSnapshots, loadSyntheticFixtures } from "@star-catch/testkit";
import { beforeAll, describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { toAnalyzeInput } from "./input.js";
import type { ChangeSet } from "./schema.js";

const recorded = loadRecordedSnapshots();
const withoutTimings = ({ timings: _timings, ...rest }: ChangeSet) => rest;

describe("recorded pull requests", () => {
  beforeAll(async () => {
    // Loads the WASM runtime and grammars once, so the timings below are per PR.
    for (const snapshot of recorded) await analyze(toAnalyzeInput(snapshot));
  });

  it.each(recorded.map((s) => [`${s.fullName}#${s.number}`, s] as const))(
    "%s analyses every file with its engine, within 1 s",
    async (_name, snapshot) => {
      const started = performance.now();
      const changes = await analyze(toAnalyzeInput(snapshot));
      expect(performance.now() - started).toBeLessThan(1_000);
      expect(changes.files.filter((f) => f.engine === "lines" || f.degraded)).toEqual([]);
      expect(changes.units.length).toBeGreaterThan(0);
    },
  );
});

describe("determinism", () => {
  const all = [...loadSyntheticFixtures().map((f) => [f.name, f.snapshot] as const), ...recorded.map((s) => [`${s.fullName}#${s.number}`, s] as const)];

  it.each(all)("%s: the same input gives the same change set", async (_name, snapshot) => {
    const once = withoutTimings(await analyze(toAnalyzeInput(snapshot)));
    const twice = withoutTimings(await analyze(toAnalyzeInput(snapshot)));
    expect(twice).toEqual(once);
  });
});
