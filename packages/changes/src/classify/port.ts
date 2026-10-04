import type { ClassifyItem, ClassifyResult, StoredLabels } from "./schema.js";

/** Labels items from the closed sets. A model today, a small trained classifier later. */
export interface Classifier {
  /** Stored with each label so caches never mix classifiers; never written into the context. */
  readonly id: string;
  /** One result per item it could label; an item left out stays unlabelled. */
  classify(items: ClassifyItem[], signal?: AbortSignal): Promise<ClassifyResult[]>;
}

/** Labels by input hash: Postgres in the worker, a JSON file for the CLI. */
export interface LabelCache {
  get(inputHashes: string[]): Promise<Map<string, StoredLabels>>;
  put(entries: StoredLabels[]): Promise<void>;
}
