import { fileURLToPath } from "node:url";
import {
  AnthropicLlm,
  FileFixtureStore,
  GitHubApp,
  GitHubAppPullRequestSource,
  OpenAiLlm,
  PgBossJobQueue,
  PostgresCatchStore,
  PostgresRepoSettings,
  PostgresRunLog,
  PostgresSnapshotStore,
  RecordedPullRequestSource,
  appCredentials,
  connect,
  isMock,
} from "@star-catch/adapters";
import {
  QUEUES,
  mockClassifier,
  modelClassifier,
  modelWriter,
  templateWriter,
  type GenerateDeps,
  type IngestDeps,
  type JobQueue,
  type Llm,
  type ScriptPorts,
} from "@star-catch/pipeline";

export type Env = Record<string, string | undefined>;
export type Log = (entry: Record<string, unknown>) => void;

export interface Worker {
  queue: JobQueue;
  ingest: IngestDeps;
  generate: GenerateDeps;
  stop(): Promise<void>;
}

const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

export const jsonLog: Log = (entry) => console.log(JSON.stringify(entry));

/** A hosted model by the keys that are set: Anthropic first, then an OpenAI-compatible endpoint. */
function llmFor(env: Env, model: string): Llm {
  if (env.ANTHROPIC_API_KEY) return new AnthropicLlm({ apiKey: env.ANTHROPIC_API_KEY, model });
  if (env.OPENAI_API_KEY) return new OpenAiLlm({ apiKey: env.OPENAI_API_KEY, model, ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }) });
  throw new Error(`Set ANTHROPIC_API_KEY, or OPENAI_API_KEY (and OPENAI_BASE_URL), to call ${model}`);
}

/** The classifier and writer: offline in mock mode, else the models named in env. */
function modelPorts(env: Env): ScriptPorts {
  if (isMock("llm", env)) return { classifier: mockClassifier, writer: templateWriter };
  const classifierModel = env.STAR_CATCH_CLASSIFIER_MODEL;
  const writerModel = env.STAR_CATCH_WRITER_MODEL ?? classifierModel;
  if (!classifierModel || !writerModel) throw new Error("Missing env vars: STAR_CATCH_CLASSIFIER_MODEL (and STAR_CATCH_WRITER_MODEL to write with another model)");
  return { classifier: modelClassifier(llmFor(env, classifierModel), classifierModel), writer: modelWriter(llmFor(env, writerModel), writerModel) };
}

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
  const source = isMock("github", env)
    ? new RecordedPullRequestSource(new FileFixtureStore(env.STAR_CATCH_FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR))
    : new GitHubAppPullRequestSource(new GitHubApp(appCredentials(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY)));
  const ports = modelPorts(env);

  const db = connect(env.DATABASE_URL);
  const queue = await PgBossJobQueue.start(env.DATABASE_URL, QUEUES);
  const settings = new PostgresRepoSettings(db, env.STAR_CATCH_REPOS);
  const snapshots = new PostgresSnapshotStore(db);
  return {
    queue,
    ingest: { settings, snapshots, source, queue },
    generate: { settings, snapshots, catches: new PostgresCatchStore(db), runs: new PostgresRunLog(db), ports, options: { budgetMs: classifyBudgetMs(env) } },
    async stop() {
      await queue.stop();
      await db.destroy();
    },
  };
}
