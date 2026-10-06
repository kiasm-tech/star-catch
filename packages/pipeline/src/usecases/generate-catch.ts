import { COMMENT_QUEUE, GenerateJobSchema, ingestKey, type CommentJob } from "../jobs/queues.js";
import type { CatchStore, RunLog } from "../ports/catch-store.js";
import type { JobQueue } from "../ports/job-queue.js";
import type { RepoSettings } from "../ports/repo-settings.js";
import type { SnapshotStore } from "../ports/snapshot-store.js";
import { buildCatch } from "./build-catch.js";
import type { ContextOptions } from "./build-context.js";
import type { ScriptPorts } from "./build-scripts.js";

export type GenerateOutcome = "generated" | "repo-disabled" | "no-snapshot" | "invalid";

export interface GenerateDeps {
  settings: RepoSettings;
  snapshots: SnapshotStore;
  catches: CatchStore;
  runs: RunLog;
  ports: ScriptPorts;
  options?: ContextOptions;
  /** Where a saved catch goes to be commented on its PR; absent, no comment. */
  commentQueue?: Pick<JobQueue, "send">;
}

/**
 * A stored snapshot → its catch, saved under the head commit, with the run recorded. A failure is
 * recorded with the step it stopped at and thrown, so the queue tries again.
 */
export async function generateCatch({ settings, snapshots, catches, runs, ports, options, commentQueue }: GenerateDeps, data: unknown): Promise<GenerateOutcome> {
  const parsed = GenerateJobSchema.safeParse(data);
  if (!parsed.success) return "invalid";
  const job = parsed.data;
  // Switched off since the snapshot was queued: no model run.
  if (!(await settings.isEnabled(job.fullName))) return "repo-disabled";
  const snapshot = await snapshots.find(job.fullName, job.headSha);
  if (snapshot === null) return "no-snapshot";

  const run = await runs.start(job);
  let step = "build";
  try {
    const version = await buildCatch(snapshot, ports, options);
    step = "save";
    await catches.save(version, job.headSha);
    if (commentQueue && job.installationId !== undefined) {
      step = "comment";
      const comment: CommentJob = { fullName: job.fullName, number: job.number, headSha: job.headSha, installationId: job.installationId };
      await commentQueue.send(COMMENT_QUEUE.name, comment, { singletonKey: ingestKey(comment) });
    }
  } catch (error) {
    await runs.finish(run, { status: "failed", step, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  await runs.finish(run, { status: "done", step: "save" });
  return "generated";
}
