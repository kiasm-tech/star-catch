import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";

/** A valid snapshot of one modified file; override what the test is about. */
export function snapshotOf(
  ref: { fullName: string; number: number },
  overrides: Partial<PullRequestSnapshot> = {},
): PullRequestSnapshot {
  return {
    fullName: ref.fullName,
    number: ref.number,
    url: `https://github.com/${ref.fullName}/pull/${ref.number}`,
    title: "fix: count per organisation",
    body: null,
    author: "ada",
    state: "open",
    merged: false,
    baseRef: "main",
    headRef: "fix/org",
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    createdAt: "2026-09-30T09:00:00Z",
    updatedAt: "2026-09-30T09:00:00Z",
    labels: [],
    installationId: null,
    fetchedAt: "2026-09-30T09:00:00Z",
    truncated: false,
    files: [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1 }],
    commits: [{ sha: "c".repeat(40), message: "fix: count per organisation" }],
    linkedIssues: [],
    ciConclusion: "none",
    ...overrides,
  };
}
