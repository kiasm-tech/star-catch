import type { Classifier } from "./port.js";
import { RESPONSE_JSON_SCHEMA, ResponseSchema, SYSTEM_PROMPT } from "./prompt.js";
import type { ClassifyItem, ClassifyResult } from "./schema.js";

/** One structured completion; the adapter forces the schema (a tool call) and uses temperature 0. */
export type Complete = (request: { system: string; user: string; schema: Record<string, unknown> }, signal?: AbortSignal) => Promise<unknown>;

export interface ModelClassifierOptions {
  /** Stored with every label, e.g. `model:haiku-4-5@prompt-1`; never written into the context. */
  id: string;
  complete: Complete;
  /** Below it, a PR is one call; above, items are split into calls of at most this size. */
  maxInputChars?: number;
  /** Split calls in flight at once. */
  concurrency?: number;
}

const MAX_SIBLINGS = 30;

/** Bounded for the prompt: sibling lists can be long in a big file. */
const bounded = (item: ClassifyItem): ClassifyItem =>
  item.type === "unit" ? { ...item, siblings: item.siblings.slice(0, MAX_SIBLINGS) } : item;

/** Consecutive batches whose JSON stays within `max` characters; an item bigger than that goes alone. */
export function batches(items: ClassifyItem[], max: number): ClassifyItem[][] {
  const out: ClassifyItem[][] = [];
  let current: ClassifyItem[] = [];
  let size = 2;
  for (const item of items) {
    const length = JSON.stringify(item).length + 1;
    if (current.length > 0 && size + length > max) {
      out.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

const UnitAnswerSchema = ResponseSchema.shape.units.element;
const SentenceAnswerSchema = ResponseSchema.shape.sentences.element;

/**
 * The model's answers for these items, each checked on its own: one answer that is malformed,
 * about an item it wasn't asked, or outside a label set is dropped without losing the rest.
 */
function resultsOf(raw: unknown, items: ClassifyItem[]): ClassifyResult[] {
  const asked = new Map(items.map((i) => [i.id, i.type]));
  const envelope = (typeof raw === "object" && raw !== null ? raw : {}) as { units?: unknown; sentences?: unknown };
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const units = list(envelope.units).flatMap((answer): ClassifyResult[] => {
    const parsed = UnitAnswerSchema.safeParse(answer);
    if (!parsed.success || asked.get(parsed.data.id) !== "unit") return [];
    const { kind, confidence, ...u } = parsed.data;
    return [
      {
        ...u,
        type: "unit",
        ...(kind && { kind }),
        confidence: {
          intent: confidence.intent,
          visibility: confidence.visibility,
          risks: confidence.risks,
          ...(kind && confidence.kind !== null && { kind: confidence.kind }),
        },
      },
    ];
  });
  const sentences = list(envelope.sentences).flatMap((answer): ClassifyResult[] => {
    const parsed = SentenceAnswerSchema.safeParse(answer);
    return parsed.success && asked.get(parsed.data.id) === "sentence" ? [{ type: "sentence", ...parsed.data }] : [];
  });
  return [...units, ...sentences];
}

/**
 * A hosted model behind the Classifier port (changes.md §6.3): one call per pull request with every
 * behavioural unit and sentence, split only past `maxInputChars`, `concurrency` calls at a time.
 */
export function createModelClassifier({ id, complete, maxInputChars = 60_000, concurrency = 4 }: ModelClassifierOptions): Classifier {
  return {
    id,
    async classify(items, signal) {
      const queue = batches(items.map(bounded), maxInputChars);
      const results: ClassifyResult[][] = [];
      const worker = async () => {
        for (let batch = queue.shift(); batch; batch = queue.shift()) {
          const raw = await complete({ system: SYSTEM_PROMPT, user: JSON.stringify(batch), schema: RESPONSE_JSON_SCHEMA }, signal);
          results.push(resultsOf(raw, batch));
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
      return results.flat();
    },
  };
}
