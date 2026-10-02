import type { QueueSpec } from "@star-catch/pipeline";
import { freshDatabase, type TestDatabase } from "@star-catch/testkit";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgBossJobQueue } from "./job-queue.pgboss.js";

const deduplicated: QueueSpec = { name: "test.deduplicated", retryLimit: 2, deduplicate: true };
const plain: QueueSpec = { name: "test.plain", retryLimit: 2, deduplicate: false };

let database: TestDatabase;
let queue: PgBossJobQueue;

beforeAll(async () => {
  database = await freshDatabase();
  queue = await PgBossJobQueue.start(database.url, [deduplicated, plain]);
});

afterAll(async () => {
  await queue.stop();
  await database.drop();
});

async function states(name: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  try {
    const result = await client.query("select state from pgboss.job where name = $1 order by created_on", [name]);
    return result.rows.map((row) => row.state);
  } finally {
    await client.end();
  }
}

describe("PgBossJobQueue", () => {
  it("starts again on the same database, as overlapping processes do", async () => {
    const others = await Promise.all([PgBossJobQueue.start(database.url, [plain]), PgBossJobQueue.start(database.url, [plain])]);
    await Promise.all(others.map((other) => other.stop()));
  });

  it("hands every waiting job to the handler, then stops", async () => {
    await queue.send(plain.name, { n: 1 });
    await queue.send(plain.name, { n: 2 });
    const seen: unknown[] = [];
    expect(await queue.drain(plain.name, async (data) => void seen.push(data))).toBe(2);
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(await queue.drain(plain.name, async () => {})).toBe(0);
  });

  it("refuses a second waiting job with the same key", async () => {
    expect(await queue.send(deduplicated.name, { n: 1 }, { singletonKey: "acme/shop@abc" })).toBe(true);
    expect(await queue.send(deduplicated.name, { n: 2 }, { singletonKey: "acme/shop@abc" })).toBe(false);
    expect(await queue.send(deduplicated.name, { n: 3 }, { singletonKey: "acme/shop@def" })).toBe(true);
    expect(await queue.drain(deduplicated.name, async () => {})).toBe(2);
  });

  it("puts a failed job back for a later retry", async () => {
    const name = plain.name;
    await queue.send(name, { n: "fails" });
    expect(
      await queue.drain(name, async () => {
        throw new Error("GitHub timed out");
      }),
    ).toBe(1);
    expect((await states(name)).at(-1)).toBe("retry");
    expect(await queue.drain(name, async () => {})).toBe(0);
  });
});
