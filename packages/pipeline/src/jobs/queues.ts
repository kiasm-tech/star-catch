import { CRUX_GITHUB_EVENT, repoKey } from "@kiasm-tech/star-catch-contracts";
import { z } from "zod";
import type { QueueSpec } from "../ports/job-queue.js";

export const INGEST_QUEUE: QueueSpec = { name: "star-catch.ingest", retryLimit: 5, deduplicate: true };

/** Crux consumes it; whichever side starts first creates it with this spec. */
export const CRUX_GITHUB_EVENT_QUEUE: QueueSpec = { name: CRUX_GITHUB_EVENT, retryLimit: 5, deduplicate: false };

/** A stored snapshot to turn into a catch; a model run, so retried sparingly. */
export const GENERATE_QUEUE: QueueSpec = { name: "star-catch.generate", retryLimit: 2, deduplicate: true };

/** A saved catch to announce on its pull request; GitHub calls only, so retried freely. */
export const COMMENT_QUEUE: QueueSpec = { name: "star-catch.comment", retryLimit: 5, deduplicate: true };

/** Every queue the backend sends to or takes from. */
export const QUEUES: readonly QueueSpec[] = [INGEST_QUEUE, GENERATE_QUEUE, COMMENT_QUEUE, CRUX_GITHUB_EVENT_QUEUE];

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

/** A stored snapshot, by repo, PR and the head commit it was taken at. */
export const GenerateJobSchema = z.object({
  fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  number: z.number().int().positive(),
  headSha: z.string().min(7),
  /** Lets the catch be announced on the PR; jobs queued before it existed have none. */
  installationId: z.number().int().optional(),
});
export type GenerateJob = z.infer<typeof GenerateJobSchema>;

/** A pull request whose latest catch the comment should show. */
export const CommentJobSchema = z.object({
  fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  number: z.number().int().positive(),
  headSha: z.string().min(7),
  installationId: z.number().int(),
});
export type CommentJob = z.infer<typeof CommentJobSchema>;
