import { createHash, timingSafeEqual } from "node:crypto";
import {
  API_LIMITS,
  CatchVersionSchema,
  NarrationEditSchema,
  RepoSettingUpdateSchema,
  RevisionRequestSchema,
  VisualEditSchema,
  type CatchList,
  type EditError,
  type RepoSetting,
  type StoredCatch,
  type UsageList,
} from "@kiasm-tech/star-catch-contracts";
import {
  editNarration,
  editVisual,
  reviseNarration,
  type CatchStore,
  type EditOutcome,
  type RepoSettingsStore,
  type ReviseDeps,
  type RunLog,
  type StoredVersion,
} from "@star-catch/pipeline";
import { Hono, type Context } from "hono";

export interface ApiDeps {
  /** The bearer token Crux sends. */
  token: string;
  catches: CatchStore;
  settings: RepoSettingsStore;
  runs: Pick<RunLog, "recent">;
  /** What the writer needs to revise a section, fresh per request so usage isn't shared; null without a model. */
  revise: (() => Omit<ReviseDeps, "catches">) | null;
  /** How long a revision may take before it's abandoned. */
  reviseMs?: number;
  log(entry: Record<string, unknown>): void;
}

const REVISE_MS = 90_000;

const refused = (code: EditError["code"], error: string): EditError => ({ code, error });

const EDIT_STATUS = { "no-catch": 404, "no-section": 404, "not-draft": 409, conflict: 409, "no-snapshot": 409, invalid: 422 } as const;
const EDIT_ERROR: Record<keyof typeof EDIT_STATUS, string> = {
  "no-catch": "No such catch",
  "no-section": "No such section in that cut",
  "not-draft": "Published — edits are closed",
  conflict: "The catch changed since it was read; read it again",
  "no-snapshot": "The pull request's snapshot is gone; regenerate it instead",
  invalid: "The edit didn't pass the checks",
};

const FULL_NAME = /^[^/\s,]+\/[^/\s,]+$/;
const digest = (value: string) => createHash("sha256").update(value).digest();

/** `a/b,c/d` → the repos, or null when one isn't `owner/repo` or there are too many. */
function reposOf(query: string | undefined): string[] | null {
  const repos = (query ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  return repos.length <= API_LIMITS.repos && repos.every((r) => FULL_NAME.test(r)) ? repos : null;
}

export function createApp({ token, catches, settings, runs, revise, reviseMs = REVISE_MS, log }: ApiDeps): Hono {
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

  /** An edit's outcome as the API answers it: the edited catch, or why not. */
  const answer = (c: Context, catchId: string, kind: string, result: EditOutcome) => {
    log({ outcome: `${kind}-${result.outcome}`, catchId, ...("reasons" in result && { reasons: result.reasons }) });
    if (result.outcome === "edited") {
      const body: StoredCatch = { headSha: result.headSha, generatedAt: result.generatedAt.toISOString(), version: result.version };
      return c.json(body);
    }
    const body: EditError = { code: result.outcome, error: EDIT_ERROR[result.outcome], ...("reasons" in result && { reasons: result.reasons }) };
    return c.json(body, EDIT_STATUS[result.outcome]);
  };

  app.put("/v1/catches/:catchId/narration", async (c) => {
    const edit = NarrationEditSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!edit.success) return c.json(refused("bad-request", `The body must be { cut, sectionId, narration } with up to ${API_LIMITS.narration} characters`), 400);
    const catchId = c.req.param("catchId");
    return answer(c, catchId, "narration", await editNarration({ catches }, catchId, edit.data));
  });

  app.put("/v1/catches/:catchId/visual", async (c) => {
    const edit = VisualEditSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!edit.success) return c.json(refused("bad-request", "The body must be { cut, sectionId, visual } with a picture that passes its schema"), 400);
    const catchId = c.req.param("catchId");
    return answer(c, catchId, "visual", await editVisual({ catches }, catchId, edit.data));
  });

  app.post("/v1/catches/:catchId/revise", async (c) => {
    const request = RevisionRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!request.success) return c.json(refused("bad-request", `The body must be { cut, sectionId, instruction } with up to ${API_LIMITS.instruction} characters`), 400);
    if (!revise) return c.json(refused("not-configured", "Revising with a model isn't configured"), 503);
    const catchId = c.req.param("catchId");
    const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(reviseMs)]);
    try {
      return answer(c, catchId, "revise", await reviseNarration({ ...revise(), catches }, catchId, request.data, signal));
    } catch (error) {
      log({ outcome: "revise-failed", catchId, error: error instanceof Error ? error.message : String(error) });
      return c.json(refused("writer-failed", "The writer failed; try again"), 502);
    }
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
