import { CatchListSchema, RepoSettingSchema } from "@kiasm-tech/star-catch-contracts";
import { connect, migrate, PostgresCatchStore, type StarCatchDb } from "@star-catch/adapters";
import { buildCatch, mockClassifier, templateWriter } from "@star-catch/pipeline";
import { freshDatabase, loadSyntheticFixtures, type TestDatabase } from "@star-catch/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compose, type Api } from "./compose.js";

const auth = { authorization: "Bearer t0ken" };
let database: TestDatabase;
let db: StarCatchDb;
let api: Api;

beforeAll(async () => {
  database = await freshDatabase();
  db = connect(database.url);
  await migrate(db);
  api = await compose({ DATABASE_URL: database.url, STAR_CATCH_API_TOKEN: "t0ken", STAR_CATCH_REPOS: "pmndrs/zustand" }, () => {});
});

afterAll(async () => {
  await api?.stop();
  await db?.destroy();
  await database?.drop();
});

describe("compose", () => {
  it("serves what the worker stored, and the switches Crux sets", async () => {
    const version = await buildCatch(loadSyntheticFixtures()[0]!.snapshot, { classifier: mockClassifier, writer: templateWriter });
    await new PostgresCatchStore(db).save(version, "abc1234");
    const list = CatchListSchema.parse(await (await api.app.request(`/v1/catches?repos=${version.pr.fullName}`, { headers: auth })).json());
    expect(list.catches.map((c) => c.version.catchId)).toEqual([version.catchId]);

    await api.app.request("/v1/repos/acme/shop/settings", { method: "PUT", headers: auth, body: '{"enabled":true}' });
    const read = async (path: string) => RepoSettingSchema.parse(await (await api.app.request(path, { headers: auth })).json()).enabled;
    expect(await read("/v1/repos/acme/shop/settings")).toBe(true);
    expect(await read("/v1/repos/pmndrs/zustand/settings")).toBe(true);
  });

  it("needs a database and a token", async () => {
    await expect(compose({})).rejects.toThrow("DATABASE_URL, STAR_CATCH_API_TOKEN");
  });
});
