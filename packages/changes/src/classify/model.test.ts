import { describe, expect, it, vi } from "vitest";
import { classify, inputHash } from "./classify.js";
import { batches, createModelClassifier, type Complete } from "./model.js";
import type { LabelCache } from "./port.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import type { ClassifyItem, StoredLabels, UnitItem } from "./schema.js";

const unit = (id: string, fields: Partial<UnitItem> = {}): UnitItem => ({
  type: "unit",
  id,
  path: "src/a.ts",
  language: "typescript",
  fileClass: "source",
  unitKind: "declaration",
  changeType: "bodyChanged",
  name: id,
  siblings: [],
  references: [],
  exported: false,
  title: "fix: rounding",
  decided: { risks: [] },
  ...fields,
});
const sentence = (id: string, text = "It broke."): ClassifyItem => ({ type: "sentence", id, origin: "description", text, title: "fix: rounding" });

/** Answers every item it is asked about, the way a well-behaved model would. */
function fakeModel(answer: (items: ClassifyItem[]) => unknown = defaultAnswer) {
  const calls: ClassifyItem[][] = [];
  const complete = vi.fn<Complete>(async ({ user }) => {
    const items = JSON.parse(user) as ClassifyItem[];
    calls.push(items);
    return answer(items);
  });
  return { complete, calls };
}

function defaultAnswer(items: ClassifyItem[]) {
  return {
    units: items.filter((i) => i.type === "unit").map((i) => ({
      id: i.id,
      kind: "logic",
      intent: "fix",
      visibility: "internal",
      breaking: false,
      securitySensitive: false,
      confidence: { kind: 0.9, intent: 0.8, visibility: 0.7, risks: 0.6 },
    })),
    sentences: items.filter((i) => i.type === "sentence").map((i) => ({ id: i.id, class: "problem", confidence: 0.9 })),
  };
}

function memoryCache(): LabelCache & { rows: Map<string, StoredLabels> } {
  const rows = new Map<string, StoredLabels>();
  return {
    rows,
    get: async (hashes) => new Map(hashes.filter((h) => rows.has(h)).map((h) => [h, rows.get(h)!])),
    put: async (entries) => entries.forEach((e) => rows.set(e.inputHash, e)),
  };
}

describe("createModelClassifier", () => {
  it("asks once per pull request, with the label definitions, every item and the schema", async () => {
    const { complete } = fakeModel();
    const classifier = createModelClassifier({ id: "model:test@1", complete });
    const results = await classifier.classify([unit("a"), unit("b"), sentence("description:0")]);
    expect(complete).toHaveBeenCalledTimes(1);
    const [request] = complete.mock.calls[0];
    expect(request.system).toBe(SYSTEM_PROMPT);
    expect(request.system).toContain("- apiConsumer:");
    expect(JSON.parse(request.user).map((i: ClassifyItem) => i.id)).toEqual(["a", "b", "description:0"]);
    expect(request.schema).toMatchObject({ type: "object", required: ["units", "sentences"] });
    expect(results.map((r) => `${r.type} ${r.id}`)).toEqual(["unit a", "unit b", "sentence description:0"]);
  });

  it("splits past the input limit and keeps at most `concurrency` calls in flight", async () => {
    let inFlight = 0;
    let most = 0;
    const complete: Complete = async ({ user }) => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return defaultAnswer(JSON.parse(user));
    };
    const items = Array.from({ length: 12 }, (_, i) => unit(`u${i}`));
    const classifier = createModelClassifier({ id: "m", complete, maxInputChars: 1_000, concurrency: 2 });
    expect(batches(items, 1_000).length).toBeGreaterThan(2);
    expect(await classifier.classify(items)).toHaveLength(12);
    expect(most).toBe(2);
  });

  it("drops each answer that isn't valid, keeping the rest", async () => {
    const { complete } = fakeModel((items) => {
      const answer = defaultAnswer(items) as ReturnType<typeof defaultAnswer>;
      answer.units[0].intent = "cleanup";
      answer.units.push({ ...answer.units[1], id: "never-asked" });
      return answer;
    });
    const results = await createModelClassifier({ id: "m", complete }).classify([unit("a"), unit("b")]);
    expect(results.map((r) => r.id)).toEqual(["b"]);
    const { complete: garbage } = fakeModel(() => "not json at all");
    expect(await createModelClassifier({ id: "m", complete: garbage }).classify([unit("a")])).toEqual([]);
    const { complete: partial } = fakeModel((items) => ({ ...(defaultAnswer(items) as object), units: [] }));
    expect(await createModelClassifier({ id: "m", complete: partial }).classify([unit("a"), sentence("d:0")])).toMatchObject([{ id: "d:0" }]);
  });

  it("leaves out a kind the rules already decided", async () => {
    const { complete } = fakeModel((items) => {
      const answer = defaultAnswer(items) as ReturnType<typeof defaultAnswer>;
      return { ...answer, units: answer.units.map((u) => ({ ...u, kind: null, confidence: { ...u.confidence, kind: null } })) };
    });
    const [result] = await createModelClassifier({ id: "m", complete }).classify([unit("a", { decided: { kind: "test", risks: [] } })]);
    expect(result).not.toHaveProperty("kind");
    expect(result.type === "unit" && result.confidence).not.toHaveProperty("kind");
  });
});

describe("classify", () => {
  it("serves repeated items from the cache and stores new ones as model labels", async () => {
    const { complete } = fakeModel();
    const classifier = createModelClassifier({ id: "model:test@1", complete });
    const cache = memoryCache();
    const items = [unit("a"), sentence("description:0")];
    const first = await classify(items, { classifier, labelCache: cache });
    expect(complete).toHaveBeenCalledTimes(1);
    expect([...cache.rows.values()].map((r) => [r.source, r.classifier])).toEqual([["model", "model:test@1"], ["model", "model:test@1"]]);
    expect(await classify(items, { classifier, labelCache: cache })).toEqual(first);
    expect(complete).toHaveBeenCalledTimes(1);
    await classify([...items, unit("b")], { classifier, labelCache: cache });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(JSON.parse(complete.mock.calls[1][0].user).map((i: ClassifyItem) => i.id)).toEqual(["b"]);
  });

  it("keys the cache by label-set version, classifier and input", () => {
    expect(inputHash("a", unit("x"))).toBe(inputHash("a", unit("x")));
    expect(inputHash("a", unit("x"))).not.toBe(inputHash("b", unit("x")));
    expect(inputHash("a", unit("x"))).not.toBe(inputHash("a", unit("x", { title: "feat: x" })));
  });

  it("leaves items unlabelled when the budget runs out, and throws any other failure", async () => {
    const hanging: Complete = (_request, signal) =>
      new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
    const started = performance.now();
    expect(await classify([unit("a")], { classifier: createModelClassifier({ id: "m", complete: hanging }), budgetMs: 30 })).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1_000);
    const failing: Complete = async () => {
      throw new Error("401 invalid key");
    };
    await expect(classify([unit("a")], { classifier: createModelClassifier({ id: "m", complete: failing }) })).rejects.toThrow("401");
  });
});
