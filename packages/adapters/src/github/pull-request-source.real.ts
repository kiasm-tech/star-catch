import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import type { PullRequestRef, PullRequestSource } from "@star-catch/pipeline";
import { Octokit } from "@octokit/rest";
import { fetchPullRequestSnapshot } from "./fetch-pull-request-snapshot.js";

/** Snapshots from the GitHub API with a personal token (public repos, fixture recording). */
export class GitHubPullRequestSource implements PullRequestSource {
  constructor(
    private readonly gh: Octokit,
    private readonly installationId: number | null = null,
  ) {}

  static withToken(token: string): GitHubPullRequestSource {
    return new GitHubPullRequestSource(new Octokit({ auth: token }));
  }

  snapshot(ref: PullRequestRef): Promise<PullRequestSnapshot> {
    return fetchPullRequestSnapshot(this.gh, ref.fullName, ref.number, this.installationId);
  }
}
