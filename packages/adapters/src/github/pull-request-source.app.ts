import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import type { PullRequestRef, PullRequestSource } from "@star-catch/pipeline";
import { fetchPullRequestSnapshot } from "./fetch-pull-request-snapshot.js";
import type { GitHubApp } from "./github-app.js";

/** Snapshots through the installation that granted the GitHub App access to the repo. */
export class GitHubAppPullRequestSource implements PullRequestSource {
  constructor(private readonly app: Pick<GitHubApp, "forInstallation">) {}

  snapshot(ref: PullRequestRef): Promise<PullRequestSnapshot> {
    if (ref.installationId === undefined) {
      return Promise.reject(new Error(`${ref.fullName}#${ref.number}: no installation id, so the GitHub App can't read it`));
    }
    const gh = this.app.forInstallation(ref.installationId);
    return fetchPullRequestSnapshot(gh, ref.fullName, ref.number, ref.installationId);
  }
}
