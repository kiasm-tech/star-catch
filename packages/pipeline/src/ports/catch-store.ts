import type { TokenUsage } from "./usage.js";
import type { CatchVersion } from "@kiasm-tech/star-catch-contracts";

/** A stored version, unvalidated, with the commit it was built from and when. */
export interface StoredVersion {
  headSha: string;
  generatedAt: Date;
  version: unknown;
}

/** Every generated version of a pull request's update; Crux reads the latest. */
export interface CatchStore {
  /** One version per head commit: generating the same commit again replaces it. */
  save(version: CatchVersion, headSha: string): Promise<void>;
  /**
   * Replaces the version read at `basedOn`, if it is still the latest; false when another save came
   * first, so an edit never puts an older commit's version back on top.
   */
  edit(version: CatchVersion, headSha: string, basedOn: Date): Promise<boolean>;
  /** Null when there's none. */
  latest(catchId: string): Promise<StoredVersion | null>;
  /** The latest version of every catch in these repos (any case), most recent first. */
  list(repos: string[], limit?: number): Promise<StoredVersion[]>;
}

export type RunStatus = "done" | "failed";

/** A finished or running generation, as the usage report lists it. */
export interface RunRecord {
  fullName: string;
  number: number;
  headSha: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: "running" | RunStatus;
  usage: TokenUsage[];
}

/** Each generation attempt and how it ended. */
export interface RunLog {
  start(run: { fullName: string; number: number; headSha: string }): Promise<number>;
  finish(id: number, outcome: { status: RunStatus; step: string; error?: string; usage?: TokenUsage[] }): Promise<void>;
  /** The latest runs in these repos (any case), newest first. */
  recent(repos: string[], limit?: number): Promise<RunRecord[]>;
}
