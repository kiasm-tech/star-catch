import { readFile } from "node:fs/promises";
import path from "node:path";
import { connect, migrate, PostgresCatchStore, PostgresSnapshotStore, sign, type StarCatchDb } from "@star-catch/adapters";
import { FIXTURES_DIR, freshDatabase, loadRecordedSnapshots, type TestDatabase } from "@star-catch/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compose as composeIntake, type Intake } from "../apps/intake/src/compose.js";
import { compose as composeWorker, type Worker } from "../apps/worker/src/compose.js";
import { runWorker } from "../apps/worker/src/run.js";

const SECRET = "s3cret";
let database: TestDatabase;
let db: StarCatchDb;
let intake: Intake;
let worker: Worker;
const quiet = () => {};

beforeAll(async () => {
  database = await freshDatabase();
  db = connect(database.url);
  await migrate(db);
  intake = await composeIntake({ DATABASE_URL: database.url, GITHUB_WEBHOOK_SECRET: SECRET }, quiet);
  worker = await composeWorker({
    DATABASE_URL: database.url,
    STAR_CATCH_MOCK_GITHUB: "true",
    STAR_CATCH_MOCK_LLM: "true",
    STAR_CATCH_REPOS: "pmndrs/zustand",
  });
});

afterAll(async () => {
  await intake?.stop();
  await worker?.stop();
  await db?.destroy();
  await database?.drop();
});

async function replay(deliveryId: string, fixture: string) {
  const body = await readFile(path.join(FIXTURES_DIR, "webhooks", fixture), "utf8");
  const res = await intake.app.request("/github/webhook", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-delivery": deliveryId,
      "x-github-event": "pull_request",
      "x-hub-signature-256": sign(SECRET, body),
    },
  });
  return res.json();
}

describe("a pull request from webhook to catch", () => {
  it("stores the snapshot of a replayed webhook, once, and its catch", async () => {
    expect(await replay("d-1", "pmndrs__zustand__3469.opened.json")).toMatchObject({ outcome: "queued" });
    expect(await replay("d-1", "pmndrs__zustand__3469.opened.json")).toEqual({ outcome: "duplicate" });
    // The ingest, then the catch it queues.
    expect(await runWorker(worker, { watch: false, log: quiet })).toBe(2);

    const recorded = loadRecordedSnapshots().find((s) => s.number === 3469)!;
    expect(await new PostgresSnapshotStore(db).find("pmndrs/zustand", recorded.headSha)).toEqual(recorded);
    expect(await new PostgresCatchStore(db).latest("pmndrs__zustand__3469")).toMatchObject({ version: { pr: { fullName: "pmndrs/zustand", number: 3469 } } });
  });

  it("does not snapshot the same head commit from a second delivery", async () => {
    expect(await replay("d-2", "pmndrs__zustand__3469.opened.json")).toMatchObject({ outcome: "queued" });
    expect(await runWorker(worker, { watch: false, log: quiet })).toBe(1);
    expect(await db.selectFrom("star_catch.pr_snapshots").select("head_sha").execute()).toHaveLength(1);
  });
});
