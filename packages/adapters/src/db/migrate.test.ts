import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { freshDatabase, type TestDatabase } from "@star-catch/testkit";
import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { connect, type StarCatchDb } from "./database.js";
import { migrate } from "./migrate.js";

describe("migrate", () => {
  let database: TestDatabase;
  let db: StarCatchDb;

  async function setUp() {
    database = await freshDatabase();
    db = connect(database.url);
  }

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  async function tables(schema: string): Promise<string[]> {
    const result = await sql<{ tablename: string }>`select tablename from pg_tables where schemaname = ${schema} order by 1`.execute(db);
    return result.rows.map((row) => row.tablename);
  }

  it("creates the star_catch schema once", async () => {
    await setUp();
    expect(await migrate(db)).toEqual(["0001_star_catch.sql", "0002_delivery_handled.sql", "0003_catches.sql", "0004_run_usage.sql"]);
    expect(await migrate(db)).toEqual([]);
    expect(await tables("star_catch")).toEqual(["catch_runs", "catch_versions", "pr_snapshots", "repo_settings", "schema_migrations", "webhook_deliveries"]);
  });

  it("applies each file once when runs overlap", async () => {
    await setUp();
    const runs = await Promise.all([migrate(db), migrate(db), migrate(db)]);
    expect(runs.flat()).toEqual(["0001_star_catch.sql", "0002_delivery_handled.sql", "0003_catches.sql", "0004_run_usage.sql"]);
  });

  it("applies new files in name order and rolls back a failing run", async () => {
    await setUp();
    const dir = await mkdtemp(path.join(tmpdir(), "migrations-"));
    await writeFile(path.join(dir, "0002_b.sql"), "create table star_catch.b (a_id int references star_catch.a (id));");
    await writeFile(path.join(dir, "0001_a.sql"), "create table star_catch.a (id int primary key);");
    expect(await migrate(db, dir)).toEqual(["0001_a.sql", "0002_b.sql"]);

    await writeFile(path.join(dir, "0003_c.sql"), "create table star_catch.c (id int);");
    await writeFile(path.join(dir, "0004_broken.sql"), "create table star_catch.a (id int);");
    await expect(migrate(db, dir)).rejects.toThrow(/already exists/);
    expect(await tables("star_catch")).toEqual(["a", "b", "schema_migrations"]);
  });
});
