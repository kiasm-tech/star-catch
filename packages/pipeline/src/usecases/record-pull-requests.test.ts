import { describe, expect, it } from "vitest";
import type { FixtureWriter, Recording } from "../ports/fixtures.js";
import type { PullRequestSource } from "../ports/pull-request-source.js";
import { recordPullRequests } from "./record-pull-requests.js";
import { snapshotOf } from "@star-catch/testkit";

describe("recordPullRequests", () => {
  it("stores each snapshot with an opened payload at its head commit", async () => {
    const saved: Recording[] = [];
    const source: PullRequestSource = { snapshot: async (ref) => snapshotOf(ref, { truncated: ref.number === 2 }) };
    const writer: FixtureWriter = { saveRecording: async (r) => void saved.push(r) };

    const result = await recordPullRequests({ source, writer }, [
      { fullName: "Acme/API", number: 1 },
      { fullName: "Acme/API", number: 2 },
    ]);

    expect(result).toEqual([
      { id: "acme__api__1", files: 1, commits: 1, truncated: false },
      { id: "acme__api__2", files: 1, commits: 1, truncated: true },
    ]);
    expect(saved.map((r) => r.id)).toEqual(["acme__api__1", "acme__api__2"]);
    expect(saved[0]?.webhook).toMatchObject({
      action: "opened",
      number: 1,
      repository: { full_name: "Acme/API", name: "API", owner: { login: "Acme" } },
      pull_request: { head: { sha: "b".repeat(40) } },
    });
  });

  it("stops at the first pull request it can't snapshot", async () => {
    const source: PullRequestSource = {
      snapshot: async (ref) => {
        if (ref.number === 2) throw new Error("Not Found");
        return snapshotOf(ref);
      },
    };
    const saved: string[] = [];
    const writer: FixtureWriter = { saveRecording: async (r) => void saved.push(r.id) };
    await expect(
      recordPullRequests({ source, writer }, [
        { fullName: "acme/api", number: 1 },
        { fullName: "acme/api", number: 2 },
      ]),
    ).rejects.toThrow("Not Found");
    expect(saved).toEqual(["acme__api__1"]);
  });
});
