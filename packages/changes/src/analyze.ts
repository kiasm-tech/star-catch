import { LABEL_SET_VERSION } from "@kiasm-tech/star-catch-contracts";
import { createBudget } from "./budget.js";
import { languageOf } from "./languages/registry.js";
import { ANALYZER_VERSION, AnalyzeInputSchema, type AnalyzeInput, type AnalyzeOptions, type ChangeSet } from "./schema.js";
import { triage } from "./triage.js";

/** A pull request's files → change units (changes.md §7). Classification is task 06. */
export async function analyze(input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<ChangeSet> {
  const { files } = AnalyzeInputSchema.parse(input);
  const budget = createBudget(options.budgets, options.signal);

  const analysed: ChangeSet["files"] = [];
  const excluded: ChangeSet["excluded"] = [];
  for (const file of files) {
    const result = triage(file);
    if ("excluded" in result) {
      excluded.push({ file: file.path, reason: result.excluded });
      continue;
    }
    analysed.push({ path: file.path, ...languageOf(file.path), fileClass: result.fileClass, degraded: false });
  }

  const elapsed = budget.elapsedMs();
  return {
    analyzerVersion: ANALYZER_VERSION,
    labelSetVersion: LABEL_SET_VERSION,
    degraded: false,
    truncated: false,
    files: analysed,
    units: [],
    refactorings: [],
    links: [],
    entryPoints: [],
    excluded,
    timings: { totalMs: elapsed, analysisMs: elapsed, classifyMs: 0 },
  };
}
