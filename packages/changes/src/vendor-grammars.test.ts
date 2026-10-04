import { existsSync } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRAMMARS, GRAMMARS_DIR, vendorGrammars } from "../scripts/vendor-grammars.js";

const expected = GRAMMARS.flatMap(({ wasm, tags }) => [...wasm, `${tags}.tags.scm`]).sort();

describe("vendor-grammars", () => {
  it("left every grammar and tags query in grammars/ on install", async () => {
    expect((await readdir(GRAMMARS_DIR)).sort()).toEqual(expected);
  });

  it("copies them from the installed packages", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "grammars-"));
    const result = await vendorGrammars(dir);
    expect("copied" in result && result.copied.sort()).toEqual(expected);
    expect((await readdir(dir)).sort()).toEqual(expected);
  });

  it("skips without failing when the packages aren't installed, as in a production install", async () => {
    const dir = path.join(await mkdtemp(path.join(tmpdir(), "grammars-")), "out");
    const result = await vendorGrammars(dir, (id) => {
      throw new Error(`Cannot find module '${id}'`);
    });
    expect(result).toEqual({ missing: GRAMMARS.map((g) => g.pkg) });
    expect(existsSync(dir)).toBe(false);
  });
});
