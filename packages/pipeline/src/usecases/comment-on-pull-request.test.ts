import { loadRecordedSnapshots } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { mockClassifier } from "../classifier.js";
import { COMMENT_MARKER } from "../comment/body.js";
import type { PullRequestComments } from "../ports/pull-request-comments.js";
import { templateWriter } from "../script/template-writer.js";
import { buildCatch } from "./build-catch.js";
import { commentOnPullRequest } from "./comment-on-pull-request.js";

const snapshot = loadRecordedSnapshots().find((s) => s.number === 3555)!;
const version = await buildCatch(snapshot, { classifier: mockClassifier, writer: templateWriter });
const job = { fullName: snapshot.fullName, number: snapshot.number, headSha: snapshot.headSha, installationId: 42 };

function setUp({ enabled = true, stored = version as unknown }: { enabled?: boolean; stored?: unknown } = {}) {
  const written: { ref: object; marker: string; body: string }[] = [];
  const comments: PullRequestComments = {
    upsert: async (ref, marker, body) => {
      const created = !written.some((w) => w.marker === marker);
      written.push({ ref, marker, body });
      return created ? "created" : "updated";
    },
  };
  const deps = {
    settings: { isEnabled: async () => enabled },
    catches: { latest: async () => (stored === null ? null : { headSha: "f".repeat(40), generatedAt: new Date(), version: stored }) },
    comments,
    cruxUrl: "https://crux.example",
  };
  return { deps, written };
}

describe("commentOnPullRequest", () => {
  it("writes the latest catch into the app's comment through the PR's installation", async () => {
    const { deps, written } = setUp();
    expect(await commentOnPullRequest(deps, job)).toBe("created");
    expect(await commentOnPullRequest(deps, job)).toBe("updated");
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual({
      ref: { fullName: "pmndrs/zustand", number: 3555, installationId: 42 },
      marker: COMMENT_MARKER,
      body: expect.stringContaining("https://crux.example/star-catch/pmndrs__zustand__3555?cut=technical"),
    });
    // The stored version's commit, not the job's.
    expect(written[0]!.body).toContain("`fffffff`");
  });

  it.each([
    ["repo-disabled", { enabled: false }, job],
    ["no-catch", { stored: null }, job],
    ["no-video", { stored: { ...version, technical: null, business: null } }, job],
    ["invalid", {}, { ...job, installationId: undefined }],
  ] as const)("writes nothing with %s", async (outcome, options, data) => {
    const { deps, written } = setUp(options);
    expect(await commentOnPullRequest(deps, data)).toBe(outcome);
    expect(written).toEqual([]);
  });
});
