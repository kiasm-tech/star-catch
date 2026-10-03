import { LABEL_SET_VERSION } from "@kiasm-tech/star-catch-contracts";
import { createBudget } from "./budget.js";
import { ANALYZER_VERSION, AnalyzeInputSchema, type AnalyzeInput, type AnalyzeOptions, type ChangeSet } from "./schema.js";

/** A pull request's files → change units (changes.md §7). Classification is task 06. */
export async function analyze(input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<ChangeSet> {
  AnalyzeInputSchema.parse(input);
  const budget = createBudget(options.budgets, options.signal);
  const elapsed = budget.elapsedMs();
  return {
    analyzerVersion: ANALYZER_VERSION,
    labelSetVersion: LABEL_SET_VERSION,
    degraded: false,
    truncated: false,
    files: [],
    units: [],
    refactorings: [],
    links: [],
    entryPoints: [],
    excluded: [],
    timings: { totalMs: elapsed, analysisMs: elapsed, classifyMs: 0 },
  };
}
