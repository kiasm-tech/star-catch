import type { CommentWrite, PullRequestComments, PullRequestRef } from "@star-catch/pipeline";
import type { GitHubApp } from "./github-app.js";

/** Comments as the GitHub App, through the installation that granted it the repo. */
export class GitHubAppPullRequestComments implements PullRequestComments {
  constructor(private readonly app: Pick<GitHubApp, "forInstallation">) {}

  async upsert({ fullName, number, installationId }: PullRequestRef & { installationId: number }, marker: string, body: string): Promise<CommentWrite> {
    const [owner, repo] = fullName.split("/") as [string, string];
    const gh = this.app.forInstallation(installationId);
    const comments = await gh.paginate(gh.issues.listComments, { owner, repo, issue_number: number, per_page: 100 });
    // Only a bot's: a person quoting the comment carries the marker too.
    const ours = comments.find((c) => c.user?.type === "Bot" && c.body?.includes(marker));
    if (!ours) {
      await gh.issues.createComment({ owner, repo, issue_number: number, body });
      return "created";
    }
    if (ours.body === body) return "unchanged";
    await gh.issues.updateComment({ owner, repo, comment_id: ours.id, body });
    return "updated";
  }
}
