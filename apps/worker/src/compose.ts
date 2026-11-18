import { fileURLToPath } from "node:url";
import {
  FileFixtureStore,
  GitHubApp,
  GitHubAppPullRequestComments,
  GitHubAppPullRequestSource,
  MemoryPullRequestComments,
  PgBossJobQueue,
  PostgresCatchStore,
  PostgresRepoSettings,
  PostgresRunLog,
  PostgresSnapshotStore,
  RecordedPullRequestSource,
  appCredentials,
  connect,
  isMock,
  scriptPorts,
} from "@star-catch/adapters";
import { QUEUES, memoryMeter, type CommentDeps, type GenerateDeps, type IngestDeps, type JobQueue } from "@star-catch/pipeline";

export type Env = Record<string, string | undefined>;
export type Log = (entry: Record<string, unknown>) => void;

export interface Worker {
  queue: JobQueue;
  ingest: IngestDeps;
  generate: GenerateDeps;
  /** Null when CRUX_PUBLIC_URL is unset: there's no page to link to, so no comment. */
  comment: CommentDeps | null;
  stop(): Promise<void>;
}

const MOCK_CRUX_URL = "http://localhost:3000";

const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

export const jsonLog: Log = (entry) => console.log(JSON.stringify(entry));

/** The classifier's time for one PR. A job, not a request, so it can wait: past it, changes go unlabelled. */
const CLASSIFY_BUDGET_MS = 120_000;

function classifyBudgetMs(env: Env): number {
  const ms = Number(env.STAR_CATCH_CLASSIFY_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : CLASSIFY_BUDGET_MS;
}

/** The composition root: the only place that reads env and picks adapters. */
export async function compose(env: Env): Promise<Worker> {
  if (!env.DATABASE_URL) throw new Error("Missing env vars: DATABASE_URL");
  // Built before connecting, so missing App credentials fail the start, not the first job.
  const mockGitHub = isMock("github", env);
  const app = mockGitHub ? null : new GitHubApp(appCredentials(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY));
  const source = app
    ? new GitHubAppPullRequestSource(app)
    : new RecordedPullRequestSource(new FileFixtureStore(env.STAR_CATCH_FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR));
  const comments = app ? new GitHubAppPullRequestComments(app) : new MemoryPullRequestComments();
  const cruxUrl = env.CRUX_PUBLIC_URL ?? (mockGitHub ? MOCK_CRUX_URL : undefined);
  const meter = memoryMeter();
  const ports = scriptPorts(env, meter);

  const db = connect(env.DATABASE_URL);
  const queue = await PgBossJobQueue.start(env.DATABASE_URL, QUEUES);
  const settings = new PostgresRepoSettings(db, env.STAR_CATCH_REPOS);
  const snapshots = new PostgresSnapshotStore(db);
  const catches = new PostgresCatchStore(db);
  return {
    queue,
    ingest: { settings, snapshots, source, queue },
    generate: {
      settings,
      snapshots,
      catches,
      runs: new PostgresRunLog(db),
      ports,
      meter,
      options: { budgetMs: classifyBudgetMs(env) },
      ...(cruxUrl && { commentQueue: queue }),
    },
    comment: cruxUrl ? { settings, catches, comments, cruxUrl } : null,
    async stop() {
      await queue.stop();
      await db.destroy();
    },
  };
}
