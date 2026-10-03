import type { Budgets } from "./schema.js";

export const DEFAULT_BUDGETS: Required<Budgets> = { perFileMs: 500, analysisMs: 5_000, classifyMs: 20_000 };

export interface Budget {
  readonly limits: Required<Budgets>;
  elapsedMs(): number;
  /** Of the whole analysis, never below 0. */
  remainingMs(): number;
  aborted(): boolean;
  /** Past the analysis deadline, or the caller aborted. */
  expired(): boolean;
}

/** Starts the analysis clock. `now` is injectable so tests never sleep. */
export function createBudget(budgets: Budgets = {}, signal?: AbortSignal, now: () => number = Date.now): Budget {
  const limits = { ...DEFAULT_BUDGETS, ...budgets };
  const start = now();
  const remainingMs = () => Math.max(0, limits.analysisMs - (now() - start));
  const aborted = () => signal?.aborted ?? false;
  return {
    limits,
    elapsedMs: () => now() - start,
    remainingMs,
    aborted,
    expired: () => aborted() || remainingMs() === 0,
  };
}
