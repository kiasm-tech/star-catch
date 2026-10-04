/** Which repos Star Catch runs on; Crux's settings own the answer once they move to Postgres. */
export interface RepoSettings {
  isEnabled(fullName: string): Promise<boolean>;
}
