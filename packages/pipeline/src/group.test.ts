import type { ChangeUnit, Kind, Visibility } from "@kiasm-tech/star-catch-contracts";
import { describe, expect, it } from "vitest";
import { concernsOf } from "./group.js";

const unit = (name: string, fields: Partial<ChangeUnit> & { kind?: Kind; visibility?: Visibility } = {}): ChangeUnit => {
  const { kind = "logic", visibility = "internal", ...rest } = fields;
  return {
    id: `src/a.ts#${name}`,
    file: "src/a.ts",
    name,
    unitKind: "declaration",
    language: "typescript",
    verdict: "behavioural",
    changeType: "bodyChanged",
    refactorings: [],
    component: "src",
    labels: {
      kind,
      intent: "fix",
      visibility,
      risks: [],
      confidence: { kind: 1, intent: 1, visibility: 1, risks: 1 },
      source: { kind: "rule", intent: "rule", visibility: "rule", risks: "rule" },
    },
    ...rest,
  };
};

const ids = (names: string[]) => names.map((n) => `src/a.ts#${n}`);

describe("concernsOf", () => {
  it("joins linked units, puts strays with their component and leaves unchanged units out", () => {
    const units = [
      unit("a"),
      unit("b"),
      unit("c", { component: "lib" }),
      unit("d", { component: "lib" }),
      unit("e", { verdict: "notAChange", labels: undefined }),
      unit("t", { kind: "test" }),
    ];
    const links = [
      { from: ids(["t"])[0], to: ids(["a"])[0], type: "covers" as const },
      { from: ids(["e"])[0], to: ids(["b"])[0], type: "covers" as const },
    ];
    expect(concernsOf(units, links, []).map((c) => c.unitIds)).toEqual([ids(["a", "b", "t"]), ids(["c", "d"])]);
  });

  it("puts a doc section with the unit it names", () => {
    const units = [unit("bulkDiscount"), unit("Pricing", { kind: "documentation", component: "docs", after: "## Pricing\n\nbulkDiscount starts at 5 units." })];
    expect(concernsOf(units, [], []).map((c) => c.unitIds)).toEqual([ids(["bulkDiscount", "Pricing"])]);
  });

  it("ranks by visibility times reach, then size, then order", () => {
    const units = [
      unit("helper", { component: "lib" }),
      unit("other", { component: "lib" }),
      unit("page", { kind: "ui", visibility: "user", component: "app" }),
      unit("api", { visibility: "apiConsumer", component: "api" }),
      unit("caller", { component: "api" }),
    ];
    const links = [{ from: ids(["caller"])[0], to: ids(["api"])[0], type: "calls" as const }];
    const concerns = concernsOf(units, links, [{ unitId: ids(["page"])[0], type: "page" }]);
    expect(concerns.map((c) => [c.id, c.rank, c.importance, c.unitIds])).toEqual([
      ["concern-1", 1, 8, ids(["page"])],
      ["concern-2", 2, 6, ids(["api", "caller"])],
      ["concern-3", 3, 1, ids(["helper", "other"])],
    ]);
  });

  it("is empty when nothing changed", () => {
    expect(concernsOf([unit("a", { verdict: "notAChange", labels: undefined })], [], [])).toEqual([]);
  });
});
