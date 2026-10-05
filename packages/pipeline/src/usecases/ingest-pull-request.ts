import { GENERATE_QUEUE, IngestJobSchema, ingestKey, type GenerateJob, type IngestJob } from "../jobs/queues.js";
import type { JobQueue } from "../ports/job-queue.js";
import type { PullRequestSource } from "../ports/pull-request-source.js";
import type { RepoSettings } from "../ports/repo-settings.js";
import type { SnapshotStore } from "../ports/snapshot-store.js";

export type IngestOutcome = "stored" | "duplicate" | "repo-disabled" | "draft" | "bot" | "invalid";

export interface IngestDeps {
  settings: RepoSettings;
  snapshots: SnapshotStore;
  source: PullRequestSource;
  /** Where a stored snapshot goes to become a catch. */
  queue: Pick<JobQueue, "send">;
}

const isBot = (author: IngestJob["author"]) => author.type === "Bot" || author.login.endsWith("[bot]");

/**
 * Filters a queued pull request, then snapshots it once per head commit and queues its catch. Throws only when trying
 * again could help (GitHub or the database failing); a malformed job is reported, not retried.
 */
export async function ingestPullRequest({ settings, snapshots, source, queue }: IngestDeps, data: unknown): Promise<IngestOutcome> {
  const parsed = IngestJobSchema.safeParse(data);
  if (!parsed.success) return "invalid";
  const job = parsed.data;

  if (!(await settings.isEnabled(job.fullName))) return "repo-disabled";
  if (job.draft) return "draft";
  if (isBot(job.author)) return "bot";
  if (await snapshots.has(job.fullName, job.headSha)) return "duplicate";

  const snapshot = await source.snapshot({ fullName: job.fullName, number: job.number, installationId: job.installationId });
  await snapshots.save(snapshot);
  const generate: GenerateJob = { fullName: job.fullName, number: job.number, headSha: snapshot.headSha };
  await queue.send(GENERATE_QUEUE.name, generate, { singletonKey: ingestKey(generate) });
  return "stored";
}
