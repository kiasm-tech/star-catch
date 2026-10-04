import { repoKey } from "@kiasm-tech/star-catch-contracts";
import type { RepoSettings } from "@star-catch/pipeline";

/** STAR_CATCH_REPOS="owner/a, owner/b"; unset or empty enables nothing. */
export class EnvRepoSettings implements RepoSettings {
  private readonly enabled: Set<string>;

  constructor(list: string | undefined) {
    this.enabled = new Set((list ?? "").split(",").map((name) => name.trim()).filter(Boolean).map(repoKey));
  }

  async isEnabled(fullName: string): Promise<boolean> {
    return this.enabled.has(repoKey(fullName));
  }
}
