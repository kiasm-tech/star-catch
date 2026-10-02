import { randomBytes } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    /** The run's Postgres server, from postgres.setup.ts. */
    postgresUrl: string;
  }
}

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

/** An empty database of its own on the run's Postgres server. */
export async function freshDatabase(): Promise<TestDatabase> {
  const server = inject("postgresUrl");
  const name = `test_${randomBytes(6).toString("hex")}`;
  await runOn(server, `create database ${name}`);
  const url = new URL(server);
  url.pathname = `/${name}`;
  return { url: url.toString(), drop: () => runOn(server, `drop database ${name} with (force)`) };
}

async function runOn(url: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
