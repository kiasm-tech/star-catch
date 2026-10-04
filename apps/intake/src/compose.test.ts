import { readFile } from "node:fs/promises";
import path from "node:path";
import { connect, migrate, PgBossJobQueue, sign, type StarCatchDb } from "@star-catch/adapters";
import { CRUX_GITHUB_EVENT_QUEUE, INGEST_QUEUE, QUEUES } from "@star-catch/pipeline";
import { FIXTURES_DIR, freshDatabase, type TestDatabase } from "@star-catch/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compose, type Intake } from "./compose.js";

const SECRET = "s3cret";
let database: TestDatabase;
let db: StarCatchDb;
let intake: Intake;
let queue: PgBossJobQueue;

beforeAll(async () => {
  database = await freshDatabase();
  db = connect(database.url);
  await migrate(db);
  intake = await compose({ DATABASE_URL: database.url, GITHUB_WEBHOOK_SECRET: SECRET }, () => {});
  queue = await PgBossJobQueue.start(database.url, QUEUES);
});

afterAll(async () => {
  await intake?.stop();
  await queue?.stop();
  await db?.destroy();
  await database?.drop();
});

function deliver(deliveryId: string, event: string, body: string) {
  return intake.app.request("/github/webhook", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-delivery": deliveryId,
      "x-github-event": event,
      "x-hub-signature-256": sign(SECRET, body),
    },
  });
}

async function drained(name: string): Promise<unknown[]> {
  const jobs: unknown[] = [];
  await queue.drain(name, async (data) => void jobs.push(data));
  return jobs;
}

describe("intake on Postgres and pg-boss", () => {
  it("stores a recorded webhook and queues its ingest once", async () => {
    const body = await readFile(path.join(FIXTURES_DIR, "webhooks", "pmndrs__zustand__3469.opened.json"), "utf8");
    expect(await (await deliver("d-1", "pull_request", body)).json()).toEqual({ outcome: "queued", queue: INGEST_QUEUE.name });
    expect(await (await deliver("d-1", "pull_request", body)).json()).toEqual({ outcome: "duplicate" });

    expect(await drained(INGEST_QUEUE.name)).toEqual([
      expect.objectContaining({ deliveryId: "d-1", fullName: "pmndrs/zustand", number: 3469, installationId: 1 }),
    ]);
    const row = await db.selectFrom("star_catch.webhook_deliveries").selectAll().where("delivery_id", "=", "d-1").executeTakeFirstOrThrow();
    expect(row).toMatchObject({ event: "pull_request", action: "opened", installation_id: "1" });
    expect(row.handled_at).toBeInstanceOf(Date);
  });

  it("passes a Crux event on with its payload unchanged", async () => {
    const payload = { action: "added", installation: { id: 9 }, member: { login: "ada" }, unknown_field: [1, { deep: true }] };
    await deliver("d-2", "member", JSON.stringify(payload));
    expect(await drained(CRUX_GITHUB_EVENT_QUEUE.name)).toEqual([{ deliveryId: "d-2", event: "member", payload }]);
  });

  it("stores nothing when the signature is wrong", async () => {
    const res = await intake.app.request("/github/webhook", {
      method: "POST",
      body: "{}",
      headers: { "x-github-delivery": "d-3", "x-github-event": "member", "x-hub-signature-256": sign("wrong", "{}") },
    });
    expect(res.status).toBe(401);
    expect(await db.selectFrom("star_catch.webhook_deliveries").select("delivery_id").where("delivery_id", "=", "d-3").execute()).toEqual([]);
  });

  it("names the env vars it needs", async () => {
    await expect(compose({})).rejects.toThrow("DATABASE_URL, GITHUB_WEBHOOK_SECRET");
  });
});
