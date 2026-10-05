import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { fetchPullRequestSnapshot } from "./fetch-pull-request-snapshot.js";
import { SNAPSHOT_LIMITS } from "@kiasm-tech/star-catch-contracts";

interface FakeFile {
  filename: string;
  status: string;
  patch?: string;
  previous_filename?: string;
}

type GraphqlVars = Record<string, unknown> & { request?: { signal?: AbortSignal } };

function fakeGitHub(opts: {
  files: FakeFile[];
  body?: string;
  /** "sha:path" → text; a missing key reads as a missing blob. */
  contents?: Record<string, string>;
  binary?: string[];
  failGraphql?: boolean;
  checks?: { status: string; conclusion: string | null }[] | "error";
  issues?: Record<number, { title: string; body: string | null }>;
  /** The head tree's entries; "error" makes the call fail. */
  tree?: { path: string; type: string }[] | "error";
  treeTruncated?: boolean;
}) {
  const listFiles = vi.fn();
  const listCommits = vi.fn();
  const graphql = vi.fn(async (_query: string, vars: GraphqlVars) => {
    if (opts.failGraphql) throw new Error("timeout");
    const repository: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(vars)) {
      if (!/^e\d+$/.test(key)) continue;
      const expression = value as string;
      const text = opts.contents?.[expression];
      repository[`f${key.slice(1)}`] =
        text === undefined
          ? null
          : { text, isBinary: opts.binary?.includes(expression) ?? false, isTruncated: false };
    }
    return { repository };
  });
  const gh = {
    pulls: {
      get: vi.fn(async () => ({
        data: {
          number: 7,
          html_url: "https://github.com/acme/api/pull/7",
          title: "Count rate limits per organisation",
          body: opts.body ?? null,
          user: { login: "ada" },
          state: "closed",
          merged_at: "2026-09-20T10:00:00Z",
          base: { ref: "main", sha: "base000" },
          head: { ref: "feat/org-limit", sha: "head111" },
          created_at: "2026-09-19T10:00:00Z",
          updated_at: "2026-09-20T10:00:00Z",
          labels: [{ name: "backend" }, { name: "" }],
        },
      })),
      listFiles,
      listCommits,
    },
    graphql,
    git: {
      getTree: vi.fn(async () => {
        if (opts.tree === "error") throw new Error("Not Found");
        return { data: { tree: opts.tree ?? [], truncated: opts.treeTruncated ?? false } };
      }),
    },
    issues: {
      get: vi.fn(async ({ issue_number }: { issue_number: number }) => {
        const issue = opts.issues?.[issue_number];
        if (!issue) throw Object.assign(new Error("Not Found"), { status: 404 });
        return { data: issue };
      }),
    },
    checks: {
      listForRef: vi.fn(async () => {
        if (opts.checks === "error") throw new Error("Forbidden");
        return { data: { check_runs: opts.checks ?? [] } };
      }),
    },
    paginate: vi.fn<(method: unknown, params?: unknown) => Promise<unknown[]>>(async (method) =>
      method === listFiles
        ? opts.files.map((f) => ({ additions: 1, deletions: 1, ...f }))
        : [{ sha: "c1", commit: { message: "feat: count per org" } }],
    ),
  };
  return { gh: gh as unknown as Octokit, raw: gh, graphql };
}

const expressionsIn = (graphql: ReturnType<typeof vi.fn>) =>
  graphql.mock.calls.flatMap(([, vars]) =>
    Object.entries(vars as GraphqlVars)
      .filter(([k]) => /^e\d+$/.test(k))
      .map(([, v]) => v as string),
  );

