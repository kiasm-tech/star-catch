import { PullRequestSnapshotSchema, type PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import type { FixtureReader, PullRequestRef, PullRequestSource } from "@star-catch/pipeline";

/** Serves recorded snapshots, so nothing that asks for a pull request needs the network. */
export class RecordedPullRequestSource implements PullRequestSource {
  constructor(private readonly fixtures: FixtureReader) {}

  async snapshot(ref: PullRequestRef): Promise<PullRequestSnapshot> {
    for (const { data } of await this.fixtures.recordedSnapshots()) {
      const snapshot = PullRequestSnapshotSchema.parse(data);
      if (snapshot.fullName.toLowerCase() === ref.fullName.toLowerCase() && snapshot.number === ref.number) {
        return snapshot;
      }
    }
    throw new Error(
      `No recorded snapshot for ${ref.fullName}#${ref.number}; record it with STAR_CATCH_MOCK=false pnpm cli record`,
    );
  }
}
