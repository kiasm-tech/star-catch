import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { GitHubAppPullRequestComments } from "./pull-request-comments.app.js";

const ref = { fullName: "acme/shop", number: 7, installationId: 42 };
const MARKER = "<!-- star-catch -->";

function fakeApp(existing: { id: number; body: string; user: { type: string } }[]) {
  const issues = { listComments: vi.fn(), createComment: vi.fn(async () => ({})), updateComment: vi.fn(async () => ({})) };
  const paginate = vi.fn(async () => existing);
  const forInstallation = vi.fn(() => ({ issues, paginate }) as unknown as Octokit);
  return { comments: new GitHubAppPullRequestComments({ forInstallation }), issues, paginate, forInstallation };
}

describe("GitHubAppPullRequestComments", () => {
  it("creates the comment through the PR's installation when it has none", async () => {
    const { comments, issues, paginate, forInstallation } = fakeApp([{ id: 1, body: "LGTM", user: { type: "User" } }]);
    expect(await comments.upsert(ref, MARKER, `${MARKER}\nhello`)).toBe("created");
    expect(forInstallation).toHaveBeenCalledWith(42);
    expect(paginate).toHaveBeenCalledWith(issues.listComments, expect.objectContaining({ owner: "acme", repo: "shop", issue_number: 7 }));
    expect(issues.createComment).toHaveBeenCalledWith({ owner: "acme", repo: "shop", issue_number: 7, body: `${MARKER}\nhello` });
  });

  it("edits the bot's marked comment, not a person's quote of it", async () => {
    const { comments, issues } = fakeApp([
      { id: 1, body: `> ${MARKER}\n> old`, user: { type: "User" } },
      { id: 2, body: `${MARKER}\nold`, user: { type: "Bot" } },
    ]);
    expect(await comments.upsert(ref, MARKER, `${MARKER}\nnew`)).toBe("updated");
    expect(issues.updateComment).toHaveBeenCalledWith({ owner: "acme", repo: "shop", comment_id: 2, body: `${MARKER}\nnew` });
    expect(issues.createComment).not.toHaveBeenCalled();
  });

  it("leaves an identical comment alone", async () => {
    const { comments, issues } = fakeApp([{ id: 2, body: `${MARKER}\nsame`, user: { type: "Bot" } }]);
    expect(await comments.upsert(ref, MARKER, `${MARKER}\nsame`)).toBe("unchanged");
    expect(issues.updateComment).not.toHaveBeenCalled();
  });
});
