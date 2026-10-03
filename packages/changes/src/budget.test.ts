import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGETS, createBudget } from "./budget.js";

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("createBudget", () => {
  it("uses changes.md's defaults unless told otherwise", () => {
    expect(createBudget().limits).toEqual({ perFileMs: 500, analysisMs: 5_000, classifyMs: 20_000 });
    expect(createBudget({ perFileMs: 50 }).limits).toEqual({ ...DEFAULT_BUDGETS, perFileMs: 50 });
  });

  it("counts down the analysis time and expires at zero", () => {
    const { now, advance } = clock();
    const budget = createBudget({ analysisMs: 100 }, undefined, now);
    advance(40);
    expect([budget.elapsedMs(), budget.remainingMs(), budget.expired()]).toEqual([40, 60, false]);
    advance(80);
    expect([budget.remainingMs(), budget.expired()]).toEqual([0, true]);
  });

  it("expires as soon as the caller aborts", () => {
    const controller = new AbortController();
    const budget = createBudget({}, controller.signal, clock().now);
    expect(budget.expired()).toBe(false);
    controller.abort();
    expect([budget.aborted(), budget.expired()]).toEqual([true, true]);
  });
});
