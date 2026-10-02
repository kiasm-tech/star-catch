import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema.js";

export type StarCatchDb = Kysely<Database>;

export function connect(url: string): StarCatchDb {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });
}
