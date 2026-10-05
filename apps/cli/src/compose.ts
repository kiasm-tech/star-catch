import { fileURLToPath } from "node:url";
import {
  AnthropicLlm,
  FileFixtureStore,
  FileLabelCache,
  GitHubPullRequestSource,
  RecordedPullRequestSource,
  connect,
  isMock,
  OpenAiLlm,
  type StarCatchDb,
} from "@star-catch/adapters";
import {
  mockClassifier,
  modelClassifier,
  modelWriter,
  templateWriter,
  type ContextPorts,
  type Llm,
  type PullRequestSource,
  type ScriptWriter,
} from "@star-catch/pipeline";

export type Env = Record<string, string | undefined>;

const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const DEFAULT_LABEL_CACHE = fileURLToPath(new URL("../../../.cache/labels.json", import.meta.url));

export interface Classification extends ContextPorts {
  /** A hosted model, which costs money per call; the offline mock doesn't. */
  paid: boolean;
}

export interface Services {
  fixtures: FileFixtureStore;
  /** Built on first use, so commands that never call GitHub don't need a token. */
  pullRequests(): PullRequestSource;
  /** A new connection pool; the caller destroys it. */
  database(): StarCatchDb;
  webhookSecret(): string;
  /** Built on first use: only commands that classify need a model and a key. */
  classification(): Classification;
  /** The narration writer: the template offline, else STAR_CATCH_WRITER_MODEL (or the classifier's model). */
  writer(): { writer: ScriptWriter; paid: boolean };
}

/** A hosted model by the keys that are set: Anthropic first, then an OpenAI-compatible endpoint. */
function llmFor(env: Env, model: string): Llm {
  if (env.ANTHROPIC_API_KEY) return new AnthropicLlm({ apiKey: env.ANTHROPIC_API_KEY, model });
  if (env.OPENAI_API_KEY) return new OpenAiLlm({ apiKey: env.OPENAI_API_KEY, model, ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }) });
  throw new UsageError(`Set ANTHROPIC_API_KEY, or OPENAI_API_KEY (and OPENAI_BASE_URL for Azure AI Foundry), to call ${model}`);
}

/** The composition root: the only place that picks adapters. */
export function compose(env: Env): Services {
  const fixtures = new FileFixtureStore(env.STAR_CATCH_FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR);
  return {
    fixtures,
    pullRequests() {
      if (isMock("github", env)) return new RecordedPullRequestSource(fixtures);
      if (!env.GITHUB_TOKEN) {
        throw new UsageError("Set GITHUB_TOKEN to a personal access token, or STAR_CATCH_MOCK=true to use fixtures");
      }
      return GitHubPullRequestSource.withToken(env.GITHUB_TOKEN);
    },
    database() {
      if (!env.DATABASE_URL) throw new UsageError("Set DATABASE_URL, e.g. postgres://star_catch:star_catch@localhost:5432/star_catch");
      return connect(env.DATABASE_URL);
    },
    webhookSecret() {
      if (!env.GITHUB_WEBHOOK_SECRET) throw new UsageError("Set GITHUB_WEBHOOK_SECRET to the secret the intake checks");
      return env.GITHUB_WEBHOOK_SECRET;
    },
    classification() {
      if (isMock("llm", env)) return { classifier: mockClassifier, paid: false };
      const model = env.STAR_CATCH_CLASSIFIER_MODEL;
      if (!model) {
        throw new UsageError("Set STAR_CATCH_CLASSIFIER_MODEL to the model that labels changes (e.g. claude-haiku-4-5), or STAR_CATCH_MOCK_LLM=true for the offline classifier");
      }
      const labelCache = new FileLabelCache(env.STAR_CATCH_LABEL_CACHE ?? DEFAULT_LABEL_CACHE);
      return { classifier: modelClassifier(llmFor(env, model), model), labelCache, paid: true };
    },
    writer() {
      if (isMock("llm", env)) return { writer: templateWriter, paid: false };
      const model = env.STAR_CATCH_WRITER_MODEL ?? env.STAR_CATCH_CLASSIFIER_MODEL;
      if (!model) {
        throw new UsageError("Set STAR_CATCH_WRITER_MODEL (or STAR_CATCH_CLASSIFIER_MODEL) to the model that writes narration, or STAR_CATCH_MOCK_LLM=true for the template writer");
      }
      return { writer: modelWriter(llmFor(env, model), model), paid: true };
    },
  };
}

/** A problem with how the command was run, not with what it did. */
export class UsageError extends Error {}
