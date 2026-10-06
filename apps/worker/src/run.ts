import { setTimeout as sleep } from "node:timers/promises";
import { GENERATE_QUEUE, INGEST_QUEUE, generateCatch, ingestPullRequest } from "@star-catch/pipeline";
import type { Log, Worker } from "./compose.js";

/** Each queue this worker takes jobs from, and what a job there does. */
const CONSUMERS: Record<string, (worker: Worker, data: unknown) => Promise<string>> = {
  [INGEST_QUEUE.name]: (worker, data) => ingestPullRequest(worker.ingest, data),
  [GENERATE_QUEUE.name]: (worker, data) => generateCatch(worker.generate, data),
};

export interface RunOptions {
  /** Keep polling until `signal` aborts, instead of stopping once every queue is empty. */
  watch: boolean;
  pollMs?: number;
  signal?: AbortSignal;
  log: Log;
}

/** A job by its delivery, or by the PR and commit it builds. */
function jobOf(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null) return {};
  if ("deliveryId" in data) return { deliveryId: data.deliveryId };
  return "fullName" in data && "headSha" in data ? { pr: `${data.fullName}@${String(data.headSha).slice(0, 7)}` } : {};
}

/** Runs every waiting job; returns how many ran. */
export async function runWorker(worker: Worker, { watch, pollMs = 2_000, signal, log }: RunOptions): Promise<number> {
  let handled = 0;
  for (;;) {
    for (const [queue, consume] of Object.entries(CONSUMERS)) {
      handled += await worker.queue.drain(queue, async (data) => {
        const job = jobOf(data);
        try {
          log({ queue, ...job, outcome: await consume(worker, data) });
        } catch (error) {
          log({ queue, ...job, outcome: "failed", error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      });
    }
    if (!watch || signal?.aborted) return handled;
    await sleep(pollMs, undefined, { signal }).catch(() => {});
  }
}
