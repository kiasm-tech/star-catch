import { repoKey, type CatchVersion } from "@kiasm-tech/star-catch-contracts";
import type { CatchStore, RunLog, RunRecord, RunStatus, StoredVersion, TokenUsage } from "@star-catch/pipeline";
import { sql } from "kysely";
import type { StarCatchDb } from "./database.js";
import { toJsonb } from "./jsonb.js";

const stored = (row: { head_sha: string; created_at: Date; version: unknown }): StoredVersion => ({ headSha: row.head_sha, generatedAt: row.created_at, version: row.version });

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

  async edit(version: CatchVersion, headSha: string, basedOn: Date): Promise<boolean> {
    // Dates come back to JS in milliseconds; now() stores microseconds.
    const result = await this.db
      .updateTable("star_catch.catch_versions")
      .set({ version: toJsonb(version), created_at: new Date() })
      .where("catch_id", "=", version.catchId)
      .where("head_sha", "=", headSha)
      .where(sql<boolean>`date_trunc('milliseconds', created_at) = ${basedOn}`)
      .where(
        sql<boolean>`not exists (select 1 from star_catch.catch_versions newer where newer.catch_id = ${version.catchId} and newer.created_at > star_catch.catch_versions.created_at)`,
      )
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async latest(catchId: string): Promise<StoredVersion | null> {
    const row = await this.db
      .selectFrom("star_catch.catch_versions")
      .select(["head_sha", "created_at", "version"])
      .where("catch_id", "=", catchId)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    return row ? stored(row) : null;
  }

  async list(repos: string[], limit = 200): Promise<StoredVersion[]> {
    if (repos.length === 0) return [];
    const latest = await this.db
      .selectFrom("star_catch.catch_versions")
      .select(["catch_id", "head_sha", "created_at", "version"])
      .distinctOn("catch_id")
      .where("repo", "in", repos.map(repoKey))
      .orderBy("catch_id")
      .orderBy("created_at", "desc")
      .execute();
    return latest
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit)
      .map(stored);
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

  async finish(id: number, outcome: { status: RunStatus; step: string; error?: string; usage?: TokenUsage[] }): Promise<void> {
    await this.db
      .updateTable("star_catch.catch_runs")
      .set({
        status: outcome.status,
        step: outcome.step,
        error: outcome.error ?? null,
        finished_at: new Date(),
        usage: outcome.usage ? toJsonb(outcome.usage) : null,
      })
      .where("id", "=", String(id))
      .execute();
  }

  async recent(repos: string[], limit = 200): Promise<RunRecord[]> {
    if (repos.length === 0) return [];
    const rows = await this.db
      .selectFrom("star_catch.catch_runs")
      .select(["repo", "pr_number", "head_sha", "started_at", "finished_at", "status", "usage"])
      .where("repo", "in", repos.map(repoKey))
      .orderBy("started_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .execute();
    return rows.map((r) => ({
      fullName: r.repo,
      number: r.pr_number,
      headSha: r.head_sha,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      usage: Array.isArray(r.usage) ? (r.usage as TokenUsage[]) : [],
    }));
  }
}
