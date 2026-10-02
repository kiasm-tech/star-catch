import type { FixtureReader } from "@star-catch/pipeline";
import { describe, expect, it } from "vitest";
import { snapshotOf } from "@star-catch/testkit";
import { RecordedPullRequestSource } from "./pull-request-source.mock.js";

const recorded = snapshotOf({ fullName: "pmndrs/zustand", number: 3469 });
const fixtures: FixtureReader = {
  recordedSnapshots: async () => [{ name: "pmndrs__zustand__3469.json", data: recorded }],
  recordedWebhooks: async () => [],
  syntheticFixtures: async () => [],
};

describe("RecordedPullRequestSource", () => {
  it("serves a recorded snapshot, matching the repo name case-insensitively", async () => {
    const source = new RecordedPullRequestSource(fixtures);
    expect(await source.snapshot({ fullName: "PMNDRS/Zustand", number: 3469 })).toEqual(recorded);
  });

  it("says how to record a pull request it doesn't have", async () => {
    const source = new RecordedPullRequestSource(fixtures);
    await expect(source.snapshot({ fullName: "pmndrs/zustand", number: 1 })).rejects.toThrow(
      /No recorded snapshot for pmndrs\/zustand#1/,
    );
  });
});
