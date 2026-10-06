/** Which repos Star Catch runs on. */
export interface RepoSettings {
  isEnabled(fullName: string): Promise<boolean>;
}

/** Repo settings that can be changed: Crux turns repos on and off through the API. */
export interface RepoSettingsStore extends RepoSettings {
  set(fullName: string, enabled: boolean): Promise<void>;
  /** Every enabled repo, as stored (lower-cased). */
  enabled(): Promise<string[]>;
}
