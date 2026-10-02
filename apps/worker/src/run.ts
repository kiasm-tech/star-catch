import { setTimeout as sleep } from "node:timers/promises";
import { INGEST_QUEUE, ingestPullRequest } from "@star-catch/pipeline";
import type { Log, Worker } from "./compose.js";

/** Each queue this worker takes jobs from, and what a job there does. */
const CONSUMERS: Record<string, (worker: Worker, data: unknown) => Promise<string>> = {
  [INGEST_QUEUE.name]: (worker, data) => ingestPullRequest(worker.ingest, data),
};

export interface RunOptions {
  /** Keep polling until `signal` aborts, instead of stopping once every queue is empty. */
  watch: boolean;
  pollMs?: number;
  signal?: AbortSignal;
  log: Log;
}

const deliveryOf = (data: unknown) =>
  typeof data === "object" && data !== null && "deliveryId" in data ? data.deliveryId : undefined;

/** Runs every waiting job; returns how many ran. */
export async function runWorker(worker: Worker, { watch, pollMs = 2_000, signal, log }: RunOptions): Promise<number> {
  let handled = 0;
  for (;;) {
    for (const [queue, consume] of Object.entries(CONSUMERS)) {
      handled += await worker.queue.drain(queue, async (data) => {
        const deliveryId = deliveryOf(data);
        try {
          log({ queue, deliveryId, outcome: await consume(worker, data) });
        } catch (error) {
          log({ queue, deliveryId, outcome: "failed", error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      });
    }
    if (!watch || signal?.aborted) return handled;
    await sleep(pollMs, undefined, { signal }).catch(() => {});
  }
}
