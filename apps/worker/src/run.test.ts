import { connect, migrate, type StarCatchDb } from "@star-catch/adapters";
import { INGEST_QUEUE, ingestKey, type IngestJob } from "@star-catch/pipeline";
import { freshDatabase, type TestDatabase } from "@star-catch/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compose, type Worker } from "./compose.js";
import { runWorker } from "./run.js";

const recorded: IngestJob = {
  deliveryId: "d-1",
  fullName: "pmndrs/zustand",
  number: 3469,
  headSha: "30ad99f59900a1ac9202ff566edb4062cd9a038c",
  installationId: 1,
  draft: false,
  author: { login: "SBolsec", type: "User" },
};

let database: TestDatabase;
let db: StarCatchDb;
let worker: Worker;
let logs: Record<string, unknown>[];
const log = (entry: Record<string, unknown>) => void logs.push(entry);

beforeAll(async () => {
  database = await freshDatabase();
  db = connect(database.url);
  await migrate(db);
  worker = await compose({ DATABASE_URL: database.url, STAR_CATCH_MOCK_GITHUB: "true", STAR_CATCH_REPOS: "pmndrs/zustand" });
});

afterAll(async () => {
  await worker?.stop();
  await db?.destroy();
  await database?.drop();
});

const send = (job: IngestJob) => worker.queue.send(INGEST_QUEUE.name, job, { singletonKey: ingestKey(job) });

describe("runWorker", () => {
  it("drains the ingest queue into snapshots and stops", async () => {
    logs = [];
    await send(recorded);
    await send({ ...recorded, deliveryId: "d-2", fullName: "acme/elsewhere", headSha: "b".repeat(40) });

    expect(await runWorker(worker, { watch: false, log })).toBe(2);
    expect(logs).toEqual([
      { queue: INGEST_QUEUE.name, deliveryId: "d-1", outcome: "stored" },
      { queue: INGEST_QUEUE.name, deliveryId: "d-2", outcome: "repo-disabled" },
    ]);
    const rows = await db.selectFrom("star_catch.pr_snapshots").select(["repo", "head_sha", "pr_number"]).execute();
    expect(rows).toEqual([{ repo: "pmndrs/zustand", head_sha: recorded.headSha, pr_number: 3469 }]);
    expect(await runWorker(worker, { watch: false, log })).toBe(0);
  });

  it("logs a failing job and leaves it for a retry", async () => {
    logs = [];
    await send({ ...recorded, deliveryId: "d-3", number: 999_999, headSha: "c".repeat(40) });
    expect(await runWorker(worker, { watch: false, log })).toBe(1);
    expect(logs).toEqual([
      expect.objectContaining({ deliveryId: "d-3", outcome: "failed", error: expect.stringMatching(/No recorded snapshot/) }),
    ]);
  });

  it("keeps polling in watch mode until stopped", async () => {
    logs = [];
    const stopping = new AbortController();
    const running = runWorker(worker, { watch: true, pollMs: 20, signal: stopping.signal, log });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await send({ ...recorded, deliveryId: "d-4", headSha: "d".repeat(40) });
    await expect.poll(() => logs.length, { timeout: 5_000 }).toBe(1);
    stopping.abort();
    expect(await running).toBe(1);
  });
});

describe("compose", () => {
  it("needs a database", async () => {
    await expect(compose({})).rejects.toThrow("DATABASE_URL");
  });

  it("needs the App's credentials outside mock mode", async () => {
    await expect(compose({ DATABASE_URL: "postgres://unused", STAR_CATCH_MOCK_GITHUB: "false" })).rejects.toThrow(
      "GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY",
    );
  });
});
