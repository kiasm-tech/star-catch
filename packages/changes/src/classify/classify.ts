import { createHash } from "node:crypto";
import { LABEL_SET_VERSION } from "@kiasm-tech/star-catch-contracts";
import { canonical } from "../structured/entries.js";
import type { Classifier, LabelCache } from "./port.js";
import type { ClassifyItem, ClassifyResult } from "./schema.js";

export interface ClassifyOptions {
  classifier: Classifier;
  labelCache?: LabelCache;
  /** Past it, items not yet labelled stay unlabelled (changes.md §10). */
  budgetMs?: number;
  signal?: AbortSignal;
}

export const DEFAULT_CLASSIFY_MS = 20_000;

/** sha256 of the label-set version, the classifier and the item as given (changes.md §6.2). */
export function inputHash(classifierId: string, item: ClassifyItem): string {
  return createHash("sha256").update(`${LABEL_SET_VERSION}\0${classifierId}\0${canonical(item)}`).digest("hex");
}

const isAbort = (error: unknown) => error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

/**
 * Labels for the items, cached ones first; the classifier only sees the rest, within the budget.
 * Running out of time leaves items unlabelled; any other failure is thrown, so a job can retry.
 */
export async function classify(items: ClassifyItem[], options: ClassifyOptions): Promise<ClassifyResult[]> {
  const { classifier, labelCache, budgetMs = DEFAULT_CLASSIFY_MS, signal } = options;
  const hashes = items.map((item) => inputHash(classifier.id, item));
  const cached = labelCache ? await labelCache.get(hashes) : new Map();
  const missing = items.filter((_item, i) => !cached.has(hashes[i]));

  let fresh: ClassifyResult[] = [];
  if (missing.length > 0) {
    const deadline = AbortSignal.timeout(budgetMs);
    try {
      fresh = await classifier.classify(missing, signal ? AbortSignal.any([signal, deadline]) : deadline);
    } catch (error) {
      if (!isAbort(error) && !deadline.aborted && !signal?.aborted) throw error;
    }
  }

  const freshById = new Map(fresh.map((r) => [r.id, r]));
  if (labelCache) {
    const entries = items.flatMap((item, i) => {
      const result = freshById.get(item.id);
      return result ? [{ inputHash: hashes[i], classifier: classifier.id, input: item, result, source: "model" as const }] : [];
    });
    if (entries.length > 0) await labelCache.put(entries);
  }
  return items.flatMap((item, i) => {
    const result = cached.get(hashes[i])?.result ?? freshById.get(item.id);
    return result ? [{ ...result, id: item.id }] : [];
  });
}
