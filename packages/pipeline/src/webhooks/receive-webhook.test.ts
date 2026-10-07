import { describe, expect, it } from "vitest";
import type { DeliveryStatus, DeliveryStore, WebhookDelivery } from "../ports/delivery-store.js";
import type { JobQueue } from "../ports/job-queue.js";
import { IngestJobSchema } from "../jobs/queues.js";
import { receiveWebhook } from "./receive-webhook.js";

class MemoryDeliveries implements DeliveryStore {
  readonly stored = new Map<string, WebhookDelivery>();
  readonly handled = new Set<string>();
  async add(delivery: WebhookDelivery): Promise<DeliveryStatus> {
    if (!this.stored.has(delivery.id)) {
      this.stored.set(delivery.id, delivery);
      return "new";
    }
    return this.handled.has(delivery.id) ? "handled" : "pending";
  }
  async markHandled(id: string): Promise<void> {
    this.handled.add(id);
  }
}

class MemoryQueue implements JobQueue {
  readonly sent: { queue: string; data: object; singletonKey?: string }[] = [];
  failNext = false;
  async send(queue: string, data: object, options: { singletonKey?: string } = {}): Promise<boolean> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("queue down");
    }
    this.sent.push({ queue, data, ...options });
    return true;
  }
  async drain(): Promise<number> {
    return 0;
  }
}

const opened = (overrides: Record<string, unknown> = {}) => ({
  action: "opened",
  installation: { id: 42 },
  repository: { full_name: "Acme/Shop" },
  pull_request: { number: 7, draft: false, user: { login: "ada", type: "User" }, head: { sha: "abc1234" } },
  ...overrides,
});

function setUp() {
  const deliveries = new MemoryDeliveries();
  const queue = new MemoryQueue();
  return { deliveries, queue, receive: (deliveryId: string, event: string, payload: Record<string, unknown>) =>
    receiveWebhook({ deliveries, queue }, { deliveryId, event, payload }) };
}

describe("receiveWebhook", () => {
  it("queues an opened pull request for ingest, keyed by repo and head commit", async () => {
    const { receive, queue, deliveries } = setUp();
    expect(await receive("d-1", "pull_request", opened())).toEqual({ outcome: "queued", queue: "star-catch.ingest" });

    const [job] = queue.sent;
    expect(job.singletonKey).toBe("acme/shop@abc1234");
    expect(IngestJobSchema.parse(job.data)).toEqual({
      deliveryId: "d-1",
      fullName: "Acme/Shop",
      number: 7,
      headSha: "abc1234",
      installationId: 42,
      draft: false,
      author: { login: "ada", type: "User" },
    });
    expect(deliveries.stored.get("d-1")).toMatchObject({ event: "pull_request", action: "opened", installationId: 42 });
    expect(deliveries.handled.has("d-1")).toBe(true);
  });

  it.each(["reopened", "ready_for_review"])("queues a %s pull request too", async (action) => {
    const { receive } = setUp();
    expect(await receive("d-1", "pull_request", opened({ action }))).toMatchObject({ outcome: "queued" });
  });

  it.each([
    ["merged", { merged: true, merged_at: "2026-10-07T10:00:00Z", closed_at: "2026-10-07T10:00:00Z" }],
    ["closed", { merged: false, merged_at: null, closed_at: "2026-10-07T11:00:00Z" }],
  ])("queues the new state of a %s pull request, not an ingest", async (state, fields) => {
    const { receive, queue } = setUp();
    const payload = opened({ action: "closed", pull_request: { ...opened().pull_request, ...fields } });
    expect(await receive("d-4", "pull_request", payload)).toEqual({ outcome: "queued", queue: "star-catch.pr-state" });
    expect(queue.sent).toEqual([
      { queue: "star-catch.pr-state", data: { fullName: "Acme/Shop", number: 7, state, at: state === "merged" ? "2026-10-07T10:00:00Z" : "2026-10-07T11:00:00Z" } },
    ]);
  });

  it("passes Crux's events on untouched", async () => {
    const { receive, queue } = setUp();
    const payload = { action: "created", installation: { id: 42 }, sender: { login: "ada" } };
    expect(await receive("d-2", "installation", payload)).toEqual({ outcome: "queued", queue: "crux.github-event" });
    expect(queue.sent).toEqual([{ queue: "crux.github-event", data: { deliveryId: "d-2", event: "installation", payload } }]);
  });

  it.each([
    ["pull_request", opened({ action: "synchronize" })],
    ["issue_comment", { action: "created", comment: { body: "@star-catch update" } }],
    ["push", { ref: "refs/heads/main" }],
    ["pull_request", { action: "opened" }],
  ])("only stores %s that nothing handles yet", async (event, payload) => {
    const { receive, queue, deliveries } = setUp();
    expect(await receive("d-3", event, payload)).toEqual({ outcome: "stored" });
    expect(queue.sent).toEqual([]);
    expect(deliveries.handled.has("d-3")).toBe(true);
  });

  it("does nothing for a redelivery it already handled", async () => {
    const { receive, queue } = setUp();
    await receive("d-1", "pull_request", opened());
    expect(await receive("d-1", "pull_request", opened())).toEqual({ outcome: "duplicate" });
    expect(queue.sent).toHaveLength(1);
  });

  it("routes a redelivery again when the first attempt failed to queue", async () => {
    const { receive, queue, deliveries } = setUp();
    queue.failNext = true;
    await expect(receive("d-1", "pull_request", opened())).rejects.toThrow("queue down");
    expect(deliveries.handled.has("d-1")).toBe(false);

    expect(await receive("d-1", "pull_request", opened())).toMatchObject({ outcome: "queued" });
    expect(queue.sent).toHaveLength(1);
  });

  it("names a deleted author ghost and defaults what trimmed payloads leave out", async () => {
    const { receive, queue } = setUp();
    const payload = opened({ pull_request: { number: 7, user: { login: null }, head: { sha: "abc1234" } } });
    await receive("d-1", "pull_request", payload);
    expect(queue.sent[0].data).toMatchObject({ draft: false, author: { login: "ghost", type: "User" } });
  });
});
