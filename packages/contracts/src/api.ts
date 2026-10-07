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

/** Tokens a generation run used for one step with one model (since 0.10.0). */
export const TokenUsageSchema = z.object({
  /** `classify` or `write`. */
  step: z.string(),
  model: z.string(),
  calls: z.number().int().nonnegative(),
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/** One generation run of a pull request, and what its model calls used. */
export const RunUsageSchema = z.object({
  fullName: FullNameSchema,
  number: z.number().int().positive(),
  headSha: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "done", "failed"]),
  usage: z.array(TokenUsageSchema),
});
export type RunUsage = z.infer<typeof RunUsageSchema>;

/** `GET /v1/usage?repos=a/b,c/d`: the latest runs, newest first (since 0.10.0). */
export const UsageListSchema = z.object({ runs: z.array(RunUsageSchema) });
export type UsageList = z.infer<typeof UsageListSchema>;

export const API_LIMITS = {
  /** Repos in one `repos=` query. */
  repos: 100,
  /** Catches in one list, and the default. */
  catches: 100,
  defaultCatches: 50,
  /** Runs in one usage list, and the default. */
  runs: 500,
  defaultRuns: 200,
} as const;
