import { CatchListSchema, EditErrorSchema, RepoSettingSchema, StoredCatchSchema, UsageListSchema, type CatchVersion, type ScriptSection } from "@kiasm-tech/star-catch-contracts";
import { buildCatch, mockClassifier, templateWriter, type ScriptWriter, type StoredVersion } from "@star-catch/pipeline";
import { loadSyntheticFixtures } from "@star-catch/testkit";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp, type ApiDeps } from "./http.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let version: CatchVersion;

beforeAll(async () => {
  version = await buildCatch(loadSyntheticFixtures()[0]!.snapshot, { classifier: mockClassifier, writer: templateWriter });
});

function setUp(
  rows: StoredVersion[] = [{ headSha: "abc1234", generatedAt: new Date("2026-10-05T10:00:00Z"), version }],
  { revise = null as ApiDeps["revise"], edited = [] as CatchVersion[] } = {},
) {
  const enabled = new Set<string>(["acme/shop"]);
  const logs: Record<string, unknown>[] = [];
  const asked: { repos: string[]; limit?: number }[] = [];
  const app = createApp({
    token: TOKEN,
    catches: {
      save: async () => {},
      edit: async (v) => {
        edited.push(v);
        return true;
      },
      latest: async (id) => rows.find((r) => (r.version as CatchVersion).catchId === id) ?? null,
      list: async (repos, limit) => {
        asked.push({ repos, limit });
        return rows;
      },
    },
    settings: {
      isEnabled: async (fullName) => enabled.has(fullName.toLowerCase()),
      set: async (fullName, on) => void (on ? enabled.add(fullName.toLowerCase()) : enabled.delete(fullName.toLowerCase())),
      enabled: async () => [...enabled],
    },
    runs: {
      recent: async () => [
        {
          fullName: "acme/shop",
          number: 7,
          headSha: "abc1234",
          startedAt: new Date("2026-10-07T10:00:00Z"),
          finishedAt: new Date("2026-10-07T10:01:30Z"),
          status: "done" as const,
          usage: [{ step: "classify", model: "gpt-6-luna", calls: 1, input: 12_000, output: 3_000 }],
        },
      ],
    },
    revise,
    log: (entry) => void logs.push(entry),
  });
  return { app, logs, asked };
}

