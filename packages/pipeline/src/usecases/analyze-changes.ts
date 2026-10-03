import { PullRequestSnapshotSchema } from "@kiasm-tech/star-catch-contracts";
import { analyze, toAnalyzeInput, type AnalyzeOptions, type ChangeSet } from "@star-catch/changes";

/** A pull request snapshot, as stored or recorded, → its change units. Callers pass raw JSON. */
export async function analyzeChanges(snapshot: unknown, options?: AnalyzeOptions): Promise<ChangeSet> {
  return analyze(toAnalyzeInput(PullRequestSnapshotSchema.parse(snapshot)), options);
}
