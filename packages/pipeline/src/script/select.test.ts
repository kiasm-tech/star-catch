import {
  SectionPlanSchema,
  type ChangeUnit,
  type Context,
  type Cut,
  type SectionPlan,
  type SectionsExpectation,
} from "@kiasm-tech/star-catch-contracts";
import { mockClassifier } from "@star-catch/changes";
import { loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { buildContext } from "../usecases/build-context.js";
import { FactIndex } from "./facts-index.js";
import { gatesOf, isUnsafe } from "./gates.js";
import { SECTION_RULES, type SectionRule } from "./sections.js";
import { fitToCap, selectSections } from "./select.js";

const fixtures = loadSyntheticFixtures();

/** A plan in the answer key's shape. */
function asExpectation(plan: SectionPlan): SectionsExpectation["technical"] {
  if (plan.gate.outcome === "none") return null;
  const sections = plan.chapters.flatMap((c) => c.sections);
  return {
    gate: plan.gate.outcome,
    sections: sections.filter((s) => !s.readMore).map((s) => s.id),
    readMore: sections.filter((s) => s.readMore).map((s) => s.id),
    draft: plan.draft.map((d) => d.id),
  };
}

describe("the section gate", () => {
  it.each(fixtures.map((f) => [f.name, f] as const))("%s", async (_name, { snapshot, sections }) => {
    const context = await buildContext(snapshot, { classifier: mockClassifier });
    const open = snapshot.state === "open";
    for (const cut of ["technical", "business"] as const) {
      const plan = SectionPlanSchema.parse(selectSections(context, cut, { open }));
      expect({ cut, ...asExpectation(plan) }).toEqual({ cut, ...sections![cut] });
    }
  });
});

describe("selectSections", () => {
  const contextOf = async (name: string) => buildContext(fixtures.find((f) => f.name === name)!.snapshot, { classifier: mockClassifier });

  it("gives every section either a place or a reason", async () => {
    for (const { snapshot } of fixtures) {
      const context = await buildContext(snapshot, { classifier: mockClassifier });
      for (const cut of ["technical", "business"] as const) {
        const plan = selectSections(context, cut, { open: true });
        const placed = plan.chapters.flatMap((c) => c.sections.map((s) => s.id));
        const skipped = plan.skipped.map((s) => s.sectionId);
        expect([...placed, ...skipped].sort()).toEqual(SECTION_RULES.filter((r) => r.cut === cut).map((r) => r.id).sort());
      }
    }
  });

  it("lists chapters in arc order and only the ones with a section", async () => {
    const plan = selectSections(await contextOf("15-rate-limit-per-org"), "technical", { open: false });
    expect(plan.chapters.map((c) => c.id)).toEqual(["opening", "why", "whatChanged", "howItWorks", "reach", "watchOut", "wrap"]);
    expect(selectSections(await contextOf("03-rename-only"), "technical", { open: false }).chapters.map((c) => c.id)).toEqual([
      "opening",
      "why",
      "whatChanged",
      "wrap",
    ]);
  });

  it("adds the draft-only appendix to the technical article while the PR is open, never to business", async () => {
    const context = await contextOf("05-condition-change");
    expect(selectSections(context, "technical", { open: true }).draft.map((d) => d.id)).toEqual(["reviewFocus"]);
    expect(selectSections(context, "technical", { open: false }).draft).toEqual([]);
    expect(selectSections(context, "business", { open: true }).draft).toEqual([]);
  });

  it("chooses the same chapters whether the PR is open or merged", async () => {
    for (const { snapshot } of fixtures) {
      const context = await buildContext(snapshot, { classifier: mockClassifier });
      for (const cut of ["technical", "business"] as const) {
        expect(selectSections(context, cut, { open: true }).chapters).toEqual(selectSections(context, cut, { open: false }).chapters);
      }
    }
  });
});

describe("gatesOf", () => {
  const unit = (fields: Partial<ChangeUnit>): ChangeUnit => ({
    id: "src/a.ts#f",
    file: "src/a.ts",
    name: "f",
    unitKind: "declaration",
    language: "typescript",
    verdict: "behavioural",
    changeType: "bodyChanged",
    refactorings: [],
    component: "src",
    ...fields,
  });
  const context = (fields: Partial<Context>): Context => ({
    version: 1,
    labelSetVersion: 1,
    pr: { fullName: "acme/shop", number: 1, headSha: "abcdef1" },
    degraded: false,
    truncated: false,
    units: [unit({})],
    links: [],
    entryPoints: [],
    concerns: [],
    sentences: [{ id: "description:0", origin: "description", text: "It was wrong.", class: "problem", numbers: [] }],
    facts: [],
    excluded: [],
    ...fields,
  });

  it.each<[string, Partial<Context>, Cut, string, string[]]>([
    ["a readable, explained change", {}, "technical", "full", []],
    ["a truncated snapshot", { truncated: true }, "technical", "articleOnly", ["readable"]],
    ["no why", { sentences: [] }, "technical", "articleOnly", ["explainable"]],
    ["only formatting", { units: [unit({ verdict: "notAChange" })] }, "technical", "none", ["meaningful"]],
    ["only a private key", { units: [unit({ after: "-----BEGIN RSA PRIVATE KEY-----" })] }, "technical", "none", ["safe"]],
    ["nothing visible", {}, "business", "none", ["visible"]],
  ])("%s", (_name, fields, cut, outcome, failed) => {
    expect(gatesOf(context(fields), cut)).toEqual({ outcome, failed });
  });

  it("treats denylisted files and secrets in shown text as unsafe", () => {
    expect(isUnsafe(unit({ file: "config/.env.production" }))).toBe(true);
    expect(isUnsafe(unit({ file: ".env.example" }))).toBe(false);
    expect(isUnsafe(unit({ after: 'const token = "ghp_' + "a".repeat(36) + '";' }))).toBe(true);
    expect(isUnsafe(unit({ after: "const limit = 5;" }))).toBe(false);
  });

  it("counts only numbers that measure the business", () => {
    const withSentence = (text: string, numbers: string[]) =>
      new FactIndex(
        context({
          sentences: [{ id: "description:0", origin: "description", text, class: "behaviour", numbers }],
          facts: [{ group: "evidence", key: "numbers", value: numbers, sources: ["description:0"] }],
        }),
      ).businessNumbers();
    expect(withSentence("Latency moved from 4.0 to 4.2 ms.", ["4.0", "4.2"])).toEqual([]);
    expect(withSentence("It handles 120 rps.", ["120"])).toEqual([]);
    expect(withSentence("Orders of 40 EUR or more ship free.", ["40"])).toEqual(["40"]);
    expect(withSentence("Customers ordering 5 to 9 units", ["5", "9"])).toEqual(["5", "9"]);
  });
});

describe("fitToCap", () => {
  const rule = (id: string, include: SectionRule["include"], estSeconds: number) =>
    ({ id, cut: "technical", chapter: "whatChanged", include, visual: "componentMap", estSeconds }) as SectionRule;

  it("fills always, then when relevant, then if room, and moves the rest to Read more", () => {
    const rules = [rule("a", "always", 40), rule("b", "whenRelevant", 40), rule("c", "ifRoom", 10), rule("d", "whenRelevant", 30)];
    const fits = fitToCap(rules, 100);
    expect(rules.map((r) => [r.id, fits.get(r)!.readMore])).toEqual([["a", false], ["b", false], ["c", true], ["d", true]]);
    expect(fits.get(rules[0])!.wordLimit).toBe(100);
  });

  it("keeps every always section and shrinks their words when they alone overflow", () => {
    const rules = [rule("a", "always", 100), rule("b", "always", 100), rule("c", "whenRelevant", 10)];
    const fits = fitToCap(rules, 100);
    expect(rules.map((r) => fits.get(r)!.readMore)).toEqual([false, false, true]);
    expect(fits.get(rules[0])!.wordLimit).toBe(125);
  });
});
