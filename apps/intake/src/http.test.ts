import type { IncomingWebhook, WebhookOutcome } from "@star-catch/pipeline";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./http.js";
import { sign } from "@star-catch/adapters";

const SECRET = "s3cret";

function setUp(receive: (webhook: IncomingWebhook) => Promise<WebhookOutcome> = async () => ({ outcome: "stored" })) {
  const spy = vi.fn(receive);
  const logs: Record<string, unknown>[] = [];
  const app = createApp({ secret: SECRET, receive: spy, log: (entry) => void logs.push(entry) });
  return { app, receive: spy, logs };
}

function post(body: string, headers: Record<string, string | undefined> = {}) {
  const all: Record<string, string | undefined> = {
    "content-type": "application/json",
    "x-github-delivery": "d-1",
    "x-github-event": "pull_request",
    "x-hub-signature-256": sign(SECRET, body),
    ...headers,
  };
  return new Request("http://intake/github/webhook", {
    method: "POST",
    body,
    headers: Object.fromEntries(Object.entries(all).filter((e): e is [string, string] => e[1] !== undefined)),
  });
}

describe("intake", () => {
  it("answers health checks", async () => {
    const res = await setUp().app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("hands a signed delivery to the core and answers 202", async () => {
    const { app, receive, logs } = setUp(async () => ({ outcome: "queued", queue: "star-catch.ingest" }));
    const res = await app.request(post('{"action":"opened"}'));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ outcome: "queued", queue: "star-catch.ingest" });
    expect(receive).toHaveBeenCalledWith({ deliveryId: "d-1", event: "pull_request", payload: { action: "opened" } });
    expect(logs).toEqual([{ deliveryId: "d-1", event: "pull_request", outcome: "queued", queue: "star-catch.ingest" }]);
  });

  it("rejects a bad signature with 401 and stores nothing", async () => {
    const { app, receive } = setUp();
    const res = await app.request(post('{"action":"opened"}', { "x-hub-signature-256": sign("wrong", '{"action":"opened"}') }));
    expect(res.status).toBe(401);
    expect(receive).not.toHaveBeenCalled();
  });

  it.each([["x-github-delivery"], ["x-github-event"]])("needs %s", async (header) => {
    const { app, receive } = setUp();
    expect((await app.request(post("{}", { [header]: undefined }))).status).toBe(400);
    expect(receive).not.toHaveBeenCalled();
  });

  it.each([["payload=%7B%7D"], ["[1]"], ["null"]])("rejects the body %s", async (body) => {
    const { app } = setUp();
    expect((await app.request(post(body))).status).toBe(400);
  });

  it("answers 500 when the core fails, so GitHub records a failed delivery", async () => {
    const { app } = setUp(async () => {
      throw new Error("database down");
    });
    expect((await app.request(post("{}"))).status).toBe(500);
  });
});
