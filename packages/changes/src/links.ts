import type { Kind, LinkType } from "@kiasm-tech/star-catch-contracts";
import type { AnalyzeInput, ChangeSet, Unit } from "./schema.js";

type Link = ChangeSet["links"][number];

/** `Cart.total (2)` and `persist > rehydrates` are referenced as `total` and `rehydrates`. */
const simpleName = (name: string) => name.replace(/ \(\d+\)$/, "").split(/ > |\./).at(-1)!;

const directory = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);
const withoutExtension = (path: string) => path.replace(/\.[^./]+$/, "");

/** Normalises `a/./b/../c` to `a/c`. */
function normalise(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

const JS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const PY_FROM = /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(?:\(([^)]*)\)|([\w \t,]+))/gm;
const PY_IMPORT = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)/gm;
const JAVA_IMPORT = /^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm;

/** A Python module as a repo path suffix (`pkg.mod` → pkg/mod, anywhere); `..mod` resolved against the file. */
function pythonModule(path: string, module: string): string {
  if (!module.startsWith(".")) return `*/${module.replaceAll(".", "/")}`;
  const up = module.match(/^\.+/)![0].length - 1;
  const rest = module.slice(up + 1).replaceAll(".", "/");
  const base = directory(path).split("/").filter(Boolean);
  return normalise([...base.slice(0, base.length - up), rest].join("/"));
}

/**
 * The repo paths (without extension) a file imports: relative TS/JS specifiers resolved against the
 * file; Python and Java modules as path suffixes. Package imports resolve to nothing in the repo.
 */
function importsOf(path: string, source: string): string[] {
  if (path.endsWith(".py")) {
    // `from pkg import mod` may name a submodule, so each imported name is a candidate too.
    const from = [...source.matchAll(PY_FROM)].flatMap((m) => {
      // Parenthesised names may span lines; otherwise they end with the line.
      const names = (m[2] ?? m[3]).split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const module = pythonModule(path, m[1]);
      const joined = (name: string) => (module.endsWith("/") ? `${module}${name}` : `${module}/${name}`);
      return [module, ...names.map(joined)];
    });
    const plain = [...source.matchAll(PY_IMPORT)].flatMap((m) =>
      m[1].split(",").map((part) => pythonModule(path, part.trim().split(/\s+as\s+/)[0])),
    );
    return [...from, ...plain];
  }
  if (path.endsWith(".java")) return [...source.matchAll(JAVA_IMPORT)].map((m) => `*/${m[1].replaceAll(".", "/")}`);
  return [...source.matchAll(JS_IMPORT)]
    .map((m) => m[1])
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => withoutExtension(normalise(directory(path) + specifier)));
}

function imports(importer: string[], file: string): boolean {
  const target = withoutExtension(file);
  return importer.some((spec) =>
    spec.startsWith("*/") ? target === spec.slice(2) || target.endsWith(`/${spec.slice(2)}`) : target === spec || target === `${spec}/index`,
  );
}

/**
 * Links between changed units (changes.md §5.8): `calls` when a unit's references name another
 * changed declaration; `covers` when that unit is a test, or its test file imports the other's file.
 */
export function linksOf(units: Unit[], files: AnalyzeInput["files"]): Link[] {
  const targets = units.filter((u) => u.unitKind === "declaration" && u.verdict !== "notAChange");
  const isTest = (u: Unit) => u.fileClass === "test";
  const importsByFile = new Map(
    files.filter((f) => f.head !== undefined).map((f) => [f.path, importsOf(f.path, f.head!)] as const),
  );
  const links: Link[] = [];
  const seen = new Set<string>();
  const add = (from: Unit, to: Unit, type: LinkType) => {
    const key = `${from.id}\0${to.id}`;
    if (from.id === to.id || seen.has(key)) return;
    seen.add(key);
    links.push({ from: from.id, to: to.id, type });
  };
  for (const from of units) {
    if (from.verdict === "notAChange") continue;
    const references = new Set(from.references);
    // A test file's own import lines (its residue unit) aren't a test.
    const imported = isTest(from) && from.unitKind === "declaration" ? importsByFile.get(from.file) ?? [] : [];
    for (const to of targets) {
      // Nothing calls or covers a test case, even one named like the code it tests.
      if (isTest(to)) continue;
      const named = references.has(simpleName(to.name)) || (to.exportedAs ?? []).some((name) => references.has(name));
      if (named || (imported.length > 0 && imports(imported, to.file))) add(from, to, isTest(from) ? "covers" : "calls");
    }
  }
  return links;
}

/** Behavioural logic or UI that no test in the PR covers (changes.md §6.1). */
export function untested(unit: Unit, kind: Kind, links: Link[]): boolean {
  if (unit.verdict !== "behavioural" || (kind !== "logic" && kind !== "ui")) return false;
  return !links.some((l) => l.type === "covers" && l.to === unit.id);
}
