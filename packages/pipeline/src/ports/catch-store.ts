import type { CatchVersion } from "@kiasm-tech/star-catch-contracts";

/** Every generated version of a pull request's update; Crux reads the latest. */
export interface CatchStore {
  /** One version per head commit: generating the same commit again replaces it. */
  save(version: CatchVersion, headSha: string): Promise<void>;
  /** As stored, unvalidated; null when there's none. */
  latest(catchId: string): Promise<unknown>;
  /** The latest version of every catch in these repos, most recent first; unvalidated. */
  list(repos: string[], limit?: number): Promise<unknown[]>;
}

export type RunStatus = "done" | "failed";

/** Each generation attempt and how it ended. */
export interface RunLog {
  start(run: { fullName: string; number: number; headSha: string }): Promise<number>;
  finish(id: number, outcome: { status: RunStatus; step: string; error?: string }): Promise<void>;
}
