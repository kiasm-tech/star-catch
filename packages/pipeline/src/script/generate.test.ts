import { mockClassifier } from "@star-catch/changes";
import type { Script, Visual } from "@kiasm-tech/star-catch-contracts";
import { loadRecordedSnapshots, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import type { Llm, LlmRequest } from "../ports/llm.js";
import type { ScriptWriter, WrittenSentence } from "../ports/script-writer.js";
import { buildContext } from "../usecases/build-context.js";
import { buildScripts } from "../usecases/build-scripts.js";
import { elementIds } from "../visuals/elements.js";
import { checkSection, labelProblem } from "./checks.js";
import { generateScripts } from "./generate.js";
import { modelWriter, WRITER_CUT_PROMPT } from "./model-writer.js";
import { deCode, templateWriter } from "./template-writer.js";

const fixtures = loadSyntheticFixtures();
const snapshotOf = (name: string) => fixtures.find((f) => f.name === name)!.snapshot;
const scriptsOf = (snapshot: unknown, writer: ScriptWriter = templateWriter) => buildScripts(snapshot, { classifier: mockClassifier, writer });
const sectionsOf = (script: Script) => script.chapters.flatMap((c) => c.sections);
/** Narration with its marks resolved to element ids, for readable snapshots. */
const readable = (script: Script) =>
  [...sectionsOf(script), ...script.draft].map((s) => `${s.id}: ${s.narration.replace(/<mark name="(m\d+)"\/>/g, (_m, name: string) => `[${s.reveals[name]}]`)}`);

describe("generateScripts with the template writer", () => {
  it.each(fixtures.map((f) => [f.name, f] as const))("%s: the answer key's sections, all narrated and checked", async (_name, { snapshot, sections }) => {
    const scripts = await scriptsOf(snapshot);
    for (const cut of ["technical", "business"] as const) {
      const script = scripts[cut];
      expect(script === null).toBe(sections![cut] === null);
      if (!script) continue;
      expect(sectionsOf(script).filter((s) => !s.article.readMore).map((s) => s.id)).toEqual(sections![cut]!.sections);
      expect(script.draft.map((d) => d.id)).toEqual(sections![cut]!.draft);
      expect(script.flags.filter((f) => /dropped|no narration|writer failed|removed a mark/.test(f.message))).toEqual([]);
      for (const section of [...sectionsOf(script), ...script.draft]) {
        expect(section.sources.length).toBeGreaterThan(0);
        const marks = [...section.narration.matchAll(/<mark name="([^"]+)"\/>/g)].map((m) => m[1]);
        expect(Object.keys(section.reveals)).toEqual([...new Set(marks)]);
        expect(Object.values(section.reveals).every((id) => elementIds(section.visual).has(id))).toBe(true);
      }
    }
  });

  it.each(loadRecordedSnapshots().map((s) => [`${s.fullName}#${s.number}`, s] as const))("%s: valid scripts, the same both times", async (_name, snapshot) => {
    expect(await scriptsOf(snapshot)).toEqual(await scriptsOf(snapshot));
  });

  it("narrates PR #921 the same way every time", async () => {
    const scripts = await scriptsOf(snapshotOf("15-rate-limit-per-org"));
    expect({ technical: readable(scripts.technical!), business: readable(scripts.business!) }).toMatchSnapshot();
  });

  it("narrates 05 and 08 the same way every time", async () => {
    for (const name of ["05-condition-change", "08-ui-with-test"]) {
      const scripts = await scriptsOf(snapshotOf(name));
      expect({ name, technical: readable(scripts.technical!), business: scripts.business && readable(scripts.business) }).toMatchSnapshot();
    }
  });

  it("writes the same chapters for an open and a merged PR, and the appendix only while open", async () => {
    const open = snapshotOf("05-condition-change");
    const merged = { ...open, state: "closed" as const, merged: true };
    const [a, b] = [await scriptsOf(open), await scriptsOf(merged)];
    expect(b.technical!.chapters).toEqual(a.technical!.chapters);
    expect(a.technical!.draft.map((d) => d.id)).toEqual(["reviewFocus"]);
    expect(b.technical!.draft).toEqual([]);
  });

  it("speaks the PR's code names as words", () => {
    expect(deCode("fix(persist): `clearStorage()` should invalidate concurrent async rehydration")).toBe("clear storage should invalidate concurrent async rehydration");
    expect(deCode("adds a nullable gift_note column")).toBe("adds a nullable gift note column");
    expect(deCode("refactor(invoices): rename _gross to _with_vat")).toBe("rename gross to with vat");
    expect(deCode("Cart.total mixed summing, e.g. in v1.2")).toBe("total mixed summing, e.g. in v1.2");
  });
});

describe("the checks", () => {
  const visual: Visual = {
    type: "checklist",
    data: { items: [{ id: "test:a", label: "keeps the discount" }], more: 0 },
  };
  const base = { visual, known: new Set(["src/a.ts#f", "description:0", "pr:title"]), evidence: new Set(["5"]), components: ["api", "pricing"], codeNames: ["bulkDiscount", "BillingPage"] };
  const check = (cut: "technical" | "business", sentences: WrittenSentence[], draft = false) => checkSection({ ...base, cut, draft, sentences });
  const ok = (text: string): WrittenSentence => ({ text: `<mark name="test:a"/>${text}`, sources: ["src/a.ts#f"] });

  it("keeps a clean, sourced sentence that reveals its element", () => {
    expect(check("technical", [ok("A test keeps the discount from 5 units.")])).toEqual({ sentences: [ok("A test keeps the discount from 5 units.")], flags: [] });
  });

  it.each([
    ["no known source", { text: "It works.", sources: ["nope"] }, "dropped a sentence with no known source"],
    ["an invented number", { text: "It is 37% faster.", sources: ["src/a.ts#f"] }, "dropped a sentence with a number that isn't evidence (37%)"],
    ["a file path", { text: "See src/pricing/discount.ts for it.", sources: ["src/a.ts#f"] }, "dropped a sentence that names a file path"],
    ["call syntax", { text: "It calls bulkDiscount() now.", sources: ["src/a.ts#f"] }, "dropped a sentence that names code"],
    ["the PR's own code name", { text: "The BillingPage shows the date.", sources: ["src/a.ts#f"] }, "dropped a sentence that names a code name"],
  ])("drops a sentence with %s", (_name, sentence, flag) => {
    const { sentences, flags } = check("technical", [sentence as WrittenSentence]);
    expect(sentences).toEqual([]);
    expect(flags[0]).toMatch(new RegExp(`^${flag.replace(/[()%]/g, "\\$&")}`));
  });

  it("allows brand names and code names where they belong", () => {
    expect(check("technical", [ok("GraphQL and REST now share one limit.")]).flags).toEqual([]);
    expect(check("technical", [ok("Look at BillingPage first.")], true).sentences).toHaveLength(1);
  });

  it("keeps folder names out of the business cut, and flags acronyms there", () => {
    expect(check("business", [ok("The api now checks it.")]).flags[0]).toMatch(/component name "api"/);
    const acronym = check("business", [ok("Every API key shares one limit.")]);
    expect(acronym.sentences).toHaveLength(1);
    expect(acronym.flags).toEqual(["acronym without a glossary card: API"]);
  });

  it("removes a mark for an element the visual doesn't have, and flags what's never revealed", () => {
    const { sentences, flags } = check("technical", [{ text: '<mark name="ghost"/>It keeps the discount.', sources: ["src/a.ts#f"] }]);
    expect(sentences[0]!.text).toBe("It keeps the discount.");
    expect(flags).toEqual(["removed a mark for an element the visual doesn't have: ghost", "never revealed by the narration: test:a"]);
  });

  it("flags a section that runs well past its word budget", () => {
    const long = [ok(`${"word ".repeat(40).trim()}.`)];
    expect(checkSection({ ...base, cut: "technical", draft: false, sentences: long, wordLimit: 20 }).flags).toEqual(["longer than its 20-word budget (40 words)"]);
    expect(checkSection({ ...base, cut: "technical", draft: false, sentences: long, wordLimit: 30 }).flags).toEqual([]);
  });

  it("trims a section that runs over a minute", () => {
    const long = Array.from({ length: 4 }, () => ok(`${"word ".repeat(60).trim()}.`));
    const { sentences, flags } = check("technical", long);
    expect(sentences).toHaveLength(2);
    expect(flags).toContain("trimmed to stay under a minute");
  });
});

describe("writers", () => {
  it("flags a section whose writer fails, and keeps going", async () => {
    let calls = 0;
    const failing: ScriptWriter = {
      id: "failing",
      write: async (request) => {
        calls++;
        if (request.id === "rule") throw new Error("timeout");
        return templateWriter.write(request);
      },
    };
    const scripts = await scriptsOf(snapshotOf("05-condition-change"), failing);
    expect(scripts.technical!.flags).toContainEqual({ sectionId: "rule", message: "the writer failed: timeout" });
    expect(scripts.technical!.flags).toContainEqual({ sectionId: "rule", message: "no narration left" });
    expect(calls).toBe(sectionsOf(scripts.technical!).length + scripts.technical!.draft.length + sectionsOf(scripts.business!).length);
  });

  it("asks the model once per cut, each section with its purpose and only its facts, in de-coded words", async () => {
    const requests: LlmRequest[] = [];
    const llm: Llm = {
      completeJson: async (request) => {
        requests.push(request);
        const { sections } = JSON.parse(request.user) as { sections: { id: string }[] };
        return {
          sections: [
            ...sections.map((x) => (x.id === "rule" ? { id: "rule", sentences: "nope" } : { id: x.id, sentences: [{ text: "Apply the bulk discount from 5 units.", sources: ["pr:title"] }] })),
            { id: "unasked", sentences: [{ text: "Hello.", sources: ["pr:title"] }] },
          ],
        };
      },
    };
    const writer = modelWriter(llm, "gpt-6-luna");
    expect(writer.id).toMatch(/^model:gpt-6-luna@writer-[0-9a-f]{8}$/);
    const snapshot = snapshotOf("05-condition-change");
    const context = await buildContext(snapshot, { classifier: mockClassifier });
    const scripts = await generateScripts(context, { fullName: snapshot.fullName, number: snapshot.number, title: snapshot.title }, { writer, open: false });
    expect(requests.map((r) => r.system)).toEqual([WRITER_CUT_PROMPT, WRITER_CUT_PROMPT]);
    const technical = JSON.parse(requests[0]!.user) as { cut: string; sections: { id: string; purpose: string; facts: { group: string }[] }[] };
    expect(technical.cut).toBe("technical");
    expect(technical.sections.map((x) => x.id)).toEqual(sectionsOf(scripts.technical!).map((x) => x.id));
    const rule = technical.sections.find((x) => x.id === "rule")!;
    expect(rule.purpose).toBe("The rule that decides the outcome, before and after.");
    expect([...new Set(rule.facts.map((f) => f.group))].sort()).toEqual(["evidence", "intent", "rules"]);
    // Source ids keep their names (they're references), but nothing the model reads as words does.
    const read = JSON.parse(requests[0]!.user) as { sentences: { text: string }[]; sections: { facts: { value: unknown }[] }[] };
    expect(JSON.stringify([read.sentences, read.sections.map((x) => x.facts.map((f) => f.value))])).not.toMatch(/bulkDiscount/);
    expect(scripts.technical!.flags).toContainEqual({ sectionId: "rule", message: "no narration left" });
    expect(sectionsOf(scripts.technical!).find((x) => x.id === "title")!.narration).toBe("Apply the bulk discount from 5 units.");
  });

  it("gives a section the checks emptied one more try, saying why", async () => {
    const repairs: string[][] = [];
    const writer: ScriptWriter = {
      id: "fake",
      writeCut: async ({ sections }) => ({
        sections: Object.fromEntries(
          sections.map((x) => [x.id, [{ text: x.id === "rule" ? "The bulkDiscount threshold moved." : "Apply the bulk discount from 5 units.", sources: ["pr:title"] }]]),
        ),
      }),
      write: async (request) => {
        repairs.push(request.repair ?? []);
        return [{ text: "The threshold for the bulk discount moved.", sources: ["pr:title"] }];
      },
    };
    const scripts = await scriptsOf(snapshotOf("05-condition-change"), writer);
    expect(repairs).toEqual([['dropped a sentence that names a code name: "The bulkDiscount threshold moved."']]);
    expect(sectionsOf(scripts.technical!).find((x) => x.id === "rule")!.narration).toBe("The threshold for the bulk discount moved.");
    expect(scripts.technical!.flags.filter((f) => f.sectionId === "rule" && f.message.startsWith("dropped"))).toEqual([]);
  });

});

describe("the picture's words", () => {
  const sentence = [{ text: "Apply the bulk discount from 5 units.", sources: ["pr:title"] }];
  const relabelling = (label: (id: string) => string): ScriptWriter => ({
    id: "fake",
    writeCut: async ({ sections }) => ({
      sections: Object.fromEntries(sections.map((x) => [x.id, sentence])),
      labels: Object.fromEntries(sections.map((x) => [x.id, Object.fromEntries(x.labels.map((l) => [l.id, label(l.id)]))])),
    }),
    write: async () => sentence,
  });

  it("puts the writer's labels in the picture, the business title too", async () => {
    const scripts = await scriptsOf(snapshotOf("05-condition-change"), relabelling((id) => `plain words for ${id.split(":")[0]}`));
    const business = sectionsOf(scripts.business!);
    const title = business[0]!.visual as Extract<Visual, { type: "titleCard" }>;
    expect(title.data.title).toBe("plain words for title");
    const journey = business.find((x) => x.visual.type === "userJourney")!.visual as Extract<Visual, { type: "userJourney" }>;
    expect(journey.data.steps.every((s) => s.label === "plain words for step")).toBe(true);
    expect(scripts.business!.flags.filter((f) => f.message.startsWith("kept the picture"))).toEqual([]);
  });

  it("keeps the picture's own words where a label fails the checks", async () => {
    const scripts = await scriptsOf(snapshotOf("05-condition-change"), relabelling((id) => (id.startsWith("rule:") ? "the bulkDiscount rule" : "from 7 units")));
    const rule = sectionsOf(scripts.technical!).find((x) => x.id === "rule")!.visual as Extract<Visual, { type: "decisionDiagram" }>;
    expect(rule.data.subject.label).toBe("bulk discount");
    expect(rule.data.after.condition).toBe("quantity >= 5");
    expect(scripts.technical!.flags).toContainEqual({ sectionId: "rule", message: `kept the picture's own words for ${rule.data.subject.id}: it names a code name` });
    expect(scripts.business!.flags.some((f) => f.message.endsWith("it has a number that isn't evidence (7)"))).toBe(true);
  });

  it("rejects labels that are empty, too long, marked, code, or carry new numbers", () => {
    const base = { cut: "business" as const, original: "Orders of 10 or more", max: 80, evidence: new Set(["5"]), components: ["pricing"], codeNames: ["bulkDiscount"] };
    expect(labelProblem({ ...base, text: "Orders of 5 or more get the discount" })).toBeUndefined();
    expect(labelProblem({ ...base, text: "Orders of 10 or more" })).toBeUndefined();
    expect(labelProblem({ ...base, text: " " })).toBe("it's empty");
    expect(labelProblem({ ...base, text: "x".repeat(81) })).toBe("it's longer than 80 characters");
    expect(labelProblem({ ...base, text: 'a <mark name="m1"/> b' })).toBe("it has a mark");
    expect(labelProblem({ ...base, text: "calls bulkDiscount()" })).toBe("it names code");
    expect(labelProblem({ ...base, text: "Orders of 7 or more" })).toBe("it has a number that isn't evidence (7)");
  });
});
