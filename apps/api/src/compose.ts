import { PostgresCatchStore, PostgresRepoSettings, connect } from "@star-catch/adapters";
import type { Hono } from "hono";
import { createApp } from "./http.js";

export type Env = Record<string, string | undefined>;

export interface Api {
  app: Hono;
  stop(): Promise<void>;
}

export const jsonLog = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

/** The composition root: the only place that reads env and picks adapters. */
export async function compose(env: Env, log = jsonLog): Promise<Api> {
  const missing = ["DATABASE_URL", "STAR_CATCH_API_TOKEN"].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing env vars: ${missing.join(", ")}`);

  const db = connect(env.DATABASE_URL!);
  const app = createApp({
    token: env.STAR_CATCH_API_TOKEN!,
    catches: new PostgresCatchStore(db),
    settings: new PostgresRepoSettings(db, env.STAR_CATCH_REPOS),
    log,
  });
  return {
    app,
    async stop() {
      await db.destroy();
    },
  };
}
