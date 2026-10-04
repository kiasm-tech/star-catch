import { freshDatabase, snapshotOf, type TestDatabase } from "@star-catch/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type StarCatchDb } from "./database.js";
import { PostgresDeliveryStore } from "./delivery-store.postgres.js";
import { migrate } from "./migrate.js";
import { PostgresSnapshotStore } from "./snapshot-store.postgres.js";

let database: TestDatabase;
let db: StarCatchDb;

beforeAll(async () => {
  database = await freshDatabase();
  db = connect(database.url);
  await migrate(db);
});

afterAll(async () => {
  await db.destroy();
  await database.drop();
});

describe("PostgresDeliveryStore", () => {
  const delivery = {
    id: "d-1",
    event: "pull_request",
    action: "opened",
    installationId: 4_000_000_001,
    payload: { action: "opened", note: "nul\u0000here" },
  };

  it("stores a delivery once and says whether a redelivery was handled", async () => {
    const store = new PostgresDeliveryStore(db);
    expect(await store.add(delivery)).toBe("new");
    expect(await store.add({ ...delivery, payload: { changed: true } })).toBe("pending");
    await store.markHandled(delivery.id);
    expect(await store.add(delivery)).toBe("handled");

    const rows = await db.selectFrom("star_catch.webhook_deliveries").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      delivery_id: "d-1",
      event: "pull_request",
      action: "opened",
      installation_id: "4000000001",
      payload: { action: "opened", note: "nulhere" },
    });
  });
});

describe("PostgresSnapshotStore", () => {
  const ref = { fullName: "Acme/Shop", number: 7 };

  it("finds a snapshot by repo in any case and head commit", async () => {
    const store = new PostgresSnapshotStore(db);
    const snapshot = snapshotOf(ref, { headSha: "a".repeat(40) });
    expect(await store.has("acme/shop", snapshot.headSha)).toBe(false);

    await store.save(snapshot);
    expect(await store.has("acme/shop", snapshot.headSha)).toBe(true);
    expect(await store.find("ACME/SHOP", snapshot.headSha)).toEqual(snapshot);
    expect(await store.find("acme/shop", "b".repeat(40))).toBeNull();
  });

  it("keeps the first snapshot of a head commit", async () => {
    const store = new PostgresSnapshotStore(db);
    const first = snapshotOf(ref, { headSha: "c".repeat(40), title: "first" });
    await store.save(first);
    await store.save({ ...first, title: "second" });
    expect(await store.find(ref.fullName, first.headSha)).toMatchObject({ title: "first" });
  });
});
