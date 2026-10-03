import { LABEL_SET_VERSION, SNAPSHOT_LIMITS } from "@kiasm-tech/star-catch-contracts";
import { createBudget, type Budget } from "./budget.js";
import { compareCode } from "./code/compare.js";
import { isCodeLanguage } from "./code/parse.js";
import { explainRefactorings, familyOf, type Candidate } from "./code/refactorings.js";
import { defaultComponentOf } from "./component.js";
import { fallbackUnit, type FallbackFile } from "./fallback.js";
import { languageOf, type Engine } from "./languages/registry.js";
import { ANALYZER_VERSION, AnalyzeInputSchema, type AnalyzeInput, type AnalyzeOptions, type ChangeSet } from "./schema.js";
import { compareStructured, readsStructured } from "./structured/compare.js";
import { triage } from "./triage.js";

/** Matches the snapshot's own cap; the rest of a bigger input is dropped and `truncated` set. */
export const MAX_FILES = SNAPSHOT_LIMITS.files;

/** What an engine made of a file, or why the file falls back to one line-based unit. */
type Read = { candidates: Candidate[]; degraded?: string } | { fallback: string };

async function read(context: FallbackFile, engine: Engine, budget: Budget): Promise<Read> {
  const { file, language, fileClass, component } = context;
  if (engine === "structured" && readsStructured(language, fileClass)) {
    const structured = compareStructured(context);
    if ("error" in structured) return { fallback: structured.error };
    return { candidates: structured.units.map((unit) => ({ unit, family: language })) };
  }
  if (engine === "code" && isCodeLanguage(language)) {
    const compared = await compareCode({ file, language, fileClass, component }, budget.forFile());
    if ("error" in compared) return { fallback: compared.error };
    return {
      candidates: compared.units.map((unit) => ({ unit, family: familyOf(language), tokens: compared.tokens.get(unit.id) })),
      ...(compared.degraded && { degraded: "parse errors in a changed declaration" }),
    };
  }
  return { fallback: `no engine reads ${language} files` };
}

/** A pull request's files → change units (changes.md §7). Classification is task 06. */
export async function analyze(input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<ChangeSet> {
  const { files } = AnalyzeInputSchema.parse(input);
  const budget = createBudget(options.budgets, options.signal);
  const componentOf = options.componentOf ?? defaultComponentOf;
  let truncated = files.length > MAX_FILES;

  const analysed: ChangeSet["files"] = [];
  const excluded: ChangeSet["excluded"] = [];
  const candidates: Candidate[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    const result = triage(file);
    if ("excluded" in result) {
      excluded.push({ file: file.path, reason: result.excluded });
      continue;
    }
    const { language, engine } = languageOf(file.path);
    const entry: ChangeSet["files"][number] = { path: file.path, language, fileClass: result.fileClass, engine, degraded: false };
    analysed.push(entry);
    const context = { file, language, fileClass: result.fileClass, component: componentOf(file.path) };

    let outcome: Read;
    if (budget.expired()) {
      // The rest of the files still get a unit each, the cheap way.
      truncated = true;
      outcome = { fallback: budget.aborted() ? "the analysis was cancelled" : "the analysis ran out of time" };
    } else {
      outcome = await read(context, engine, budget);
    }
    if ("fallback" in outcome) {
      Object.assign(entry, { engine: "lines", degraded: true, error: outcome.fallback });
      const unit = fallbackUnit(context);
      if (unit) candidates.push({ unit, family: language });
      continue;
    }
    candidates.push(...outcome.candidates);
    if (outcome.degraded) Object.assign(entry, { degraded: true, error: outcome.degraded });
  }

  const { units, refactorings } = explainRefactorings(candidates);
  const elapsed = budget.elapsedMs();
  return {
    analyzerVersion: ANALYZER_VERSION,
    labelSetVersion: LABEL_SET_VERSION,
    degraded: analysed.some((f) => f.degraded),
    truncated,
    files: analysed,
    units,
    refactorings,
    links: [],
    entryPoints: [],
    excluded,
    timings: { totalMs: elapsed, analysisMs: elapsed, classifyMs: 0 },
  };
}
