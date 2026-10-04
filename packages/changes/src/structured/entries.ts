import type { UnitKind } from "@kiasm-tech/star-catch-contracts";

/** One comparable piece of a structured file: a key, a dependency, or the rest of the file. */
export interface Entry {
  name: string;
  unitKind: Extract<UnitKind, "configKey" | "dependency" | "file">;
  /** Canonical: two entries with the same meaning have the same value. */
  value: string;
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** JSON with sorted keys: whitespace, comments and key order don't change it. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isPlainObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

/** Key paths at the top level and one level down (changes.md §5.6); a non-object root is one entry. */
export function keyEntries(root: unknown, fileName: string, prefix = ""): Entry[] {
  if (!isPlainObject(root)) return [{ name: `${prefix}${fileName}`, unitKind: "file", value: canonical(root) }];
  return Object.entries(root).flatMap(([key, value]): Entry[] => {
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      return Object.entries(value).map(([child, inner]) => ({
        name: `${prefix}${key}.${child}`,
        unitKind: "configKey",
        value: canonical(inner),
      }));
    }
    return [{ name: `${prefix}${key}`, unitKind: "configKey", value: canonical(value) }];
  });
}
