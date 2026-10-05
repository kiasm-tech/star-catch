import { catchIdOf, type CatchVersion } from "@kiasm-tech/star-catch-contracts";
import { loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it, vi } from "vitest";
import { mockClassifier } from "../classifier.js";
import type { ScriptWriter } from "../ports/script-writer.js";
import { templateWriter } from "../script/template-writer.js";
import { generateCatch } from "./generate-catch.js";

const { snapshot } = loadSyntheticFixtures()[0]!;
const job = { fullName: snapshot.fullName, number: snapshot.number, headSha: snapshot.headSha };

function setUp({ enabled = true, stored = true, writer = templateWriter }: { enabled?: boolean; stored?: boolean; writer?: ScriptWriter } = {}) {
  const saved: { version: CatchVersion; headSha: string }[] = [];
  const runs = { start: vi.fn(async () => 1), finish: vi.fn(async () => {}) };
  const deps = {
    settings: { isEnabled: async () => enabled },
    snapshots: { has: async () => stored, save: async () => {}, find: async () => (stored ? snapshot : null) },
    catches: { save: async (version: CatchVersion, headSha: string) => void saved.push({ version, headSha }), latest: async () => null, list: async () => [] },
    runs,
    ports: { classifier: mockClassifier, writer },
  };
  return { deps, saved, runs };
}

describe("generateCatch", () => {
  it("builds the stored snapshot's catch, saves it under the head commit and records the run", async () => {
    const { deps, saved, runs } = setUp();
    expect(await generateCatch(deps, job)).toBe("generated");
    expect(saved).toEqual([{ version: expect.objectContaining({ catchId: catchIdOf(snapshot.fullName, snapshot.number) }), headSha: snapshot.headSha }]);
    expect(runs.start).toHaveBeenCalledWith(job);
    expect(runs.finish).toHaveBeenCalledWith(1, { status: "done", step: "save" });
  });

  it.each([
    ["repo-disabled", { enabled: false }, job],
    ["no-snapshot", { stored: false }, job],
    ["invalid", {}, { fullName: "nope" }],
  ] as const)("skips with %s, without a run", async (outcome, options, data) => {
    const { deps, saved, runs } = setUp(options);
    expect(await generateCatch(deps, data)).toBe(outcome);
    expect(saved).toEqual([]);
    expect(runs.start).not.toHaveBeenCalled();
  });

  it("records where a failure stopped and lets it through for a retry", async () => {
    const { deps, runs } = setUp();
    deps.catches.save = async () => {
      throw new Error("database gone");
    };
    await expect(generateCatch(deps, job)).rejects.toThrow("database gone");
    expect(runs.finish).toHaveBeenCalledWith(1, { status: "failed", step: "save", error: "database gone" });
  });
});
