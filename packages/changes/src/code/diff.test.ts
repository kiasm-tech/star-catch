import { describe, expect, it } from "vitest";
import { diffTokens } from "./diff.js";

const split = (s: string) => (s === "" ? [] : s.split(" "));

function lcs(a: string[], b: string[]): number {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[a.length][b.length];
}

/** Deterministic, so a failure reproduces. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe("diffTokens", () => {
  it.each([
    ["a b c", "a b c", [], []],
    ["", "a b", [], [0, 1]],
    ["a b", "", [0, 1], []],
    ["return a > 1 ;", "return a >= 1 ;", [2], [2]],
    ["f ( a ) ;", "f ( a , b ) ;", [], [3, 4]],
    ["x = 1 ; y = 2 ;", "y = 2 ;", [0, 1, 2, 3], []],
  ])("%j → %j", (a, b, deleted, inserted) => {
    expect(diffTokens(split(a), split(b))).toEqual({ deleted, inserted });
  });

  it("finds a shortest edit whose untouched tokens are the same on both sides", () => {
    const next = random(42);
    for (let run = 0; run < 400; run++) {
      const word = () => "abc"[Math.floor(next() * 3)];
      const a = Array.from({ length: Math.floor(next() * 13) }, word);
      const b = Array.from({ length: Math.floor(next() * 13) }, word);
      const diff = diffTokens(a, b)!;
      expect(diff.deleted.length + diff.inserted.length).toBe(a.length + b.length - 2 * lcs(a, b));
      const kept = (tokens: string[], removed: number[]) => tokens.filter((_, i) => !removed.includes(i));
      expect(kept(a, diff.deleted)).toEqual(kept(b, diff.inserted));
    }
  });

  it("gives up past the token or edit limits", () => {
    expect(diffTokens(split("a b c"), split("a b c d"), { maxTokens: 3 })).toBeNull();
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`);
    expect(diffTokens(a, b, { maxEdits: 99 })).toBeNull();
    expect(diffTokens(a, b, { maxEdits: 100 })).toEqual({ deleted: a.map((_, i) => i), inserted: b.map((_, i) => i) });
  });

  it("stays fast on a large unit with a small change", () => {
    const a = Array.from({ length: 20_000 }, (_, i) => `t${i % 97}`);
    const b = [...a.slice(0, 10_000), "changed", ...a.slice(10_001)];
    const started = performance.now();
    expect(diffTokens(a, b)).toEqual({ deleted: [10_000], inserted: [10_000] });
    expect(performance.now() - started).toBeLessThan(100);
  });
});
