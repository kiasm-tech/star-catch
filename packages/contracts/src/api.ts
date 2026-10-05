/** What the Star Catch API serves Crux, under /v1 with a bearer token. */
import { z } from "zod";
import { CatchVersionSchema } from "./catch.js";

const FullNameSchema = z.string().regex(/^[^/\s]+\/[^/\s]+$/);

/** A catch's latest version, with the head commit it was built from. */
export const StoredCatchSchema = z.object({
  headSha: z.string(),
  generatedAt: z.string(),
  version: CatchVersionSchema,
});
export type StoredCatch = z.infer<typeof StoredCatchSchema>;

/** `GET /v1/catches?repos=a/b,c/d`: the latest version of each catch, newest first. */
export const CatchListSchema = z.object({ catches: z.array(StoredCatchSchema) });
export type CatchList = z.infer<typeof CatchListSchema>;

/** `GET`/`PUT /v1/repos/:owner/:repo/settings`, and each entry of `GET /v1/repos?repos=`. */
export const RepoSettingSchema = z.object({ fullName: FullNameSchema, enabled: z.boolean() });
export type RepoSetting = z.infer<typeof RepoSettingSchema>;

export const RepoSettingListSchema = z.object({ repos: z.array(RepoSettingSchema) });
export type RepoSettingList = z.infer<typeof RepoSettingListSchema>;

/** The body of `PUT /v1/repos/:owner/:repo/settings`. */
export const RepoSettingUpdateSchema = z.object({ enabled: z.boolean() });

export const API_LIMITS = {
  /** Repos in one `repos=` query. */
  repos: 100,
  /** Catches in one list, and the default. */
  catches: 100,
  defaultCatches: 50,
} as const;
