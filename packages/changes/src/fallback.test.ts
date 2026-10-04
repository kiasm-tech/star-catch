import { describe, expect, it } from "vitest";
import { MAX_FILES, analyze } from "./analyze.js";
import type { AnalyzeInput } from "./schema.js";

type File = AnalyzeInput["files"][number];

const go: File = {
  path: "cmd/main.go",
  status: "modified",
  base: "package main\n",
  head: "package main\n\nfunc main() {}\n",
  patch: "@@ -1 +1,3 @@\n package main\n+\n+func main() {}\n",
};

describe("the line fallback", () => {
  it("turns a file no engine reads into one behavioural file unit carrying its patch", async () => {
    const changes = await analyze({ files: [go] });
    expect(changes.units).toEqual([
      expect.objectContaining({
        id: "cmd/main.go#main.go",
        unitKind: "file",
        language: "go",
        verdict: "behavioural",
        changeType: "bodyChanged",
        after: go.patch,
      }),
    ]);
    expect(changes.files).toEqual([
      { path: "cmd/main.go", language: "go", fileClass: "source", engine: "lines", degraded: true, error: "no engine reads go files" },
    ]);
    expect(changes.degraded).toBe(true);
  });

  it.each<[string, File, string]>([
    ["an added file", { path: "Dockerfile", status: "added", head: "FROM node:22\n" }, "added"],
    ["a removed file", { path: "Makefile", status: "removed", base: "all:\n" }, "removed"],
    ["a renamed file", { path: "docs/new.txt", previousPath: "docs/old.txt", status: "renamed", base: "x\n", head: "x\n" }, "moved"],
  ])("takes the change type of %s from its status", async (_case, file, changeType) => {
    const [unit] = (await analyze({ files: [file] })).units;
    expect(unit.changeType).toBe(changeType);
    expect(file.status === "removed" ? unit.before : unit.after).toBe(file.head ?? file.base);
  });

  it("makes no unit for a file whose content didn't change", async () => {
    expect((await analyze({ files: [{ path: "a.go", status: "modified", base: "x", head: "x" }] })).units).toEqual([]);
  });

  it.each<[string, File, RegExp]>([
    ["code without content", { path: "src/a.ts", status: "modified", head: "export {};\n", patch: "@@" }, /^content missing/],
    ["unparseable JSON", { path: "config/a.json", status: "modified", base: "{}", head: "{ \"a\": " }, /^JSON: /],
  ])("catches %s that an engine gave up on", async (_case, file, error) => {
    const changes = await analyze({ files: [file] });
    expect(changes.files[0]).toMatchObject({ engine: "lines", degraded: true, error: expect.stringMatching(error) });
    expect(changes.units).toMatchObject([{ unitKind: "file", verdict: "behavioural" }]);
  });

  it("falls back for a file that takes longer than its parse budget", async () => {
    const big = Array.from({ length: 30_000 }, (_, i) => `export const v${i} = ${i};`).join("\n");
    const file: File = { path: "src/big.ts", status: "modified", base: big, head: `${big}\nexport const last = 1;\n` };
    const changes = await analyze({ files: [file] }, { budgets: { perFileMs: 0 } });
    expect(changes.files[0]).toMatchObject({ engine: "lines", error: "parsing took longer than its budget" });
    expect(changes.truncated).toBe(false);
  });
});

describe("the analysis budget", () => {
  const files: File[] = [
    { path: "src/a.ts", status: "modified", base: "export const a = 1;\n", head: "export const a = 2;\n" },
    { path: "pnpm-lock.yaml", status: "modified", base: "a", head: "b" },
  ];

  it("gives every file left the cheap fallback once time runs out, and says the result is truncated", async () => {
    const changes = await analyze({ files }, { budgets: { analysisMs: 0 } });
    expect(changes.truncated).toBe(true);
    expect(changes.files).toEqual([expect.objectContaining({ path: "src/a.ts", engine: "lines", error: "the analysis ran out of time" })]);
    expect(changes.excluded).toEqual([{ file: "pnpm-lock.yaml", reason: "lockfile" }]);
    expect(changes.units.map((u) => u.id)).toEqual(["src/a.ts#a.ts"]);
  });

  it("does the same when the caller cancels", async () => {
    const changes = await analyze({ files }, { signal: AbortSignal.abort() });
    expect(changes).toMatchObject({ truncated: true, files: [{ error: "the analysis was cancelled" }] });
  });

  it(`reads at most ${MAX_FILES} files`, async () => {
    const many: File[] = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ path: `notes/${i}.txt`, status: "added", head: "x" }));
    const changes = await analyze({ files: many });
    expect(changes.files).toHaveLength(MAX_FILES);
    expect(changes.truncated).toBe(true);
    expect((await analyze({ files: many.slice(0, MAX_FILES) })).truncated).toBe(false);
  });
});
