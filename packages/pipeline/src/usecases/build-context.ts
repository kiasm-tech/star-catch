import { CONTEXT_VERSION, ContextSchema, LABEL_SET_VERSION, PullRequestSnapshotSchema, type Context } from "@kiasm-tech/star-catch-contracts";
import {
  analyze,
  applyClasses,
  applyLabels,
  classify,
  classifyItems,
  toAnalyzeInput,
  type Classifier,
  type LabelCache,
} from "@star-catch/changes";
import { factsOf } from "../facts.js";
import { concernsOf } from "../group.js";
import { sentencesOf } from "../text.js";

export interface ContextPorts {
  classifier: Classifier;
  /** Labels already given to the same input; written back after each call. */
  labelCache?: LabelCache;
}

export interface ContextOptions {
  /** For the classifier; past it, the rest stays unlabelled. */
  budgetMs?: number;
  signal?: AbortSignal;
}

/**
 * A pull request snapshot, as stored or recorded, → its context (pr-analysis.md §2): change units
 * with links and entry points, sentences, both classified in one call, then concerns and facts,
 * validated by the contract.
 */
export async function buildContext(snapshot: unknown, { classifier, labelCache }: ContextPorts, options: ContextOptions = {}): Promise<Context> {
  const pr = PullRequestSnapshotSchema.parse(snapshot);
  const changes = await analyze(toAnalyzeInput(pr));
  const sentences = sentencesOf(pr);
  const results = await classify(classifyItems(changes, sentences, pr.title), { classifier, labelCache, ...options });
  const units = applyLabels(changes, results);
  const classed = applyClasses(sentences, results);
  const { links, entryPoints } = changes;
  const concerns = concernsOf(units, links, entryPoints);
  return ContextSchema.parse({
    version: CONTEXT_VERSION,
    labelSetVersion: LABEL_SET_VERSION,
    pr: { fullName: pr.fullName, number: pr.number, headSha: pr.headSha },
    degraded: changes.degraded,
    truncated: changes.truncated,
    units,
    links,
    entryPoints,
    concerns,
    sentences: classed,
    facts: factsOf({ units, links, entryPoints, concerns, sentences: classed }),
    excluded: changes.excluded,
  });
}
