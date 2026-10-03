import { LABEL_SET_VERSION } from "@kiasm-tech/star-catch-contracts";
import { createBudget } from "./budget.js";
import { compareCode } from "./code/compare.js";
import { isCodeLanguage } from "./code/parse.js";
import { explainRefactorings, familyOf, type Candidate } from "./code/refactorings.js";
import { defaultComponentOf } from "./component.js";
import { languageOf } from "./languages/registry.js";
import { ANALYZER_VERSION, AnalyzeInputSchema, type AnalyzeInput, type AnalyzeOptions, type ChangeSet } from "./schema.js";
import { compareStructured, readsStructured } from "./structured/compare.js";
import { triage } from "./triage.js";

/** A pull request's files → change units (changes.md §7). Classification is task 06. */
export async function analyze(input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<ChangeSet> {
  const { files } = AnalyzeInputSchema.parse(input);
  const budget = createBudget(options.budgets, options.signal);
  const componentOf = options.componentOf ?? defaultComponentOf;

  const analysed: ChangeSet["files"] = [];
  const excluded: ChangeSet["excluded"] = [];
  const candidates: Candidate[] = [];
  for (const file of files) {
    const result = triage(file);
    if ("excluded" in result) {
      excluded.push({ file: file.path, reason: result.excluded });
      continue;
    }
    const { language, engine } = languageOf(file.path);
    const entry: ChangeSet["files"][number] = { path: file.path, language, fileClass: result.fileClass, engine, degraded: false };
    analysed.push(entry);
    if (engine === "structured" && readsStructured(language, result.fileClass)) {
      const structured = compareStructured({ file, language, fileClass: result.fileClass, component: componentOf(file.path) });
      if ("error" in structured) {
        entry.degraded = true;
        entry.error = structured.error;
      } else {
        for (const unit of structured.units) candidates.push({ unit, family: language });
      }
      continue;
    }
    if (engine !== "code" || !isCodeLanguage(language)) continue;

    const compared = await compareCode(
      { file, language, fileClass: result.fileClass, component: componentOf(file.path) },
      budget.forFile(),
    );
    if ("error" in compared) {
      entry.degraded = true;
      entry.error = compared.error;
    } else {
      for (const unit of compared.units) {
        candidates.push({ unit, family: familyOf(language), tokens: compared.tokens.get(unit.id) });
      }
      if (compared.degraded) {
        entry.degraded = true;
        entry.error = "parse errors in a changed declaration";
      }
    }
  }

  const { units, refactorings } = explainRefactorings(candidates);
  const elapsed = budget.elapsedMs();
  return {
    analyzerVersion: ANALYZER_VERSION,
    labelSetVersion: LABEL_SET_VERSION,
    degraded: analysed.some((f) => f.degraded),
    truncated: false,
    files: analysed,
    units,
    refactorings,
    links: [],
    entryPoints: [],
    excluded,
    timings: { totalMs: elapsed, analysisMs: elapsed, classifyMs: 0 },
  };
}
