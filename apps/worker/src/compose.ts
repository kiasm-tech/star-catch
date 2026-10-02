import { fileURLToPath } from "node:url";
import {
  EnvRepoSettings,
  FileFixtureStore,
  GitHubApp,
  GitHubAppPullRequestSource,
  PgBossJobQueue,
  PostgresSnapshotStore,
  RecordedPullRequestSource,
  appCredentials,
  connect,
  isMock,
} from "@star-catch/adapters";
import { QUEUES, type IngestDeps, type JobQueue } from "@star-catch/pipeline";

export type Env = Record<string, string | undefined>;
export type Log = (entry: Record<string, unknown>) => void;

export interface Worker {
  queue: JobQueue;
  ingest: IngestDeps;
  stop(): Promise<void>;
}

const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

export const jsonLog: Log = (entry) => console.log(JSON.stringify(entry));

/** The composition root: the only place that reads env and picks adapters. */
export async function compose(env: Env): Promise<Worker> {
  if (!env.DATABASE_URL) throw new Error("Missing env vars: DATABASE_URL");
  // Built before connecting, so missing App credentials fail the start, not the first job.
  const source = isMock("github", env)
    ? new RecordedPullRequestSource(new FileFixtureStore(env.STAR_CATCH_FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR))
    : new GitHubAppPullRequestSource(new GitHubApp(appCredentials(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY)));

  const db = connect(env.DATABASE_URL);
  const queue = await PgBossJobQueue.start(env.DATABASE_URL, QUEUES);
  return {
    queue,
    ingest: { settings: new EnvRepoSettings(env.STAR_CATCH_REPOS), snapshots: new PostgresSnapshotStore(db), source },
    async stop() {
      await queue.stop();
      await db.destroy();
    },
  };
}
