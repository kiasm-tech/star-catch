import { repoKey, type CatchVersion } from "@kiasm-tech/star-catch-contracts";
import type { CatchStore, RunLog, RunStatus } from "@star-catch/pipeline";
import type { StarCatchDb } from "./database.js";
import { toJsonb } from "./jsonb.js";

export class PostgresCatchStore implements CatchStore {
  constructor(private readonly db: StarCatchDb) {}

  async save(version: CatchVersion, headSha: string): Promise<void> {
    const row = { catch_id: version.catchId, head_sha: headSha, repo: repoKey(version.pr.fullName), pr_number: version.pr.number, version: toJsonb(version) };
    await this.db
      .insertInto("star_catch.catch_versions")
      .values(row)
      .onConflict((oc) => oc.columns(["catch_id", "head_sha"]).doUpdateSet({ version: row.version, created_at: new Date() }))
      .execute();
  }

  async latest(catchId: string): Promise<unknown> {
    const row = await this.db
      .selectFrom("star_catch.catch_versions")
      .select("version")
      .where("catch_id", "=", catchId)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    return row?.version ?? null;
  }

  async list(repos: string[], limit = 200): Promise<unknown[]> {
    if (repos.length === 0) return [];
    const latest = await this.db
      .selectFrom("star_catch.catch_versions")
      .select(["catch_id", "created_at", "version"])
      .distinctOn("catch_id")
      .where("repo", "in", repos.map(repoKey))
      .orderBy("catch_id")
      .orderBy("created_at", "desc")
      .execute();
    return latest
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit)
      .map((row) => row.version);
  }
}

export class PostgresRunLog implements RunLog {
  constructor(private readonly db: StarCatchDb) {}

  async start(run: { fullName: string; number: number; headSha: string }): Promise<number> {
    const row = await this.db
      .insertInto("star_catch.catch_runs")
      .values({ repo: repoKey(run.fullName), pr_number: run.number, head_sha: run.headSha })
      .returning("id")
      .executeTakeFirstOrThrow();
    return Number(row.id);
  }

  async finish(id: number, outcome: { status: RunStatus; step: string; error?: string }): Promise<void> {
    await this.db
      .updateTable("star_catch.catch_runs")
      .set({ status: outcome.status, step: outcome.step, error: outcome.error ?? null, finished_at: new Date() })
      .where("id", "=", String(id))
      .execute();
  }
}
