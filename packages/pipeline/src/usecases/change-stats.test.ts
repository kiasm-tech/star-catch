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

const unit = (file: string, name: string, kind: string, component: string, risks: string[] = [], verdict = "behavioural") =>
  ({ id: `${file}#${name}`, file, name, unitKind: "declaration", language: "typescript", verdict, changeType: "added", refactorings: [], component, labels: { kind, risks } }) as unknown as QualityContext["units"][number];

const units = [
  unit("limits/limiter.ts", "allowRequest", "logic", "limits"),
  unit("limits/limiter.ts", "limitFor", "logic", "limits"),
  unit("app/api/orders/route.ts", "POST", "interface", "api"),
  unit("store/usage.ts", "usageOf", "data", "store", ["dataMigration"]),
  unit("limits/limiter.test.ts", "shares a limit", "test", "limits"),
];
const links = [
  { from: "limits/limiter.test.ts#shares a limit", to: "limits/limiter.ts#allowRequest", type: "covers" },
  { from: "limits/limiter.test.ts#shares a limit", to: "limits/limiter.ts#limitFor", type: "covers" },
] as QualityContext["links"];
const sentences = [{ id: "description:0", origin: "description", text: "Keys shared one quota each.", class: "problem", numbers: [] }] as QualityContext["sentences"];

describe("the quality", () => {
  it("measures the PR and adds the areas up to a score and a grade", () => {
    const body = `${"Usage now counts per organisation instead of per key. ".repeat(6)}Closes #812.`;
    const q = qualityOf({ ...pr, body }, pr.files, { units, links, sentences });
    expect(q).toMatchObject({
      sizeClass: "S",
      coverage: { tested: 2, testable: 4 },
      testRatio: 0.51,
      focus: { parts: 3, level: "moderate" },
      largestShare: 0.5,
      description: { why: true, issue: true },
      commits: { total: 4, conventional: 4, fixups: 0 },
      breaking: { count: 0, docs: true },
    });
    expect(Object.fromEntries(q.areas.map((a) => [a.area, a.points]))).toEqual({ tests: 15, risk: 16, size: 15, focus: 7, context: 15, commits: 10 });
    expect(q).toMatchObject({ score: 78, grade: "B" });
  });

  it("gives full test points when nothing calls for a test, and none for a PR without words", () => {
    const q = qualityOf({ ...pr, body: null, linkedIssues: [] }, pr.files, { units: [unit("README.md", "README", "documentation", "")], links: [], sentences: [] });
    expect(q.coverage).toBeNull();
    expect(q.areas.find((a) => a.area === "tests")!.points).toBe(30);
    expect(q.areas.find((a) => a.area === "context")!.points).toBe(0);
  });

  it("costs points for breaking changes, less when docs change too, and for fixup commits", () => {
    const breaking = [unit("api/v1.ts", "getOrder", "interface", "api", ["breaking"])];
    const noDocs = qualityOf(pr, pr.files.filter((f) => !f.filename.endsWith(".md")), { units: breaking, links: [], sentences });
    const docs = qualityOf(pr, pr.files, { units: breaking, links: [], sentences });
    expect([noDocs.areas[1]!.points, docs.areas[1]!.points]).toEqual([12, 16]);
    const messy = qualityOf({ ...pr, commits: [...pr.commits, { sha: "b1b1b1b", message: "fixup! feat: count per org", author: "ada" }] }, pr.files, { units, links, sentences });
    expect(messy.commits).toEqual({ total: 5, conventional: 4, fixups: 1 });
    expect(messy.areas.find((a) => a.area === "commits")!.points).toBe(5);
  });
});
