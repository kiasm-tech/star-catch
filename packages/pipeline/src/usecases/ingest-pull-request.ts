import { IngestJobSchema, type IngestJob } from "../jobs/queues.js";
import type { PullRequestSource } from "../ports/pull-request-source.js";
import type { RepoSettings } from "../ports/repo-settings.js";
import type { SnapshotStore } from "../ports/snapshot-store.js";

export type IngestOutcome = "stored" | "duplicate" | "repo-disabled" | "draft" | "bot" | "invalid";

export interface IngestDeps {
  settings: RepoSettings;
  snapshots: SnapshotStore;
  source: PullRequestSource;
}

const isBot = (author: IngestJob["author"]) => author.type === "Bot" || author.login.endsWith("[bot]");

/**
 * Filters a queued pull request, then snapshots it once per head commit. Throws only when trying
 * again could help (GitHub or the database failing); a malformed job is reported, not retried.
 */
export async function ingestPullRequest({ settings, snapshots, source }: IngestDeps, data: unknown): Promise<IngestOutcome> {
  const parsed = IngestJobSchema.safeParse(data);
  if (!parsed.success) return "invalid";
  const job = parsed.data;

  if (!(await settings.isEnabled(job.fullName))) return "repo-disabled";
  if (job.draft) return "draft";
  if (isBot(job.author)) return "bot";
  if (await snapshots.has(job.fullName, job.headSha)) return "duplicate";

  const snapshot = await source.snapshot({ fullName: job.fullName, number: job.number, installationId: job.installationId });
  await snapshots.save(snapshot);
  return "stored";
}
