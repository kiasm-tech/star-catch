import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";

/** Snapshots keyed by repo (case-insensitive) and head commit. */
export interface SnapshotStore {
  has(fullName: string, headSha: string): Promise<boolean>;
  /** The first snapshot of a head commit wins; saving it again changes nothing. */
  save(snapshot: PullRequestSnapshot): Promise<void>;
  /** As stored, unvalidated; null when missing. */
  find(fullName: string, headSha: string): Promise<unknown>;
}
