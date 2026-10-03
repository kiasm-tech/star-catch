import { loadRecordedSnapshots, loadSyntheticFixtures, snapshotOf } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { toAnalyzeInput } from "./input.js";
import { AnalyzeInputSchema } from "./schema.js";

describe("toAnalyzeInput", () => {
  it("keeps every file of every fixture, with its contents", () => {
    const snapshots = [...loadRecordedSnapshots(), ...loadSyntheticFixtures().map((f) => f.snapshot)];
    for (const snapshot of snapshots) {
      const input = AnalyzeInputSchema.parse(toAnalyzeInput(snapshot));
      expect(input.files.map((f) => f.path)).toEqual(snapshot.files.map((f) => f.filename));
      input.files.forEach((file, i) => {
        expect(file.base).toBe(snapshot.files[i].baseContent);
        expect(file.head).toBe(snapshot.files[i].headContent);
        expect(file.patch).toBe(snapshot.files[i].patch);
      });
    }
  });

  it("maps GitHub's statuses onto the four the analysis knows", () => {
    const file = (status: string, filename = `${status}.ts`) => ({ filename, status, additions: 1, deletions: 1 });
    const snapshot = snapshotOf(
      { fullName: "acme/shop", number: 1 },
      {
        files: [
          file("added"),
          file("removed"),
          { ...file("renamed", "new.ts"), previousFilename: "old.ts" },
          file("modified"),
          file("changed"),
          file("copied"),
        ],
      },
    );
    expect(toAnalyzeInput(snapshot).files.map((f) => [f.path, f.status, f.previousPath])).toEqual([
      ["added.ts", "added", undefined],
      ["removed.ts", "removed", undefined],
      ["new.ts", "renamed", "old.ts"],
      ["modified.ts", "modified", undefined],
      ["changed.ts", "modified", undefined],
      ["copied.ts", "modified", undefined],
    ]);
  });

  it("passes the title and body on for the classifier", () => {
    const snapshot = snapshotOf({ fullName: "acme/shop", number: 1 }, { title: "fix: rounding", body: null });
    expect(toAnalyzeInput(snapshot).pr).toEqual({ title: "fix: rounding", body: null });
  });
});
