import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

const CONTRACTS = "@kiasm-tech/star-catch-contracts";
const TESTKIT = "@star-catch/testkit";

/** Dependencies point inward: apps → adapters → core (pipeline) → contracts. */
const ALLOWED: Record<string, string[]> = {
  [CONTRACTS]: [],
  [TESTKIT]: [CONTRACTS],
};

/** Packages that must stay free of I/O, and the only modules they may import. */
const PURE: Record<string, string[]> = {
  "packages/contracts": ["zod"],
};

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Switching branches can leave node_modules-only folders behind; they are not packages.
const workspaces = ["apps", "packages"]
  .filter((group) => existsSync(path.join(root, group)))
  .flatMap((group) => readdirSync(path.join(root, group)).map((name) => path.join(group, name)))
  .filter((dir) => existsSync(path.join(root, dir, "package.json")));
const manifests = workspaces.map((dir) => ({
  dir,
  manifest: JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8")) as Manifest,
}));
const internal = (deps: Record<string, string> = {}) =>
  Object.keys(deps).filter((d) => d.startsWith("@star-catch/") || d === CONTRACTS);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("architecture", () => {
  it("knows every workspace package", () => {
    expect(manifests.map((m) => m.manifest.name).sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it.each(manifests)("$manifest.name depends only inward", ({ manifest }) => {
    const allowed = ALLOWED[manifest.name] ?? [];
    expect(internal(manifest.dependencies).filter((d) => !allowed.includes(d))).toEqual([]);
  });

  it.each(manifests)("$manifest.name uses the testkit only in tests", ({ manifest }) => {
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain(TESTKIT);
  });

  it.each(Object.entries(PURE))("%s imports nothing with I/O", (dir, allowed) => {
    const offending = sources(path.join(root, dir, "src")).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      const specifiers = [...text.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
      return specifiers
        .filter((s) => !s.startsWith(".") && !allowed.includes(s))
        .map((s) => `${path.relative(root, file)} imports ${s}`);
    });
    expect(offending).toEqual([]);
  });
});
