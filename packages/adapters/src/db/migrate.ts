import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import type { StarCatchDb } from "./database.js";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../../../db/migrations/", import.meta.url));

// Any fixed number: serialises runs that start at the same time.
const LOCK_KEY = 7_270_401;

/**
 * Applies the .sql files in `dir` that star_catch.schema_migrations doesn't list yet, in name
 * order, all in one transaction. Returns the names it applied.
 */
export async function migrate(db: StarCatchDb, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  return db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(${LOCK_KEY})`.execute(trx);
    await sql`create schema if not exists star_catch`.execute(trx);
    await sql`create table if not exists star_catch.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`.execute(trx);
    const done = await sql<{ name: string }>`select name from star_catch.schema_migrations`.execute(trx);
    const applied = new Set(done.rows.map((row) => row.name));
    const pending = files.filter((name) => !applied.has(name));
    for (const name of pending) {
      await sql.raw(await readFile(path.join(dir, name), "utf8")).execute(trx);
      await sql`insert into star_catch.schema_migrations (name) values (${name})`.execute(trx);
    }
    return pending;
  });
}
