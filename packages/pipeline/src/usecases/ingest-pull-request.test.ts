import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import { snapshotOf } from "@star-catch/testkit";
import { describe, expect, it, vi } from "vitest";
import type { IngestJob } from "../jobs/queues.js";
import type { PullRequestRef } from "../ports/pull-request-source.js";
import type { SnapshotStore } from "../ports/snapshot-store.js";
import { ingestPullRequest } from "./ingest-pull-request.js";

class MemorySnapshots implements SnapshotStore {
  readonly saved: PullRequestSnapshot[] = [];
  async has(fullName: string, headSha: string) {
    return this.saved.some((s) => s.fullName.toLowerCase() === fullName.toLowerCase() && s.headSha === headSha);
  }
  async save(snapshot: PullRequestSnapshot) {
    if (!(await this.has(snapshot.fullName, snapshot.headSha))) this.saved.push(snapshot);
  }
  async find() {
    return null;
  }
}

const HEAD = "a".repeat(40);
const job = (overrides: Partial<IngestJob> = {}): IngestJob => ({
  deliveryId: "d-1",
  fullName: "acme/shop",
  number: 7,
  headSha: HEAD,
  installationId: 42,
  draft: false,
  author: { login: "ada", type: "User" },
  ...overrides,
});

function setUp(enabled = ["acme/shop"]) {
  const snapshots = new MemorySnapshots();
  const snapshot = vi.fn(async (ref: PullRequestRef) => snapshotOf(ref, { headSha: HEAD, installationId: ref.installationId ?? null }));
  const deps = {
    settings: { isEnabled: async (fullName: string) => enabled.includes(fullName.toLowerCase()) },
    snapshots,
    source: { snapshot },
    queue: { send: vi.fn(async () => true) },
  };
  return { deps, snapshots, snapshot, send: deps.queue.send };
}

describe("ingestPullRequest", () => {
  it("snapshots through the job's installation, stores the result and queues its catch", async () => {
    const { deps, snapshots, snapshot, send } = setUp();
    expect(await ingestPullRequest(deps, job())).toBe("stored");
    expect(snapshot).toHaveBeenCalledWith({ fullName: "acme/shop", number: 7, installationId: 42 });
    expect(snapshots.saved).toHaveLength(1);
    expect(send).toHaveBeenCalledWith("star-catch.generate", { fullName: "acme/shop", number: 7, headSha: HEAD }, { singletonKey: `acme/shop@${HEAD}` });
  });

  it("snapshots a head commit once", async () => {
    const { deps, snapshot, send } = setUp();
    await ingestPullRequest(deps, job());
    expect(await ingestPullRequest(deps, job({ deliveryId: "d-2" }))).toBe("duplicate");
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["repo-disabled", job({ fullName: "acme/other" })],
    ["draft", job({ draft: true })],
    ["bot", job({ author: { login: "dependabot[bot]", type: "Bot" } })],
    ["bot", job({ author: { login: "renovate[bot]", type: "User" } })],
    ["invalid", { deliveryId: "d-1" }],
  ])("skips with %s", async (outcome, data) => {
    const { deps, snapshot, snapshots, send } = setUp();
    expect(await ingestPullRequest(deps, data)).toBe(outcome);
    expect(snapshot).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(snapshots.saved).toEqual([]);
  });

  it("lets a GitHub failure through, so the queue retries the job", async () => {
    const { deps } = setUp();
    deps.source.snapshot.mockRejectedValueOnce(new Error("GitHub timed out"));
    await expect(ingestPullRequest(deps, job())).rejects.toThrow("GitHub timed out");
  });
});
