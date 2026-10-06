import { GenerateJobSchema } from "../jobs/queues.js";
import type { CatchStore, RunLog } from "../ports/catch-store.js";
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
}

/**
 * A stored snapshot → its catch, saved under the head commit, with the run recorded. A failure is
 * recorded with the step it stopped at and thrown, so the queue tries again.
 */
export async function generateCatch({ settings, snapshots, catches, runs, ports, options }: GenerateDeps, data: unknown): Promise<GenerateOutcome> {
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
  } catch (error) {
    await runs.finish(run, { status: "failed", step, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  await runs.finish(run, { status: "done", step: "save" });
  return "generated";
}
