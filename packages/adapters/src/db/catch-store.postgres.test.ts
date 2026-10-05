import { CatchVersionSchema, type CatchVersion } from "@kiasm-tech/star-catch-contracts";
import { buildCatch, mockClassifier, templateWriter } from "@star-catch/pipeline";
import { freshDatabase, loadSyntheticFixtures, type TestDatabase } from "@star-catch/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresRepoSettings } from "../settings/repo-settings.postgres.js";
import { PostgresCatchStore, PostgresRunLog } from "./catch-store.postgres.js";
import { connect, type StarCatchDb } from "./database.js";
import { migrate } from "./migrate.js";

let database: TestDatabase;
let db: StarCatchDb;
const fixtures = loadSyntheticFixtures();
const catchOf = (name: string) => buildCatch(fixtures.find((f) => f.name === name)!.snapshot, { classifier: mockClassifier, writer: templateWriter });

beforeAll(async () => {
  database = await freshDatabase();
  db = connect(database.url);
  await migrate(db);
});

afterAll(async () => {
  await db.destroy();
  await database.drop();
});

describe("PostgresCatchStore", () => {
  it("keeps one version per head commit and reads back the latest", async () => {
    const store = new PostgresCatchStore(db);
    const first = await catchOf("05-condition-change");
    const second: CatchVersion = { ...first, pr: { ...first.pr, title: "A newer push" } };
    await store.save(first, "sha-1");
    await store.save(second, "sha-2");
    await store.save(second, "sha-2");
    expect(CatchVersionSchema.parse(await store.latest(first.catchId)).pr.title).toBe("A newer push");
    const rows = await db.selectFrom("star_catch.catch_versions").select("head_sha").where("catch_id", "=", first.catchId).execute();
    expect(rows.map((r) => r.head_sha).sort()).toEqual(["sha-1", "sha-2"]);
    expect(await store.latest("acme__shop__999")).toBeNull();
  });

  it("lists the latest version of each catch in the asked repos, newest first", async () => {
    const store = new PostgresCatchStore(db);
    const older = await catchOf("03-rename-only");
    const other = { ...older, catchId: "acme__other__3", pr: { ...older.pr, fullName: "acme/other" } };
    await store.save(older, "sha-a");
    await store.save(other, "sha-b");
    const listed = (await store.list(["Acme/Shop"])).map((v) => CatchVersionSchema.parse(v).catchId);
    expect(listed[0]).toBe(older.catchId);
    expect(listed).toContain("acme__shop__105");
    expect(listed).not.toContain("acme__other__3");
    expect(await store.list([])).toEqual([]);
  });
});

describe("PostgresRunLog", () => {
  it("records a run from start to how it ended", async () => {
    const runs = new PostgresRunLog(db);
    const id = await runs.start({ fullName: "Acme/Shop", number: 7, headSha: "sha-7" });
    await runs.finish(id, { status: "failed", step: "write", error: "timeout" });
    const row = await db.selectFrom("star_catch.catch_runs").selectAll().where("id", "=", String(id)).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ repo: "acme/shop", pr_number: 7, status: "failed", step: "write", error: "timeout" });
    expect(row.finished_at).toBeInstanceOf(Date);
  });
});

describe("PostgresRepoSettings", () => {
  it("turns repos on and off, in any case, with the dev list always on", async () => {
    const settings = new PostgresRepoSettings(db, "pmndrs/zustand");
    expect(await settings.isEnabled("acme/shop")).toBe(false);
    await settings.set("Acme/Shop", true);
    expect(await settings.isEnabled("acme/SHOP")).toBe(true);
    await settings.set("acme/shop", false);
    expect(await settings.isEnabled("acme/shop")).toBe(false);
    expect(await settings.isEnabled("PMNDRS/zustand")).toBe(true);
    await settings.set("acme/api", true);
    expect(await settings.enabled()).toEqual(["acme/api"]);
  });
});
