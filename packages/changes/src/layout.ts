/** The repository around a change: its unchanged parts, and which of them the changed files import. */
import { defaultComponentOf } from "./component.js";
import { imports, importsOf } from "./links.js";

/** Files that count towards a part's size: code, not assets or docs. */
const CODE = /\.(tsx?|jsx?|mjs|cjs|py|java|kt|go|rb|rs|cs|php|swift|scala|vue|svelte)$/;
/** Folders that hold tests, docs or tooling rather than a part of the product. */
const NOT_A_PART = /^(\(root\)|tests?|__tests__|specs?|e2e|docs?|examples?|scripts?|fixtures?|benchmarks?|\..*)$/i;

export interface Layout {
  neighbours: { component: string; files: number }[];
  uses: { from: string; to: string }[];
}

export function layoutOf(
  paths: string[],
  changed: { filename: string; headContent?: string }[],
  changedComponents: Set<string>,
  componentOf: (path: string) => string = defaultComponentOf,
): Layout {
  const files = new Map<string, number>();
  const owner = new Map<string, string>();
  for (const path of paths) {
    if (!CODE.test(path)) continue;
    const component = componentOf(path);
    if (changedComponents.has(component) || NOT_A_PART.test(component)) continue;
    files.set(component, (files.get(component) ?? 0) + 1);
    owner.set(path, component);
  }
  const uses = new Map<string, { from: string; to: string }>();
  for (const file of changed) {
    if (!file.headContent) continue;
    const from = componentOf(file.filename);
    const specs = importsOf(file.filename, file.headContent);
    if (specs.length === 0) continue;
    for (const [path, to] of owner) {
      const key = `${from}>${to}`;
      if (!uses.has(key) && imports(specs, path)) uses.set(key, { from, to });
    }
  }
  return {
    neighbours: [...files].map(([component, count]) => ({ component, files: count })).sort((a, b) => b.files - a.files || a.component.localeCompare(b.component)),
    uses: [...uses.values()],
  };
}
