import { snapshotOf } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { changeStatsOf, kindOf } from "./change-stats.js";

const file = (filename: string, status: string, additions: number, deletions: number) => ({ filename, status, additions, deletions });

const pr = snapshotOf(
  { fullName: "acme/shop", number: 921 },
  {
    body: "Counts usage per organisation. Closes #812, fixes #815.",
    labels: ["rate-limits", "api"],
    files: [
      file("limits/limiter.ts", "modified", 86, 9),
      file("app/api/orders/route.ts", "modified", 12, 6),
      file("limits/limiter.test.ts", "added", 52, 0),
      file("db/migrations/0042_usage_by_org.sql", "added", 14, 0),
      file("docs/limits.md", "modified", 4, 1),
      file("store/old-usage.ts", "removed", 0, 2),
      file("store/usage.ts", "renamed", 3, 0),
    ],
    commits: [
      { sha: "a1a1a1a", message: "feat: count per org", author: "acme-dev" },
      { sha: "a2a2a2a", message: "test: shared limit", author: "j.ortiz" },
      { sha: "a3a3a3a", message: "fix: migration", author: "acme-dev" },
      { sha: "a4a4a4a", message: "chore: rename", author: null },
    ],
  },
);

describe("the change by the numbers", () => {
  it("sorts files into the analysis's kinds, code for anything else", () => {
    expect(["limits/limiter.ts", "limits/limiter.test.ts", "db/migrations/1.sql", "README.md", "package.json", ".github/workflows/ci.yml"].map(kindOf)).toEqual([
      "code",
      "tests",
      "migrations",
      "docs",
      "config",
      "config",
    ]);
  });

  it("counts files by status and lines by kind, most lines first, and finds the largest file", () => {
    const stats = changeStatsOf(pr, pr.files);
    expect(stats.files).toEqual({ added: 2, modified: 3, removed: 1, renamed: 1 });
    expect(stats.kinds).toEqual([
      { kind: "code", additions: 101, deletions: 17 },
      { kind: "tests", additions: 52, deletions: 0 },
      { kind: "migrations", additions: 14, deletions: 0 },
      { kind: "docs", additions: 4, deletions: 1 },
    ]);
    expect(stats.largest).toEqual({ file: "limits/limiter.ts", additions: 86, deletions: 9 });
  });

  it("names the commit authors, most commits first, and what the PR closes", () => {
    const stats = changeStatsOf(pr, pr.files);
    expect(stats.commits).toBe(4);
    expect(stats.contributors).toEqual([
      { login: "acme-dev", commits: 2 },
      { login: "j.ortiz", commits: 1 },
    ]);
    expect(stats.labels).toEqual(["rate-limits", "api"]);
    expect(stats.closes).toEqual([812, 815]);
  });

  it("counts only the files the size counts", () => {
    const stats = changeStatsOf(pr, pr.files.slice(0, 1));
    expect(stats.files).toEqual({ added: 0, modified: 1, removed: 0, renamed: 0 });
    expect(stats.kinds).toEqual([{ kind: "code", additions: 86, deletions: 9 }]);
  });
});
