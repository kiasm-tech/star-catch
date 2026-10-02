import type { IncomingWebhook, WebhookOutcome } from "@star-catch/pipeline";
import { Hono } from "hono";
import { verifySignature } from "./signature.js";

export interface IntakeDeps {
  /** The GitHub App's webhook secret. */
  secret: string;
  receive(webhook: IncomingWebhook): Promise<WebhookOutcome>;
  log(entry: Record<string, unknown>): void;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function createApp({ secret, receive, log }: IntakeDeps): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.post("/github/webhook", async (c) => {
    const deliveryId = c.req.header("x-github-delivery");
    const event = c.req.header("x-github-event");
    if (!deliveryId || !event) return c.json({ error: "X-GitHub-Delivery and X-GitHub-Event are required" }, 400);

    // The signature covers the exact bytes, so verify before parsing.
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (!verifySignature(secret, body, c.req.header("x-hub-signature-256"))) {
      log({ deliveryId, event, outcome: "bad-signature" });
      return c.json({ error: "Signature does not match" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(body));
    } catch {
      payload = undefined;
    }
    if (!isObject(payload)) return c.json({ error: "The body must be a JSON object (content type application/json)" }, 400);

    const result = await receive({ deliveryId, event, payload });
    log({ deliveryId, event, ...result });
    return c.json(result, 202);
  });

  // A 5xx marks the delivery failed on GitHub's side, so redeliver picks it up later.
  app.onError((error, c) => {
    log({ outcome: "error", error: error.message });
    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
