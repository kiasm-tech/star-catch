import { PostgresCatchStore, PostgresRepoSettings, PostgresRunLog, PostgresSnapshotStore, connect, isMock, scriptPorts } from "@star-catch/adapters";
import { memoryMeter } from "@star-catch/pipeline";
import type { Hono } from "hono";
import { createApp } from "./http.js";

export type Env = Record<string, string | undefined>;

export interface Api {
  app: Hono;
  stop(): Promise<void>;
}

export const jsonLog = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

/** A person is waiting: the classifier gets less time than in the worker. */
const CLASSIFY_BUDGET_MS = 30_000;

/** The composition root: the only place that reads env and picks adapters. */
export async function compose(env: Env, log = jsonLog): Promise<Api> {
  const missing = ["DATABASE_URL", "STAR_CATCH_API_TOKEN"].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing env vars: ${missing.join(", ")}`);

  // Revising needs the models the worker uses; without them, everything else still serves.
  const canRevise = isMock("llm", env) || Boolean(env.STAR_CATCH_CLASSIFIER_MODEL);
  // Fails the start, not the first request, when a model is named without a key.
  if (canRevise) scriptPorts(env, memoryMeter());

  const db = connect(env.DATABASE_URL!);
  const runs = new PostgresRunLog(db);
  const snapshots = new PostgresSnapshotStore(db);
  const app = createApp({
    token: env.STAR_CATCH_API_TOKEN!,
    catches: new PostgresCatchStore(db),
    settings: new PostgresRepoSettings(db, env.STAR_CATCH_REPOS),
    runs,
    revise: canRevise
      ? () => {
          const meter = memoryMeter();
          return { snapshots, ports: scriptPorts(env, meter), runs, meter, options: { budgetMs: CLASSIFY_BUDGET_MS } };
        }
      : null,
    log,
  });
  return {
    app,
    async stop() {
      await db.destroy();
    },
  };
}
