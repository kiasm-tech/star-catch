import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";

export interface PullRequestRef {
  /** "owner/repo" */
  fullName: string;
  number: number;
  /** The GitHub App installation that grants access; absent for public repos read with a token. */
  installationId?: number;
}

/** Where pull request snapshots come from: GitHub, or recorded fixtures. */
export interface PullRequestSource {
  snapshot(ref: PullRequestRef): Promise<PullRequestSnapshot>;
}
