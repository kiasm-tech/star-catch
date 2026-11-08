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
    const latest = await store.latest(first.catchId);
    expect(latest).toMatchObject({ headSha: "sha-2", generatedAt: expect.any(Date) });
    expect(CatchVersionSchema.parse(latest!.version).pr.title).toBe("A newer push");
    const rows = await db.selectFrom("star_catch.catch_versions").select("head_sha").where("catch_id", "=", first.catchId).execute();
    expect(rows.map((r) => r.head_sha).sort()).toEqual(["sha-1", "sha-2"]);
    expect(await store.latest("acme__shop__999")).toBeNull();
  });

  it("edits the version it read, and only while it is still the latest", async () => {
    const store = new PostgresCatchStore(db);
    const base = await catchOf("06-config-key");
    const titled = (title: string): CatchVersion => ({ ...base, pr: { ...base.pr, title } });
    await store.save(base, "sha-e1");
    const read = (await store.latest(base.catchId))!;

    expect(await store.edit(titled("Edited"), "sha-e1", read.generatedAt)).toBe(true);
    expect(CatchVersionSchema.parse((await store.latest(base.catchId))!.version).pr.title).toBe("Edited");
    // That read is stale now.
    expect(await store.edit(titled("Again"), "sha-e1", read.generatedAt)).toBe(false);

    const current = (await store.latest(base.catchId))!;
    await store.save(titled("Newer push"), "sha-e2");
    // An older commit's version never comes back on top.
    expect(await store.edit(titled("Late"), "sha-e1", current.generatedAt)).toBe(false);
    expect(await store.latest(base.catchId)).toMatchObject({ headSha: "sha-e2" });
  });

  it("lists the latest version of each catch in the asked repos, newest first", async () => {
    const store = new PostgresCatchStore(db);
    const older = await catchOf("03-rename-only");
    const other = { ...older, catchId: "acme__other__3", pr: { ...older.pr, fullName: "acme/other" } };
    await store.save(older, "sha-a");
    await store.save(other, "sha-b");
    const listed = (await store.list(["Acme/Shop"])).map((v) => CatchVersionSchema.parse(v.version).catchId);
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

  it("lists recent runs with the tokens they used, newest first", async () => {
    const runs = new PostgresRunLog(db);
    const first = await runs.start({ fullName: "acme/usage", number: 1, headSha: "sha-u1" });
    await runs.finish(first, { status: "done", step: "save", usage: [{ step: "classify", model: "luna", calls: 1, input: 1200, output: 300 }] });
    const second = await runs.start({ fullName: "Acme/Usage", number: 2, headSha: "sha-u2" });
    expect(await runs.recent(["ACME/usage"])).toEqual([
      expect.objectContaining({ number: 2, status: "running", finishedAt: null, usage: [] }),
      expect.objectContaining({ number: 1, headSha: "sha-u1", status: "done", usage: [{ step: "classify", model: "luna", calls: 1, input: 1200, output: 300 }] }),
    ]);
    expect(second).toBeGreaterThan(first);
    expect(await runs.recent([])).toEqual([]);
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