describe("fetchPullRequestSnapshot", () => {
  it("reads base and head contents according to file status", async () => {
    const { gh, graphql } = fakeGitHub({
      files: [
        { filename: "src/limit.ts", status: "modified", patch: "@@ -1 +1 @@" },
        { filename: "src/new.ts", status: "added", patch: "@@ +1 @@" },
        { filename: "src/old.ts", status: "removed", patch: "@@ -1 @@" },
        { filename: "src/moved.ts", status: "renamed", previous_filename: "src/was.ts" },
      ],
      contents: {
        "base000:src/limit.ts": "before",
        "head111:src/limit.ts": "after",
        "head111:src/new.ts": "new",
        "base000:src/old.ts": "old",
        "base000:src/was.ts": "was",
        "head111:src/moved.ts": "moved",
      },
    });

    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, 42);
    const byName = Object.fromEntries(snap.files.map((f) => [f.filename, f]));

    expect(byName["src/limit.ts"]).toMatchObject({ baseContent: "before", headContent: "after" });
    expect(byName["src/new.ts"].baseContent).toBeUndefined();
    expect(byName["src/new.ts"].headContent).toBe("new");
    expect(byName["src/old.ts"]).toMatchObject({ baseContent: "old" });
    expect(byName["src/old.ts"].headContent).toBeUndefined();
    expect(byName["src/moved.ts"]).toMatchObject({
      previousFilename: "src/was.ts",
      baseContent: "was",
      headContent: "moved",
    });
    expect(expressionsIn(graphql)).toHaveLength(6);
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(snap).toMatchObject({
      fullName: "acme/api",
      installationId: 42,
      merged: true,
      state: "closed",
      labels: ["backend"],
      truncated: false,
      commits: [{ sha: "c1", message: "feat: count per org" }],
    });
  });

  it("reads many files in a few batched queries", async () => {
    const files = Array.from({ length: 30 }, (_, i) => ({
      filename: `src/f${i}.ts`,
      status: "modified",
    }));
    const contents = Object.fromEntries(
      files.flatMap((f) => [
        [`base000:${f.filename}`, "b"],
        [`head111:${f.filename}`, "h"],
      ]),
    );
    const { gh, graphql } = fakeGitHub({ files, contents });
    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(graphql).toHaveBeenCalledTimes(2); // 60 file versions, 40 per query
    expect(snap.files.every((f) => f.baseContent === "b" && f.headContent === "h")).toBe(true);
  });

  it("puts a timeout on every call", async () => {
    const { gh, raw, graphql } = fakeGitHub({
      files: [{ filename: "a.ts", status: "added" }],
      contents: { "head111:a.ts": "x" },
      body: "Fixes #3",
      issues: { 3: { title: "t", body: null } },
    });
    await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    const calls = [
      ...raw.pulls.get.mock.calls,
      ...raw.issues.get.mock.calls,
      ...raw.checks.listForRef.mock.calls,
      ...raw.paginate.mock.calls.map(([, params]) => [params]),
      ...graphql.mock.calls.map(([, vars]) => [vars]),
    ] as unknown as [{ request?: { signal?: AbortSignal } }][];
    expect(calls.length).toBeGreaterThanOrEqual(6);
    for (const [params] of calls) expect(params.request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps binary and lockfile entries without fetching their contents", async () => {
    const { gh, graphql } = fakeGitHub({
      files: [
        { filename: "logo.png", status: "modified" },
        { filename: "pnpm-lock.yaml", status: "modified", patch: "@@ lock @@" },
        { filename: "app/pubspec.lock", status: "modified" },
      ],
    });
    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(snap.files.map((f) => f.filename)).toEqual([
      "logo.png",
      "pnpm-lock.yaml",
      "app/pubspec.lock",
    ]);
    expect(snap.files[1].patch).toBe("@@ lock @@");
    expect(graphql).not.toHaveBeenCalled();
  });

  it("skips blobs GitHub reports as binary", async () => {
    const { gh } = fakeGitHub({
      files: [{ filename: "data.txt", status: "added" }],
      contents: { "head111:data.txt": "\u0000\u0001" },
      binary: ["head111:data.txt"],
    });
    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(snap.files[0].headContent).toBeUndefined();
  });

  it("drops contents past the budget and marks the snapshot truncated", async () => {
    const big = "x".repeat(SNAPSHOT_LIMITS.contentChars);
    const { gh } = fakeGitHub({
      files: [
        { filename: "a.ts", status: "added" },
        { filename: "b.ts", status: "added" },
        { filename: "c.ts", status: "added" },
      ],
      contents: { "head111:a.ts": "small", "head111:b.ts": big, "head111:c.ts": "tiny" },
    });
    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(snap.files[0].headContent).toBe("small");
    expect(snap.files[1].headContent).toBeUndefined();
    expect(snap.files[2].headContent).toBe("tiny");
    expect(snap.truncated).toBe(true);
  });

  it("still produces a snapshot when reading contents fails", async () => {
    const { gh } = fakeGitHub({
      files: [{ filename: "a.ts", status: "added", patch: "@@ +1 @@" }],
      failGraphql: true,
    });
    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(snap.files[0]).toMatchObject({ filename: "a.ts", patch: "@@ +1 @@" });
    expect(snap.files[0].headContent).toBeUndefined();
    expect(snap.truncated).toBe(true);
  });

  it("fetches linked issues and skips ones that no longer exist", async () => {
    const { gh } = fakeGitHub({
      files: [],
      body: "Fixes #3 and closes #4",
      issues: { 3: { title: "Two keys double the quota", body: "Teams with two keys…" } },
    });
    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(snap.linkedIssues).toEqual([
      { number: 3, title: "Two keys double the quota", body: "Teams with two keys…" },
    ]);
  });

  it.each([
    [[], "none"],
    [[{ status: "in_progress", conclusion: null }], "pending"],
    [
      [
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "timed_out" },
      ],
      "failure",
    ],
    [
      [
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
      ],
      "success",
    ],
    ["error", "none"],
  ] as const)("reduces check runs %j to %s", async (checks, expected) => {
    const { gh } = fakeGitHub({
      files: [],
      checks: checks === "error" ? "error" : [...checks],
    });
    const snap = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(snap.ciConclusion).toBe(expected);
  });

  it("lists every file at the head commit, without folders", async () => {
    const { gh, raw } = fakeGitHub({ files: [], tree: [{ path: "src", type: "tree" }, { path: "src/a.ts", type: "blob" }, { path: "README.md", type: "blob" }] });
    const snapshot = await fetchPullRequestSnapshot(gh, "acme/api", 7, null);
    expect(snapshot.tree).toEqual({ paths: ["src/a.ts", "README.md"], truncated: false });
    expect(raw.git.getTree).toHaveBeenCalledWith(expect.objectContaining({ tree_sha: "head111", recursive: "1" }));
  });

  it("caps the tree, says so, and leaves it out when GitHub can't list it", async () => {
    const many = Array.from({ length: SNAPSHOT_LIMITS.treePaths + 5 }, (_, i) => ({ path: `f${i}.ts`, type: "blob" }));
    const capped = await fetchPullRequestSnapshot(fakeGitHub({ files: [], tree: many }).gh, "acme/api", 7, null);
    expect(capped.tree!.paths).toHaveLength(SNAPSHOT_LIMITS.treePaths);
    expect(capped.tree!.truncated).toBe(true);
    expect((await fetchPullRequestSnapshot(fakeGitHub({ files: [], tree: "error" }).gh, "acme/api", 7, null)).tree).toBeUndefined();
  });
});