describe("api", () => {
  it("answers health checks without a token", async () => {
    expect((await setUp().app.request("/healthz")).status).toBe(200);
  });

  it.each([undefined, "Bearer wrong", `Bearer ${TOKEN}x`, TOKEN])("refuses %s", async (authorization) => {
    const res = await setUp().app.request("/v1/catches?repos=acme/shop", { headers: authorization ? { authorization } : {} });
    expect(res.status).toBe(401);
  });

  it("lists the catches of the asked repos, as the contract reads them", async () => {
    const { app, asked } = setUp();
    const res = await app.request("/v1/catches?repos=acme/shop,%20acme/api&limit=500", { headers: auth });
    expect(res.status).toBe(200);
    const body = CatchListSchema.parse(await res.json());
    expect(body.catches).toEqual([{ headSha: "abc1234", generatedAt: "2026-10-05T10:00:00.000Z", version }]);
    expect(asked).toEqual([{ repos: ["acme/shop", "acme/api"], limit: 100 }]);
  });

  it.each(["?repos=acme", "?repos=a/b/c", `?repos=${Array.from({ length: 101 }, (_, i) => `o/r${i}`).join(",")}`])("rejects the repo list %s", async (query) => {
    expect((await setUp().app.request(`/v1/catches${query}`, { headers: auth })).status).toBe(400);
  });

  it("leaves out, and logs, a stored version that no longer parses", async () => {
    const { app, logs } = setUp([{ headSha: "old", generatedAt: new Date(), version: { catchId: "nope" } }]);
    const body = CatchListSchema.parse(await (await app.request("/v1/catches?repos=acme/shop", { headers: auth })).json());
    expect(body.catches).toEqual([]);
    expect(logs).toEqual([expect.objectContaining({ outcome: "unreadable-version", headSha: "old" })]);
  });

  it("serves one catch, or 404", async () => {
    const { app } = setUp();
    const res = await app.request(`/v1/catches/${version.catchId}`, { headers: auth });
    expect(StoredCatchSchema.parse(await res.json()).version.catchId).toBe(version.catchId);
    expect((await app.request("/v1/catches/acme__shop__1", { headers: auth })).status).toBe(404);
  });

  it("reads and switches a repo", async () => {
    const { app, logs } = setUp();
    const read = async (path: string) => RepoSettingSchema.parse(await (await app.request(path, { headers: auth })).json());
    expect(await read("/v1/repos/acme/api/settings")).toEqual({ fullName: "acme/api", enabled: false });

    const put = await app.request("/v1/repos/acme/api/settings", { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body: '{"enabled":true}' });
    expect(RepoSettingSchema.parse(await put.json())).toEqual({ fullName: "acme/api", enabled: true });
    expect(logs).toEqual([{ outcome: "repo-setting", fullName: "acme/api", enabled: true }]);

    const many = await (await app.request("/v1/repos?repos=acme/api,acme/web", { headers: auth })).json();
    expect(many).toEqual({ repos: [{ fullName: "acme/api", enabled: true }, { fullName: "acme/web", enabled: false }] });
  });

  it("lists the runs of the asked repos with the tokens they used", async () => {
    const res = await setUp().app.request("/v1/usage?repos=acme/shop", { headers: auth });
    expect(UsageListSchema.parse(await res.json())).toEqual({
      runs: [
        {
          fullName: "acme/shop",
          number: 7,
          headSha: "abc1234",
          startedAt: "2026-10-07T10:00:00.000Z",
          finishedAt: "2026-10-07T10:01:30.000Z",
          status: "done",
          usage: [{ step: "classify", model: "gpt-6-luna", calls: 1, input: 12_000, output: 3_000 }],
        },
      ],
    });
    expect((await setUp().app.request("/v1/usage?repos=nope", { headers: auth })).status).toBe(400);
  });

  it("rejects a settings body that isn't { enabled }", async () => {
    const res = await setUp().app.request("/v1/repos/acme/api/settings", { method: "PUT", headers: auth, body: "on" });
    expect(res.status).toBe(400);
  });

  describe("edits", () => {
    const { snapshot } = loadSyntheticFixtures().find((f) => f.name === "05-condition-change")!;
    let draft: CatchVersion;
    beforeAll(async () => {
      draft = await buildCatch(snapshot, { classifier: mockClassifier, writer: templateWriter });
    });
    const rows = (v = draft): StoredVersion[] => [{ headSha: "abc1234", generatedAt: new Date("2026-10-05T10:00:00Z"), version: v }];
    const json = { ...auth, "content-type": "application/json" };
    const spoken = (): ScriptSection => draft.technical!.chapters.flatMap((c) => c.sections).find((s) => Object.keys(s.reveals).length > 0)!;
    const put = (app: ReturnType<typeof setUp>["app"], body: unknown, id = draft.catchId) =>
      app.request(`/v1/catches/${id}/narration`, { method: "PUT", headers: json, body: JSON.stringify(body) });
    const post = (app: ReturnType<typeof setUp>["app"], body: unknown) =>
      app.request(`/v1/catches/${draft.catchId}/revise`, { method: "POST", headers: json, body: JSON.stringify(body) });

    it("sets a section's narration and answers the edited catch", async () => {
      const edited: CatchVersion[] = [];
      const { app, logs } = setUp(rows(), { edited });
      const res = await put(app, { cut: "technical", sectionId: spoken().id, narration: '  <mark name="m1"/>In plain words.  ' });
      expect(res.status).toBe(200);
      const body = StoredCatchSchema.parse(await res.json());
      expect(body.headSha).toBe("abc1234");
      expect(body.version).toEqual(edited[0]);
      expect(body.version.technical!.chapters.flatMap((c) => c.sections).find((s) => s.id === spoken().id)!.narration).toBe('<mark name="m1"/>In plain words.');
      expect(logs).toEqual([{ outcome: "narration-edited", catchId: draft.catchId }]);
    });

    it.each([
      [{ cut: "technical", sectionId: "x" }, 400],
      [{ cut: "video", sectionId: "x", narration: "Hi." }, 400],
      [{ cut: "technical", sectionId: "x", narration: "x".repeat(4_001) }, 400],
      [{ cut: "technical", sectionId: "nope", narration: "Hi." }, 404],
    ])("answers %j with %i", async (body, status) => {
      expect((await put(setUp(rows()).app, body)).status).toBe(status);
    });

    it("explains a refused edit", async () => {
      const res = await put(setUp(rows()).app, { cut: "technical", sectionId: spoken().id, narration: '<mark name="zz"/>Hi.' });
      expect(res.status).toBe(422);
      expect(EditErrorSchema.parse(await res.json()).reasons).toEqual(['no element or voice mark named "zz"']);
      expect((await put(setUp(rows()).app, { cut: "technical", sectionId: spoken().id, narration: "Hi." }, "acme__shop__1")).status).toBe(404);
    });

    it("rewords a section's picture, and refuses one that changed more than its words", async () => {
      const section = spoken();
      const visual = section.visual;
      const label = (v: typeof visual): typeof visual => JSON.parse(JSON.stringify(v).replace(/"label":"[^"]*"/, '"label":"Reworded"'));
      const visualPut = (app: ReturnType<typeof setUp>["app"], body: unknown) =>
        app.request(`/v1/catches/${draft.catchId}/visual`, { method: "PUT", headers: json, body: JSON.stringify(body) });

      const { app, logs } = setUp(rows());
      const res = await visualPut(app, { cut: "technical", sectionId: section.id, visual: label(visual) });
      expect(res.status).toBe(200);
      const body = StoredCatchSchema.parse(await res.json());
      expect(body.version.technical!.chapters.flatMap((c) => c.sections).find((s) => s.id === section.id)!.visual).toEqual(label(visual));
      expect(logs).toEqual([{ outcome: "visual-edited", catchId: draft.catchId }]);

      const moved = JSON.parse(JSON.stringify(visual).replace(/"id":"[^"]*"/, '"id":"elsewhere"'));
      const refused = await visualPut(setUp(rows()).app, { cut: "technical", sectionId: section.id, visual: moved });
      expect(refused.status).toBe(422);
      expect(EditErrorSchema.parse(await refused.json()).reasons![0]).toMatch(/\.id can't change/);
      expect((await visualPut(setUp(rows()).app, { cut: "technical", sectionId: section.id, visual: { type: "nope" } })).status).toBe(400);
    });

    it("closes edits once the PR is merged", async () => {
      const merged = { ...draft, pr: { ...draft.pr, state: "merged" as const } };
      const res = await put(setUp(rows(merged)).app, { cut: "technical", sectionId: spoken().id, narration: "Hi." });
      expect(res.status).toBe(409);
      expect(EditErrorSchema.parse(await res.json())).toEqual({ code: "not-draft", error: "Published — edits are closed" });
    });

    it("is 503 without a model to revise with", async () => {
      const res = await post(setUp(rows()).app, { cut: "technical", sectionId: spoken().id, instruction: "Shorter" });
      expect(res.status).toBe(503);
      expect(EditErrorSchema.parse(await res.json()).code).toBe("not-configured");
      expect((await post(setUp(rows()).app, { cut: "technical", sectionId: spoken().id })).status).toBe(400);
    });

    const reviser = (writer: ScriptWriter): ApiDeps["revise"] => () => ({
      snapshots: { has: async () => true, save: async () => {}, find: async () => snapshot },
      ports: { classifier: mockClassifier, writer },
    });

    it("revises a section with the writer, as instructed", async () => {
      const asked: (string | undefined)[] = [];
      const writer: ScriptWriter = {
        id: "fake",
        write: async (request) => {
          asked.push(request.instruction);
          return [{ text: "Shorter, as asked.", sources: ["pr:title"] }];
        },
      };
      const res = await post(setUp(rows(), { revise: reviser(writer) }).app, { cut: "technical", sectionId: spoken().id, instruction: "Shorter" });
      expect(res.status).toBe(200);
      const section = StoredCatchSchema.parse(await res.json()).version.technical!.chapters.flatMap((c) => c.sections).find((s) => s.id === spoken().id)!;
      expect(section.narration).toBe("Shorter, as asked.");
      expect(asked).toEqual(["Shorter"]);
    });

    it("is 502 when the writer fails", async () => {
      const writer: ScriptWriter = { id: "broken", write: async () => Promise.reject(new Error("down")) };
      const { app, logs } = setUp(rows(), { revise: reviser(writer) });
      expect((await post(app, { cut: "technical", sectionId: spoken().id, instruction: "Shorter" })).status).toBe(502);
      expect(logs).toEqual([expect.objectContaining({ outcome: "revise-failed", error: "down" })]);
    });
  });
});
