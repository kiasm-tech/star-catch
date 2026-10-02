import { repoKey, type PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import type { SnapshotStore } from "@star-catch/pipeline";
import type { StarCatchDb } from "./database.js";
import { toJsonb } from "./jsonb.js";

export class PostgresSnapshotStore implements SnapshotStore {
  constructor(private readonly db: StarCatchDb) {}

  async has(fullName: string, headSha: string): Promise<boolean> {
    return (await this.row(fullName, headSha)) !== undefined;
  }

  async save(snapshot: PullRequestSnapshot): Promise<void> {
    await this.db
      .insertInto("star_catch.pr_snapshots")
      .values({
        repo: repoKey(snapshot.fullName),
        head_sha: snapshot.headSha,
        pr_number: snapshot.number,
        snapshot: toJsonb(snapshot),
      })
      .onConflict((oc) => oc.columns(["repo", "head_sha"]).doNothing())
      .execute();
  }

  async find(fullName: string, headSha: string): Promise<unknown> {
    return (await this.row(fullName, headSha))?.snapshot ?? null;
  }

  private row(fullName: string, headSha: string) {
    return this.db
      .selectFrom("star_catch.pr_snapshots")
      .select("snapshot")
      .where("repo", "=", repoKey(fullName))
      .where("head_sha", "=", headSha)
      .executeTakeFirst();
  }
}
