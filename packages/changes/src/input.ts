import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import type { AnalyzeInput } from "./schema.js";

type Status = AnalyzeInput["files"][number]["status"];

/** GitHub also reports "changed", "copied" and "unchanged"; each has a base and a head to compare. */
function statusOf(status: string): Status {
  return status === "added" || status === "removed" || status === "renamed" ? status : "modified";
}

export function toAnalyzeInput(snapshot: PullRequestSnapshot): AnalyzeInput {
  return {
    files: snapshot.files.map((file) => ({
      path: file.filename,
      ...(file.previousFilename !== undefined && { previousPath: file.previousFilename }),
      status: statusOf(file.status),
      ...(file.baseContent !== undefined && { base: file.baseContent }),
      ...(file.headContent !== undefined && { head: file.headContent }),
      ...(file.patch !== undefined && { patch: file.patch }),
    })),
    pr: { title: snapshot.title, body: snapshot.body },
  };
}
