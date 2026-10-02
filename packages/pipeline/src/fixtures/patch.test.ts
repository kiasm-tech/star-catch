import { describe, expect, it } from "vitest";
import { applyPatch, countPatchLines } from "./patch.js";

const base = "a\nb\nc\n";
const patch = "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c";

describe("patch", () => {
  it("applies a hunk to its base", () => {
    expect(applyPatch(base, patch)).toBe("a\nB\nc\n");
  });

  it("creates and deletes whole files", () => {
    expect(applyPatch("", "@@ -0,0 +1,2 @@\n+x\n+y")).toBe("x\ny\n");
    expect(applyPatch("x\n", "@@ -1 +0,0 @@\n-x")).toBe("");
  });

  it("rejects a patch that doesn't match its base", () => {
    expect(() => applyPatch("a\nz\nc\n", patch)).toThrow(/line 2/);
  });

  it("counts added and removed lines", () => {
    expect(countPatchLines(patch)).toEqual({ additions: 1, deletions: 1 });
  });
});
