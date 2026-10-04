import { existsSync } from "node:fs";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StoredLabels } from "@star-catch/changes";
import { describe, expect, it } from "vitest";
import { FileLabelCache } from "./label-cache.file.js";

const row = (inputHash: string): StoredLabels => ({
  inputHash,
  classifier: "model:test@1",
  input: { type: "sentence", id: "d:0", origin: "description", text: "It broke.", title: "fix: it" },
  result: { type: "sentence", id: "d:0", class: "problem", confidence: 0.9 },
  source: "model",
});

describe("FileLabelCache", () => {
  it("keeps labels across instances, in a file it writes whole", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "labels-"));
    const file = path.join(dir, ".cache", "labels.json");
    await new FileLabelCache(file).put([row("h1"), row("h2")]);
    const found = await new FileLabelCache(file).get(["h1", "h3"]);
    expect([...found.keys()]).toEqual(["h1"]);
    expect(found.get("h1")).toEqual(row("h1"));
    expect((await readdir(path.dirname(file))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("starts empty without a file, and skips rows that no longer parse", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "labels-"));
    const file = path.join(dir, "labels.json");
    expect((await new FileLabelCache(file).get(["h1"])).size).toBe(0);
    expect(existsSync(file)).toBe(false);
    await writeFile(file, JSON.stringify({ version: 1, rows: [row("h1"), { inputHash: "h2", result: { class: "complaint" } }] }));
    expect([...(await new FileLabelCache(file).get(["h1", "h2"])).keys()]).toEqual(["h1"]);
  });
});
