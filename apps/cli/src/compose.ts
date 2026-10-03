import { fileURLToPath } from "node:url";
import {
  FileFixtureStore,
  GitHubPullRequestSource,
  RecordedPullRequestSource,
  connect,
  isMock,
  type StarCatchDb,
} from "@star-catch/adapters";
import type { PullRequestSource } from "@star-catch/pipeline";

export type Env = Record<string, string | undefined>;

const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

export interface Services {
  fixtures: FileFixtureStore;
  /** Built on first use, so commands that never call GitHub don't need a token. */
  pullRequests(): PullRequestSource;
  /** A new connection pool; the caller destroys it. */
  database(): StarCatchDb;
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
  };
}

/** A problem with how the command was run, not with what it did. */
export class UsageError extends Error {}
