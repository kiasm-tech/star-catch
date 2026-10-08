import { snapshotOf } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { changeStatsOf, kindOf, qualityOf, type QualityContext } from "./change-stats.js";

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

const unit = (file: string, name: string, component: string) =>
  ({ id: `${file}#${name}`, file, name, unitKind: "declaration", language: "typescript", verdict: "behavioural", changeType: "added", refactorings: [], component }) as unknown as QualityContext["units"][number];

const units = [unit("limits/limiter.ts", "allowRequest", "limits"), unit("app/api/orders/route.ts", "POST", "api"), unit("store/usage.ts", "usageOf", "store")];
const sentences = [{ id: "description:0", origin: "description", text: "Keys shared one quota each.", class: "problem", numbers: [] }] as QualityContext["sentences"];
const body = `${"Usage now counts per organisation instead of per key. ".repeat(6)}Closes #812.`;
const points = (q: ReturnType<typeof qualityOf>) => Object.fromEntries(q.areas.map((a) => [a.area, `${a.points}/${a.max}`]));

describe("the quality", () => {
  it("measures the PR itself and adds the areas up to a score and a grade", () => {
    const q = qualityOf({ ...pr, body }, pr.files, { units, sentences });
    expect(q).toMatchObject({
      sizeClass: "S",
      focus: { parts: 3, level: "moderate" },
      largestShare: 0.5,
      description: { words: 56, why: true, issue: true },
      commits: { total: 4, conventional: 4, fixups: 0 },
    });
    expect(points(q)).toEqual({ context: "35/35", size: "25/25", focus: "14/20", commits: "20/20" });
    expect(q).toMatchObject({ score: 94, grade: "A" });
  });

  it("gives no context points to a PR without words or an issue", () => {
    const q = qualityOf({ ...pr, body: null, linkedIssues: [] }, pr.files, { units, sentences: [] });
    expect(q.description).toEqual({ words: 0, why: false, issue: false });
    expect(points(q).context).toBe("0/35");
  });

  it("costs focus points for a spread change carried by one file, and commit points for fixups", () => {
    const spread = ["a", "b", "c", "d", "e"].map((c) => unit(`${c}/x.ts`, "x", c));
    expect(points(qualityOf(pr, pr.files.slice(0, 2), { units: spread, sentences })).focus).toBe("4/20");
    const messy = qualityOf({ ...pr, commits: [...pr.commits, { sha: "b1b1b1b", message: "fixup! feat: count per org", author: "ada" }] }, pr.files, { units, sentences });
    expect(messy.commits).toEqual({ total: 5, conventional: 4, fixups: 1 });
    expect(points(messy).commits).toBe("11/20");
  });
});
