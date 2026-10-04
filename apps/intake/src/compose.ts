import { PgBossJobQueue, PostgresDeliveryStore, connect } from "@star-catch/adapters";
import { QUEUES, receiveWebhook } from "@star-catch/pipeline";
import type { Hono } from "hono";
import { createApp } from "./http.js";

export type Env = Record<string, string | undefined>;

export interface Intake {
  app: Hono;
  stop(): Promise<void>;
}

export const jsonLog = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

/** The composition root: the only place that reads env and picks adapters. */
export async function compose(env: Env, log = jsonLog): Promise<Intake> {
  const missing = ["DATABASE_URL", "GITHUB_WEBHOOK_SECRET"].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing env vars: ${missing.join(", ")}`);

  const db = connect(env.DATABASE_URL!);
  const queue = await PgBossJobQueue.start(env.DATABASE_URL!, QUEUES);
  const deliveries = new PostgresDeliveryStore(db);
  const app = createApp({
    secret: env.GITHUB_WEBHOOK_SECRET!,
    receive: (webhook) => receiveWebhook({ deliveries, queue }, webhook),
    log,
  });
  return {
    app,
    async stop() {
      await queue.stop();
      await db.destroy();
    },
  };
}
