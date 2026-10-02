import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { freshDatabase, type TestDatabase } from "./postgres.js";

describe("freshDatabase", () => {
  const created: TestDatabase[] = [];
  afterAll(() => Promise.all(created.map((db) => db.drop())));

  async function query(url: string, sql: string) {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      return (await client.query(sql)).rows;
    } finally {
      await client.end();
    }
  }

  it("gives each caller an empty database of its own", async () => {
    const a = await freshDatabase();
    const b = await freshDatabase();
    created.push(a, b);
    expect(a.url).not.toBe(b.url);

    await query(a.url, "create table only_in_a (id int)");
    const tables = await query(b.url, "select tablename from pg_tables where schemaname = 'public'");
    expect(tables).toEqual([]);
  });

  it("drops the database", async () => {
    const db = await freshDatabase();
    const name = new URL(db.url).pathname.slice(1);
    await db.drop();
    const rows = await query(db.url.replace(`/${name}`, "/postgres"), `select 1 from pg_database where datname = '${name}'`);
    expect(rows).toEqual([]);
  });
});
