import { createHash, timingSafeEqual } from "node:crypto";
import {
  API_LIMITS,
  CatchVersionSchema,
  RepoSettingUpdateSchema,
  type CatchList,
  type RepoSetting,
  type StoredCatch,
  type UsageList,
} from "@kiasm-tech/star-catch-contracts";
import type { CatchStore, RepoSettingsStore, RunLog, StoredVersion } from "@star-catch/pipeline";
import { Hono } from "hono";

export interface ApiDeps {
  /** The bearer token Crux sends. */
  token: string;
  catches: CatchStore;
  settings: RepoSettingsStore;
  runs: Pick<RunLog, "recent">;
  log(entry: Record<string, unknown>): void;
}

const FULL_NAME = /^[^/\s,]+\/[^/\s,]+$/;
const digest = (value: string) => createHash("sha256").update(value).digest();

/** `a/b,c/d` → the repos, or null when one isn't `owner/repo` or there are too many. */
function reposOf(query: string | undefined): string[] | null {
  const repos = (query ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  return repos.length <= API_LIMITS.repos && repos.every((r) => FULL_NAME.test(r)) ? repos : null;
}

export function createApp({ token, catches, settings, runs, log }: ApiDeps): Hono {
  const app = new Hono();
  const expected = digest(`Bearer ${token}`);

  app.get("/healthz", (c) => c.text("ok"));

  app.use("/v1/*", async (c, next) => {
    // Equal-length digests, so the comparison takes the same time whatever was sent.
    if (!timingSafeEqual(digest(c.req.header("authorization") ?? ""), expected)) return c.json({ error: "Unauthorized" }, 401);
    await next();
  });

  /** A stored version as served; one that no longer parses is logged and left out. */
  const served = (row: StoredVersion): StoredCatch | null => {
    const version = CatchVersionSchema.safeParse(row.version);
    if (version.success) return { headSha: row.headSha, generatedAt: row.generatedAt.toISOString(), version: version.data };
    log({ outcome: "unreadable-version", headSha: row.headSha, error: version.error.message });
    return null;
  };

  app.get("/v1/catches", async (c) => {
    const repos = reposOf(c.req.query("repos"));
    if (!repos) return c.json({ error: `repos must be up to ${API_LIMITS.repos} owner/repo names, comma-separated` }, 400);
    const limit = Math.min(Number(c.req.query("limit")) || API_LIMITS.defaultCatches, API_LIMITS.catches);
    const body: CatchList = { catches: (await catches.list(repos, limit)).flatMap((row) => served(row) ?? []) };
    return c.json(body);
  });

  app.get("/v1/catches/:catchId", async (c) => {
    const row = await catches.latest(c.req.param("catchId"));
    const body = row && served(row);
    return body ? c.json(body) : c.json({ error: "No such catch" }, 404);
  });

  app.get("/v1/usage", async (c) => {
    const repos = reposOf(c.req.query("repos"));
    if (!repos) return c.json({ error: `repos must be up to ${API_LIMITS.repos} owner/repo names, comma-separated` }, 400);
    const limit = Math.min(Number(c.req.query("limit")) || API_LIMITS.defaultRuns, API_LIMITS.runs);
    const body: UsageList = {
      runs: (await runs.recent(repos, limit)).map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
    };
    return c.json(body);
  });

  app.get("/v1/repos", async (c) => {
    const repos = reposOf(c.req.query("repos"));
    if (!repos) return c.json({ error: `repos must be up to ${API_LIMITS.repos} owner/repo names, comma-separated` }, 400);
    const entries: RepoSetting[] = await Promise.all(repos.map(async (fullName) => ({ fullName, enabled: await settings.isEnabled(fullName) })));
    return c.json({ repos: entries });
  });

  app.get("/v1/repos/:owner/:repo/settings", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const body: RepoSetting = { fullName, enabled: await settings.isEnabled(fullName) };
    return c.json(body);
  });

  app.put("/v1/repos/:owner/:repo/settings", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const update = RepoSettingUpdateSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!update.success) return c.json({ error: "The body must be { enabled: boolean }" }, 400);
    await settings.set(fullName, update.data.enabled);
    log({ outcome: "repo-setting", fullName, enabled: update.data.enabled });
    // Read back: a repo in the dev list stays on whatever was set.
    const body: RepoSetting = { fullName, enabled: await settings.isEnabled(fullName) };
    return c.json(body);
  });

  app.onError((error, c) => {
    log({ outcome: "error", error: error.message });
    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
