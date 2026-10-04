import { mockClassifier, type Classifier, type LabelCache, type StoredLabels } from "@star-catch/changes";
import { expectContextMatches, loadRecordedSnapshots, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { buildContext } from "./build-context.js";

const ports = { classifier: mockClassifier };

describe("the context gate", () => {
  it.each(loadSyntheticFixtures().map((f) => [f.name, f] as const))("%s", async (_name, { snapshot, expected }) => {
    expectContextMatches(await buildContext(snapshot, ports), expected);
  });
});

describe("buildContext", () => {
  it("labels behavioural units by rule and classifier, structural ones by rule, unchanged ones not at all", async () => {
    const fixtures = loadSyntheticFixtures();
    const context = async (name: string) => buildContext(fixtures.find((f) => f.name === name)!.snapshot, ports);
    const [page] = (await context("08-ui-with-test")).units;
    expect(page.labels).toMatchObject({ kind: "ui", visibility: "user", source: { kind: "rule", visibility: "model" } });
    expect((await context("03-rename-only")).units[0].labels).toMatchObject({ intent: "refactor", source: { intent: "rule" } });
    expect((await context("01-formatting-only")).units[0].labels).toBeUndefined();
  });

  it("marks behavioural logic no test covers as untested", async () => {
    const fixtures = loadSyntheticFixtures();
    const { units } = await buildContext(fixtures.find((f) => f.name === "05-condition-change")!.snapshot, ports);
    expect(units[0].labels?.risks).toEqual(["untested"]);
  });

  it.each(loadRecordedSnapshots().map((s) => [`${s.fullName}#${s.number}`, s] as const))(
    "%s gives a valid context, the same both times, each changed unit in one concern",
    async (_name, snapshot) => {
      const once = await buildContext(snapshot, ports);
      expect(await buildContext(snapshot, ports)).toEqual(once);
      expect(once.units.every((u) => u.verdict === "notAChange" || u.labels !== undefined)).toBe(true);
      const changed = once.units.filter((u) => u.verdict !== "notAChange").map((u) => u.id);
      expect(once.concerns.flatMap((c) => c.unitIds).sort()).toEqual(changed.sort());
      const known = new Set([...once.units.map((u) => u.id), ...once.sentences.map((s) => s.id)]);
      expect(once.facts.flatMap((f) => f.sources).filter((id) => !known.has(id))).toEqual([]);
    },
  );
});

describe("buildContext with a label cache and a budget", () => {
  const snapshot = () => loadSyntheticFixtures().find((f) => f.name === "08-ui-with-test")!.snapshot;

  function memoryCache(): LabelCache & { rows: Map<string, StoredLabels> } {
    const rows = new Map<string, StoredLabels>();
    return {
      rows,
      get: async (hashes) => new Map(hashes.filter((h) => rows.has(h)).map((h) => [h, rows.get(h)!])),
      put: async (entries) => void entries.forEach((e) => rows.set(e.inputHash, e)),
    };
  }

  it("labels from the cache the second time, without asking the classifier", async () => {
    const labelCache = memoryCache();
    const first = await buildContext(snapshot(), { classifier: mockClassifier, labelCache });
    expect(labelCache.rows.size).toBe(first.units.filter((u) => u.verdict === "behavioural").length + first.sentences.length);
    const failing: Classifier = { id: mockClassifier.id, classify: async () => Promise.reject(new Error("not called")) };
    expect(await buildContext(snapshot(), { classifier: failing, labelCache })).toEqual(first);
  });

  it("leaves units and sentences unlabelled when the classifier runs out of time, and still groups them", async () => {
    const stuck: Classifier = {
      id: "stuck",
      classify: (_items, signal) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason))),
    };
    const context = await buildContext(snapshot(), { classifier: stuck }, { budgetMs: 20 });
    expect(context.units.map((u) => u.labels)).toEqual([undefined, undefined]);
    expect(context.sentences.every((s) => s.class === undefined)).toBe(true);
    expect(context.concerns.map((c) => c.unitIds.length)).toEqual([2]);
    expect(context.facts.map((f) => f.group)).not.toContain("intent");
  });
});

