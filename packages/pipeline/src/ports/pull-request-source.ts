import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";

export interface PullRequestRef {
  /** "owner/repo" */
  fullName: string;
  number: number;
}

/** Where pull request snapshots come from: GitHub, or recorded fixtures. */
export interface PullRequestSource {
  snapshot(ref: PullRequestRef): Promise<PullRequestSnapshot>;
}
