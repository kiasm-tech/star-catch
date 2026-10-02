import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openedWebhook } from "@star-catch/pipeline";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { snapshotOf } from "@star-catch/testkit";
import { FileFixtureStore } from "./file-fixture-store.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "fixtures-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FileFixtureStore", () => {
  it("writes a recording and reads it back", async () => {
    const store = new FileFixtureStore(dir);
    const snapshot = snapshotOf({ fullName: "acme/api", number: 7 });
    await store.saveRecording({ id: "acme__api__7", snapshot, webhook: openedWebhook(snapshot) });

    expect(await store.recordedSnapshots()).toEqual([{ name: "acme__api__7.json", data: snapshot }]);
    expect((await store.recordedWebhooks()).map((w) => w.name)).toEqual(["acme__api__7.opened.json"]);
    expect(await readFile(path.join(dir, "snapshots", "acme__api__7.json"), "utf8")).toMatch(/\n$/);
  });

  it("reads synthetic fixtures sorted by folder name", async () => {
    for (const name of ["02-b", "01-a"]) {
      await mkdir(path.join(dir, "synthetic", name), { recursive: true });
      await writeFile(path.join(dir, "synthetic", name, "snapshot.json"), `{"n":"${name}"}`);
      await writeFile(path.join(dir, "synthetic", name, "expected.json"), "{}");
    }
    const store = new FileFixtureStore(dir);
    expect(await store.syntheticFixtures()).toEqual([
      { name: "01-a", snapshot: { n: "01-a" }, expected: {} },
      { name: "02-b", snapshot: { n: "02-b" }, expected: {} },
    ]);
  });

  it("treats missing folders as empty", async () => {
    const store = new FileFixtureStore(path.join(dir, "nowhere"));
    expect(await store.recordedSnapshots()).toEqual([]);
    expect(await store.syntheticFixtures()).toEqual([]);
  });
});
