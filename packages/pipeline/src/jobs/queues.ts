import { CRUX_GITHUB_EVENT, repoKey } from "@kiasm-tech/star-catch-contracts";
import { z } from "zod";
import type { QueueSpec } from "../ports/job-queue.js";

export const INGEST_QUEUE: QueueSpec = { name: "star-catch.ingest", retryLimit: 5, deduplicate: true };

/** Crux consumes it; whichever side starts first creates it with this spec. */
export const CRUX_GITHUB_EVENT_QUEUE: QueueSpec = { name: CRUX_GITHUB_EVENT, retryLimit: 5, deduplicate: false };

/** Every queue the backend sends to or takes from. */
export const QUEUES: readonly QueueSpec[] = [INGEST_QUEUE, CRUX_GITHUB_EVENT_QUEUE];

/** A pull request to snapshot, with what the filters need from its delivery. */
export const IngestJobSchema = z.object({
  deliveryId: z.string().min(1),
  fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  number: z.number().int().positive(),
  headSha: z.string().min(7),
  installationId: z.number().int(),
  draft: z.boolean(),
  author: z.object({ login: z.string(), type: z.string() }),
});

export type IngestJob = z.infer<typeof IngestJobSchema>;

/** One ingest per repo and head commit, however often GitHub reports it. */
export function ingestKey(job: Pick<IngestJob, "fullName" | "headSha">): string {
  return `${repoKey(job.fullName)}@${job.headSha}`;
}
