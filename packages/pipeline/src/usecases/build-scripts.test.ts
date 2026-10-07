import { snapshotOf } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { mockClassifier } from "../classifier.js";
import { templateWriter } from "../script/template-writer.js";
import { buildScripts } from "./build-scripts.js";

describe("buildScripts", () => {
  it("puts the branch and the PR's size on the title card, the lockfile left out", async () => {
    const snapshot = snapshotOf(
      { fullName: "acme/shop", number: 7 },
      {
        headRef: "feat/opening-hours",
        files: [
          { filename: "src/hours.ts", status: "added", additions: 40, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+export const open = true;", headContent: "export const open = true;\n" },
          { filename: "README.md", status: "modified", additions: 3, deletions: 1 },
          { filename: "package-lock.json", status: "modified", additions: 1600, deletions: 20 },
        ],
      },
    );
    const { technical } = await buildScripts(snapshot, { classifier: mockClassifier, writer: templateWriter });
    const title = technical!.chapters[0]!.sections[0]!.visual;
    expect(title).toMatchObject({ type: "titleCard", data: { branch: "feat/opening-hours", size: { files: 2, additions: 43, deletions: 1 } } });
  });
});
