/** Which tokens changed between two versions of a unit. */
export interface TokenDiff {
  /** Indexes into the base tokens of those not in the head. */
  deleted: number[];
  /** Indexes into the head tokens of those not in the base. */
  inserted: number[];
}

export interface DiffLimits {
  /** Tokens a side (changes.md §10). */
  maxTokens?: number;
  /** Backtracking keeps a snapshot per edit step, so memory grows with the square of this. */
  maxEdits?: number;
}

export const DEFAULT_DIFF_LIMITS: Required<DiffLimits> = { maxTokens: 20_000, maxEdits: 2_000 };

/**
 * Myers' shortest edit script over token texts. Null past a limit: the caller then calls the
 * change `bodyChanged` without locating it.
 */
export function diffTokens(a: readonly string[], b: readonly string[], limits: DiffLimits = {}): TokenDiff | null {
  const { maxTokens, maxEdits } = { ...DEFAULT_DIFF_LIMITS, ...limits };
  if (a.length > maxTokens || b.length > maxTokens) return null;

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) {
    suffix++;
  }
  const n = a.length - prefix - suffix;
  const m = b.length - prefix - suffix;
  const at = (i: number) => a[prefix + i];
  const bt = (j: number) => b[prefix + j];

  const max = n + m;
  if (max === 0) return { deleted: [], inserted: [] };
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // Snapshot d holds v[-d..d] as it was before step d.
  const trace: Int32Array[] = [];
  const takes = (k: number, d: number, at: (k: number) => number) => k === -d || (k !== d && at(k - 1) < at(k + 1));

  let found = -1;
  for (let d = 0; d <= Math.min(max, maxEdits) && found < 0; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = takes(k, d, (i) => v[offset + i]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && at(x) === bt(y)) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;

  const deleted: number[] = [];
  const inserted: number[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const snapshot = trace[d];
    const get = (k: number) => snapshot[k + d];
    const k = x - y;
    const prevK = takes(k, d, get) ? k + 1 : k - 1;
    const prevX = get(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
    }
    if (x === prevX) inserted.push(prefix + prevY);
    else deleted.push(prefix + prevX);
    x = prevX;
    y = prevY;
  }
  return { deleted: deleted.reverse(), inserted: inserted.reverse() };
}
