import type { Context, ContextExpectation } from "@kiasm-tech/star-catch-contracts";

type Path = string;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

function fail(path: Path, expected: string, got: string): never {
  throw new Error(`${path || "(root)"}: expected ${expected}, got ${got}`);
}

/** The field arrays are matched by, or null to match by position. */
function keyOf(items: unknown[]): "id" | "file" | null {
  for (const key of ["id", "file"] as const) {
    if (items.length > 0 && items.every((i) => isObject(i) && typeof i[key] === "string")) {
      return key;
    }
  }
  return null;
}

function matchArray(actual: unknown[], expected: unknown[], path: Path) {
  const key = keyOf(expected);
  if (key) {
    const byKey = new Map<unknown, unknown>();
    for (const item of actual) if (isObject(item)) byKey.set(item[key], item);
    const wanted = new Set<unknown>();
    for (const item of expected as Record<string, unknown>[]) {
      const k = item[key];
      wanted.add(k);
      const at = `${path}[${String(k)}]`;
      if (!byKey.has(k)) fail(at, "an element", "none");
      matchValue(byKey.get(k), item, at);
    }
    for (const item of actual) {
      const k = isObject(item) ? item[key] : undefined;
      if (!wanted.has(k)) fail(`${path}[${String(k)}]`, "no element", "one");
    }
    return;
  }
  const shared = Math.min(actual.length, expected.length);
  for (let i = 0; i < shared; i++) matchValue(actual[i], expected[i], `${path}[${i}]`);
  if (actual.length !== expected.length) {
    fail(path, `${expected.length} items`, `${actual.length}`);
  }
}

function matchValue(actual: unknown, expected: unknown, path: Path) {
  if (expected === undefined) return;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) fail(path, "an array", show(actual));
    matchArray(actual, expected, path);
    return;
  }
  if (isObject(expected)) {
    if (!isObject(actual)) fail(path, "an object", show(actual));
    for (const [k, v] of Object.entries(expected)) {
      matchValue(actual[k], v, path ? `${path}.${k}` : k);
    }
    return;
  }
  if (!Object.is(actual, expected)) fail(path, show(expected), show(actual));
}

/**
 * Deep partial match: a field absent from `expected` is not checked. Arrays keep their length;
 * arrays of objects with an `id` (or a `file`) are matched by it, others by position.
 * Throws with the path of the first difference.
 */
export function expectContextMatches(actual: Context, expected: ContextExpectation): void {
  matchValue(actual, expected, "");
}

/** The parts of a change set the analysis decides; structural, so testkit needn't import changes. */
export interface ChangesLike {
  units: unknown[];
  excluded: unknown[];
  truncated: boolean;
}

/**
 * Like expectContextMatches, restricted to `units`, `excluded` and `truncated`. Links and entry
 * points in the expectation come from a later stage and are not compared.
 */
export function expectChangesMatch(actual: ChangesLike, expected: ContextExpectation): void {
  const { units, excluded, truncated } = expected;
  matchValue(actual, { units, excluded, truncated }, "");
}
