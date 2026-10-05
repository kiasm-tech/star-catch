import { CatchListSchema, RepoSettingSchema, StoredCatchSchema, type CatchVersion } from "@kiasm-tech/star-catch-contracts";
import { buildCatch, mockClassifier, templateWriter, type StoredVersion } from "@star-catch/pipeline";
import { loadSyntheticFixtures } from "@star-catch/testkit";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./http.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let version: CatchVersion;

beforeAll(async () => {
  version = await buildCatch(loadSyntheticFixtures()[0]!.snapshot, { classifier: mockClassifier, writer: templateWriter });
});

function setUp(rows: StoredVersion[] = [{ headSha: "abc1234", generatedAt: new Date("2026-10-05T10:00:00Z"), version }]) {
  const enabled = new Set<string>(["acme/shop"]);
  const logs: Record<string, unknown>[] = [];
  const asked: { repos: string[]; limit?: number }[] = [];
  const app = createApp({
    token: TOKEN,
    catches: {
      save: async () => {},
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

  it("rejects a settings body that isn't { enabled }", async () => {
    const res = await setUp().app.request("/v1/repos/acme/api/settings", { method: "PUT", headers: auth, body: "on" });
    expect(res.status).toBe(400);
  });
});
