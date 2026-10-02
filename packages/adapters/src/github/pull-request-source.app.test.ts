import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { GitHubAppPullRequestSource } from "./pull-request-source.app.js";

describe("GitHubAppPullRequestSource", () => {
  it("reads through the pull request's installation", async () => {
    const get = vi.fn().mockRejectedValue(new Error("reached GitHub"));
    const forInstallation = vi.fn(() => ({ pulls: { get } }) as unknown as Octokit);
    const source = new GitHubAppPullRequestSource({ forInstallation });

    await expect(source.snapshot({ fullName: "acme/shop", number: 7, installationId: 42 })).rejects.toThrow("reached GitHub");
    expect(forInstallation).toHaveBeenCalledWith(42);
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ owner: "acme", repo: "shop", pull_number: 7 }));
  });

  it("refuses a pull request without an installation", async () => {
    const forInstallation = vi.fn();
    const source = new GitHubAppPullRequestSource({ forInstallation });
    await expect(source.snapshot({ fullName: "acme/shop", number: 7 })).rejects.toThrow(/no installation id/);
    expect(forInstallation).not.toHaveBeenCalled();
  });
});
