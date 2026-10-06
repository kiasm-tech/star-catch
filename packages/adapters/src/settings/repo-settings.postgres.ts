import { repoKey } from "@kiasm-tech/star-catch-contracts";
import type { RepoSettingsStore } from "@star-catch/pipeline";
import type { StarCatchDb } from "../db/database.js";
import { EnvRepoSettings } from "./repo-settings.env.js";

/** Repo settings in Postgres, as Crux sets them; repos in STAR_CATCH_REPOS are on regardless (dev). */
export class PostgresRepoSettings implements RepoSettingsStore {
  private readonly always: EnvRepoSettings;

  constructor(
    private readonly db: StarCatchDb,
    alwaysOn?: string,
  ) {
    this.always = new EnvRepoSettings(alwaysOn);
  }

  async isEnabled(fullName: string): Promise<boolean> {
    if (await this.always.isEnabled(fullName)) return true;
    const row = await this.db.selectFrom("star_catch.repo_settings").select("enabled").where("repo", "=", repoKey(fullName)).executeTakeFirst();
    return row?.enabled ?? false;
  }

  async set(fullName: string, enabled: boolean): Promise<void> {
    await this.db
      .insertInto("star_catch.repo_settings")
      .values({ repo: repoKey(fullName), enabled })
      .onConflict((oc) => oc.column("repo").doUpdateSet({ enabled, updated_at: new Date() }))
      .execute();
  }

  async enabled(): Promise<string[]> {
    const rows = await this.db.selectFrom("star_catch.repo_settings").select("repo").where("enabled", "=", true).orderBy("repo").execute();
    return rows.map((r) => r.repo);
  }
}
