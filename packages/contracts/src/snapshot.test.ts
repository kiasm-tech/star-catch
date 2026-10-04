import { describe, expect, it } from "vitest";
import { BINARY_EXTENSION_PATTERN, LOCKFILE_PATTERN, parseLinkedIssueNumbers, repoKey } from "./snapshot.js";

describe("parseLinkedIssueNumbers", () => {
  it("finds closing keywords in any case, first mention first", () => {
    expect(
      parseLinkedIssueNumbers("Closes #12. Also fixes #7, and RESOLVED #12 again. Fix: #3"),
    ).toEqual([12, 7, 3]);
  });

  it("ignores plain mentions and cross-repo references", () => {
    expect(parseLinkedIssueNumbers("See #4. Closes acme/api#9. Related to #5.")).toEqual([]);
  });

  it("handles an empty body", () => {
    expect(parseLinkedIssueNumbers(null)).toEqual([]);
    expect(parseLinkedIssueNumbers("")).toEqual([]);
  });
});

describe("repoKey", () => {
  it("lower-cases and trims", () => {
    expect(repoKey(" PMNDRS/Zustand ")).toBe("pmndrs/zustand");
  });
});

describe("file patterns", () => {
  it.each(["pnpm-lock.yaml", "web/package-lock.json", "bun.lock", "bun.lockb", "go.sum", "ios/Podfile.lock"])(
    "%s is a lockfile",
    (path) => expect(LOCKFILE_PATTERN.test(path)).toBe(true),
  );

  it.each(["src/lock.ts", "pnpm-lock.yaml.bak", "docs/yarn.lock.md"])("%s is not a lockfile", (path) =>
    expect(LOCKFILE_PATTERN.test(path)).toBe(false),
  );

  it.each([
    ["logo.PNG", true],
    ["fonts/inter.woff2", true],
    ["grammars/tree-sitter.wasm", true],
    ["src/png.ts", false],
    ["notes.binary.md", false],
  ])("%s binary by extension: %s", (path, binary) => expect(BINARY_EXTENSION_PATTERN.test(path)).toBe(binary));
});
