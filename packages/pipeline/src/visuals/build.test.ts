import { IMPLEMENTED_VISUALS, VisualSchema, type Context, type Cut, type PullRequestSnapshot, type Visual } from "@kiasm-tech/star-catch-contracts";
import { mockClassifier } from "@star-catch/changes";
import { loadRecordedSnapshots, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { SECTION_RULES } from "../script/sections.js";
import { selectSections } from "../script/select.js";
import { buildContext } from "../usecases/build-context.js";
import { buildVisual, changedCondition, outcomesOf, type VisualInput } from "./build.js";
import { clip, humanize, plainTitle } from "./words.js";

const fixtures = loadSyntheticFixtures();
const prOf = (s: PullRequestSnapshot) => ({ fullName: s.fullName, number: s.number, title: s.title, ...(s.author && { author: s.author }) });

async function inputs(snapshot: PullRequestSnapshot): Promise<{ input: VisualInput; ids: string[] }[]> {
  const context = await buildContext(snapshot, { classifier: mockClassifier });
  return (["technical", "business"] as Cut[]).flatMap((cut) => {
    const plan = selectSections(context, cut, { open: true });
    if (plan.gate.outcome === "none") return [];
    const ids = [...plan.chapters.flatMap((c) => c.sections.map((s) => s.id)), ...plan.draft.map((d) => d.id)];
    return [{ input: { context, pr: prOf(snapshot), cut, plan }, ids }];
  });
}

const visualOf = async (name: string, cut: Cut, section: string) => {
  const snapshot = fixtures.find((f) => f.name === name)!.snapshot;
  const found = (await inputs(snapshot)).find((i) => i.input.cut === cut)!;
  return buildVisual(section as never, found.input);
};

describe("buildVisual", () => {
  it("has a schema for the visual of every section that can qualify", () => {
    const visuals = SECTION_RULES.filter((r) => !["lifecycle", "dataFlow"].includes(r.id)).map((r) => r.visual);
    expect(visuals.filter((v) => !IMPLEMENTED_VISUALS.includes(v as never))).toEqual([]);
  });

  it.each([...fixtures.map((f) => [f.name, f.snapshot] as const), ...loadRecordedSnapshots().map((s) => [`${s.fullName}#${s.number}`, s] as const)])(
    "builds a valid visual for every section %s gets, the same both times",
    async (_name, snapshot) => {
      for (const { input, ids } of await inputs(snapshot)) {
        const planned = new Map([
          ...input.plan.chapters.flatMap((c) => c.sections.map((s) => [s.id, s.visual] as const)),
          ...input.plan.draft.map((d) => [d.id, d.visual] as const),
        ]);
        for (const id of ids) {
          const built = buildVisual(id as never, input);
          expect(VisualSchema.parse(built.visual).type).toBe(planned.get(id as never));
          expect(buildVisual(id as never, input)).toEqual(built);
        }
      }
    },
  );

  it("shows PR #921 from the outside: API client, the route, and the answers its code gives", async () => {
    const { visual } = await visualOf("15-rate-limit-per-org", "technical", "fromOutside");
    expect(visual).toMatchObject({
      type: "systemSequenceDiagram",
      data: {
        participants: [{ label: "API client", role: "actor" }, { label: "shop", role: "system" }],
        messages: [{ label: "POST /api/orders" }],
        outcomes: [
          { label: "429 Too many requests", kind: "refused" },
          { label: "200 OK", kind: "ok" },
        ],
      },
    });
  });

  it("puts the limiter at the centre of #921's reach, its three callers around it", async () => {
    const { visual } = await visualOf("15-rate-limit-per-org", "technical", "reach");
    expect(visual).toMatchObject({ type: "impactRings", data: { center: { label: "limits" }, rings: [{ items: [{ label: "api" }, { label: "graphql" }, { label: "jobs" }] }] } });
  });

  it("shows a rule as code in the technical cut and as a sentence in the business cut", async () => {
    expect((await visualOf("05-condition-change", "technical", "rule")).visual.data).toMatchObject({
      before: { condition: "quantity >= 10" },
      after: { condition: "quantity >= 5" },
    });
    expect((await visualOf("05-condition-change", "business", "theRuleNow")).visual.data).toMatchObject({
      before: null,
      after: { condition: expect.stringContaining("from 10 to 5 units") },
    });
    expect((await visualOf("11-python-condition", "technical", "rule")).visual.data).toMatchObject({ after: { condition: "subtotal >= 40" } });
  });

  it("puts the reasons beside what it does now when a PR names no problem", async () => {
    const { visual } = await visualOf("06-config-key", "technical", "problem");
    expect(visual).toMatchObject({
      type: "beforeAfterSplit",
      data: {
        before: { label: "Why", items: [{ text: expect.stringContaining("rolled out gradually") }] },
        after: { label: "Now", items: [expect.anything()] },
      },
    });
  });

  it("draws a new column as a field added to its entity", async () => {
    expect((await visualOf("07-migration", "technical", "dataChange")).visual.data).toEqual({
      entities: [{ id: "entity:orders", label: "orders", change: "changed", fields: [{ id: "field:orders.gift_note", name: "gift_note", change: "added" }] }],
    });
  });

  it("lists test cases by their own titles", async () => {
    expect((await visualOf("08-ui-with-test", "technical", "verification")).visual.data).toEqual({
      items: [{ id: "test:app/billing/page.test.tsx#BillingPage > explains when the plan renews", label: "explains when the plan renews" }],
      more: 0,
    });
  });

  it("keeps the first seven components by concern rank and says so", async () => {
    const context = (await inputs(fixtures.find((f) => f.name === "05-condition-change")!.snapshot))[0]!.input.context;
    const many: Context = {
      ...context,
      units: Array.from({ length: 9 }, (_, i) => ({ ...context.units[0]!, id: `c${i}/a.ts#f`, file: `c${i}/a.ts`, component: `c${i}` })),
      concerns: [],
    };
    const input = { context: many, pr: { fullName: "acme/shop", number: 1, title: "x" }, cut: "technical" as const, plan: selectSections(many, "technical", { open: false }) };
    const built = buildVisual("changeMap", input);
    expect(VisualSchema.parse(built.visual).type).toBe("componentMap");
    expect(built.flags).toEqual(["changeMap: kept the first 7 of 9 components"]);
  });

  it("sets the changed parts among their unchanged neighbours, the ones they import first", async () => {
    const context = (await inputs(fixtures.find((f) => f.name === "05-condition-change")!.snapshot))[0]!.input.context;
    const changedComponent = context.units.find((u) => u.verdict !== "notAChange")!.component;
    const withLayout: Context = {
      ...context,
      layout: {
        neighbours: [
          { component: "checkout", files: 12 },
          { component: "catalog", files: 9 },
          { component: "cart", files: 4 },
        ],
        uses: [{ from: changedComponent, to: "cart" }],
      },
    };
    const input = { context: withLayout, pr: { fullName: "acme/shop", number: 1, title: "x" }, cut: "technical" as const, plan: selectSections(withLayout, "technical", { open: false }) };
    const map = VisualSchema.parse(buildVisual("changeMap", input).visual) as Extract<Visual, { type: "componentMap" }>;
    const unchanged = map.data.nodes.filter((n) => !n.changed);
    expect(unchanged.map((n) => n.label)).toEqual(["cart", "checkout", "catalog"]);
    expect(map.data.edges).toContainEqual({ id: `edge:${changedComponent}->cart`, from: `component:${changedComponent}`, to: "component:cart" });
    // The neighbours sit below every changed part.
    const lowest = Math.max(...map.data.nodes.filter((n) => n.changed).map((n) => n.box.y + n.box.h));
    expect(unchanged.every((n) => n.box.y > lowest)).toBe(true);
    // The review focus stays on what changed.
    const focus = buildVisual("reviewFocus", { ...input, plan: selectSections(withLayout, "technical", { open: true }) }).visual as Extract<Visual, { type: "componentMap" }>;
    expect(focus.data.nodes.every((n) => n.changed)).toBe(true);
  });

  it("keeps the map to seven parts, neighbours filling only what's left", async () => {
    const context = (await inputs(fixtures.find((f) => f.name === "05-condition-change")!.snapshot))[0]!.input.context;
    const unit = context.units.find((u) => u.verdict !== "notAChange")!;
    const six: Context = {
      ...context,
      units: Array.from({ length: 6 }, (_, i) => ({ ...unit, id: `c${i}/a.ts#f`, file: `c${i}/a.ts`, component: `c${i}` })),
      concerns: [],
      layout: { neighbours: [{ component: "x", files: 3 }, { component: "y", files: 2 }], uses: [] },
    };
    const input = { context: six, pr: { fullName: "acme/shop", number: 1, title: "x" }, cut: "technical" as const, plan: selectSections(six, "technical", { open: false }) };
    const map = buildVisual("changeMap", input).visual as Extract<Visual, { type: "componentMap" }>;
    expect(map.data.nodes.map((n) => [n.label, n.changed])).toContainEqual(["x", false]);
    expect(map.data.nodes).toHaveLength(7);
  });

  it("opens a map with one component into what changed in it", async () => {
    const context = (await inputs(fixtures.find((f) => f.name === "05-condition-change")!.snapshot))[0]!.input.context;
    const unit = context.units.find((u) => u.verdict !== "notAChange")!;
    const one: Context = {
      ...context,
      units: [
        { ...unit, id: "src/cart/totals.ts#itemTotal", file: "src/cart/totals.ts", name: "itemTotal", component: "cart", refactorings: ["rename"] },
        { ...unit, id: "src/cart/totals.ts#cartTotal", file: "src/cart/totals.ts", name: "cartTotal", component: "cart", refactorings: [], changeType: "bodyChanged" },
      ],
      concerns: [],
      layout: undefined,
    };
    const input = { context: one, pr: { fullName: "acme/shop", number: 1, title: "x" }, cut: "technical" as const, plan: selectSections(one, "technical", { open: false }) };
    const map = VisualSchema.parse(buildVisual("changeMap", input).visual) as Extract<Visual, { type: "componentMap" }>;
    expect(map.data.nodes[0]!.changes).toEqual([
      { file: "src/cart/totals.ts", name: "item total", change: "renamed" },
      { file: "src/cart/totals.ts", name: "cart total", change: "changed" },
    ]);
    expect(map.data.nodes[0]!.box).toEqual({ x: 220, y: (562 - 156) / 2, w: 560, h: 64 + 32 + 2 * 30 });
  });

  it("lists each component's changed files, first four by rank, and makes room for them", async () => {
    const context = (await inputs(fixtures.find((f) => f.name === "05-condition-change")!.snapshot))[0]!.input.context;
    const unit = context.units[0]!;
    const many: Context = {
      ...context,
      units: [...Array.from({ length: 5 }, (_, i) => ({ ...unit, id: `src/pricing/f${i}.ts#f`, file: `src/pricing/f${i}.ts`, component: "pricing" })), { ...unit, id: "src/cart/a.ts#f", file: "src/cart/a.ts", component: "cart" }],
      concerns: [],
      layout: undefined,
    };
    const input = { context: many, pr: { fullName: "acme/shop", number: 1, title: "x" }, cut: "technical" as const, plan: selectSections(many, "technical", { open: false }) };
    const built = buildVisual("changeMap", input);
    const map = VisualSchema.parse(built.visual) as Extract<Visual, { type: "componentMap" }>;
    expect(map.data.nodes.map((n) => [n.label, n.files])).toEqual([
      ["pricing", ["src/pricing/f0.ts", "src/pricing/f1.ts", "src/pricing/f2.ts", "src/pricing/f3.ts"]],
      ["cart", ["src/cart/a.ts"]],
    ]);
    expect(map.data.nodes.every((n) => n.box.h === 72 + 4 * 30)).toBe(true);
    expect(built.flags).toEqual(["changeMap: kept the first 4 of 5 files in pricing"]);
  });
});

describe("visual helpers", () => {
  it.each([
    ["persistImpl", "persist"],
    ["BillingPage", "billing page"],
    ["Cart._subtotal", "subtotal"],
    ["shipping_fee", "shipping fee"],
    ["allowRequest > counts two keys", "counts two keys"],
    ["limiter.test.ts", "limiter"],
    ["POST", "POST"],
  ])("humanize(%s) = %s", (name, label) => expect(humanize(name)).toBe(label));

  it("strips a conventional prefix and clips long text at a clause", () => {
    expect(plainTitle("fix(limits): rate limits count per organisation")).toBe("Rate limits count per organisation");
    expect(clip("Customers ordering 5 to 9 units never got the bulk discount, and support keeps getting tickets about it.", 60)).toBe(
      "Customers ordering 5 to 9 units never got the bulk discount",
    );
  });

  it("never clips past the limit, wherever the clause or word breaks fall", () => {
    const words = "alpha, beta; gamma delta: epsilon zeta, eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon".split(" ");
    for (let max = 20; max <= 90; max++) {
      for (let start = 0; start < words.length; start++) {
        const text = [...words.slice(start), ...words.slice(0, start)].join(" ").repeat(2);
        expect(clip(text, max).length).toBeLessThanOrEqual(max);
      }
    }
  });

  it("reads responses and errors out of handler code", () => {
    expect(outcomesOf('return new Response("Too many requests", { status: 429 });\nreturn Response.json({ ok: true });')).toEqual([
      { label: "429 Too many requests", kind: "refused" },
      { label: "200 OK", kind: "ok" },
    ]);
    expect(outcomesOf('throw new Error("Too many requests");')).toEqual([{ label: "Too many requests", kind: "refused" }]);
    expect(outcomesOf("res.status(500).send()")).toEqual([{ label: "500", kind: "error" }]);
  });

  it("finds the first condition that changed", () => {
    expect(changedCondition("if (q >= 10) {\n  a();\n}", "if (q >= 5) {\n  a();\n}")).toEqual({ before: "q >= 10", after: "q >= 5" });
    expect(changedCondition("    if total >= 50:\n", "    if total >= 40:\n")).toEqual({ before: "total >= 50", after: "total >= 40" });
    expect(changedCondition("return 1;", "return 1;")).toBeNull();
  });
});
