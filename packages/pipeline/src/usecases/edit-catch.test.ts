import type { CatchVersion, Script, ScriptSection } from "@kiasm-tech/star-catch-contracts";
import { loadSyntheticFixtures } from "@star-catch/testkit";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockClassifier } from "../classifier.js";
import type { CatchStore } from "../ports/catch-store.js";
import type { ScriptWriter, WriteRequest } from "../ports/script-writer.js";
import { memoryMeter } from "../ports/usage.js";
import { templateWriter } from "../script/template-writer.js";
import { elementIds } from "../visuals/elements.js";
import { buildCatch } from "./build-catch.js";
import { editNarration, reviseNarration } from "./edit-catch.js";

const { snapshot } = loadSyntheticFixtures().find((f) => f.name === "05-condition-change")!;
const HEAD = snapshot.headSha;
const READ_AT = new Date("2026-10-05T10:00:00Z");
let built: CatchVersion;

beforeAll(async () => {
  built = await buildCatch(snapshot, { classifier: mockClassifier, writer: templateWriter });
});

const sectionsOf = (script: Script) => [...script.chapters.flatMap((c) => c.sections), ...script.draft];
/** A spoken section whose picture has something to reveal. */
const target = (version: CatchVersion): ScriptSection => sectionsOf(version.technical!).find((s) => Object.keys(s.reveals).length > 0)!;

function setUp(version: CatchVersion = built, { wins = true }: { wins?: boolean } = {}) {
  const edits: { version: CatchVersion; headSha: string; basedOn: Date }[] = [];
  const catches: CatchStore = {
    save: async () => {},
    edit: async (v, headSha, basedOn) => {
      edits.push({ version: v, headSha, basedOn });
      return wins;
    },
    latest: async (id) => (id === version.catchId ? { headSha: HEAD, generatedAt: READ_AT, version } : null),
    list: async () => [],
  };
  return { catches, edits };
}

describe("editNarration", () => {
  it("replaces one section's narration, numbering its marks again, and clears its flags", async () => {
    const section = target(built);
    const [voice, element] = Object.entries(section.reveals)[0]!;
    const flagged: CatchVersion = { ...built, technical: { ...built.technical!, flags: [...built.technical!.flags, { sectionId: section.id, message: "too long" }] } };
    const { catches, edits } = setUp(flagged);

    const result = await editNarration({ catches }, built.catchId, { cut: "technical", sectionId: section.id, narration: `In short, <mark name="${voice}"/>this check now runs first.` });

    expect(result.outcome).toBe("edited");
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ headSha: HEAD, basedOn: READ_AT });
    const edited = sectionsOf(edits[0]!.version.technical!).find((s) => s.id === section.id)!;
    expect(edited).toMatchObject({ narration: 'In short, <mark name="m1"/>this check now runs first.', reveals: { m1: element }, sources: section.sources, visual: section.visual });
    expect(edits[0]!.version.technical!.flags.filter((f) => f.sectionId === section.id)).toEqual([]);
    // Everything else is as it was.
    expect(sectionsOf(edits[0]!.version.technical!).filter((s) => s.id !== section.id)).toEqual(sectionsOf(built.technical!).filter((s) => s.id !== section.id));
    expect(edits[0]!.version.business).toEqual(built.business);
  });

  it("takes the picture's element ids as marks too", async () => {
    const section = target(built);
    const element = [...elementIds(section.visual)][0]!;
    const { catches, edits } = setUp();
    await editNarration({ catches }, built.catchId, { cut: "technical", sectionId: section.id, narration: `<mark name="${element}"/>Here it is.` });
    expect(sectionsOf(edits[0]!.version.technical!).find((s) => s.id === section.id)!.reveals).toEqual({ m1: element });
  });

  it.each([
    ['<mark name="nope"/>Here.', 'no element or voice mark named "nope"'],
    ["<b>Bold</b> words.", 'the only markup allowed is <mark name="…"/>'],
  ])("refuses %s", async (narration, reason) => {
    const { catches, edits } = setUp();
    const result = await editNarration({ catches }, built.catchId, { cut: "technical", sectionId: target(built).id, narration });
    expect(result).toEqual({ outcome: "invalid", reasons: [reason] });
    expect(edits).toEqual([]);
  });

  it("refuses a published catch, a missing catch or section, and a stale read", async () => {
    const edit = { cut: "technical" as const, sectionId: target(built).id, narration: "Plain words." };
    const merged = { ...built, pr: { ...built.pr, state: "merged" as const } };
    expect(await editNarration(setUp(merged), built.catchId, edit)).toEqual({ outcome: "not-draft" });
    expect(await editNarration(setUp(), "acme__shop__999", edit)).toEqual({ outcome: "no-catch" });
    expect(await editNarration(setUp(), built.catchId, { ...edit, sectionId: "nope" })).toEqual({ outcome: "no-section" });
    expect(await editNarration(setUp(built, { wins: false }), built.catchId, edit)).toEqual({ outcome: "conflict" });
  });
});

describe("reviseNarration", () => {
  /** Writes one sourced sentence, marking the first element it may reveal. */
  const writer = (text = "Now the check runs before the save."): ScriptWriter & { asked: WriteRequest[] } => {
    const asked: WriteRequest[] = [];
    return {
      id: "fake",
      asked,
      async write(request) {
        asked.push(request);
        const mark = request.elements[0] ? `<mark name="${request.elements[0].id}"/>` : "";
        return [{ text: `${mark}${text}`, sources: ["pr:title"] }];
      },
    };
  };

  function deps(write: ScriptWriter, stored = true) {
    const { catches, edits } = setUp();
    const runs = { start: vi.fn(async () => 7), finish: vi.fn(async () => {}) };
    const meter = memoryMeter();
    return {
      deps: { catches, snapshots: { has: async () => stored, save: async () => {}, find: async () => (stored ? snapshot : null) }, ports: { classifier: mockClassifier, writer: write }, runs, meter },
      edits,
      runs,
    };
  }

  it("rewrites only the asked section, as instructed, and records the run", async () => {
    const section = target(built);
    const fake = writer();
    const { deps: d, edits, runs } = deps(fake);

    const result = await reviseNarration(d, built.catchId, { cut: "technical", sectionId: section.id, instruction: "Say it in one sentence" });

    expect(result.outcome).toBe("edited");
    expect(fake.asked.map((r) => [r.id, r.instruction])).toEqual([[section.id, "Say it in one sentence"]]);
    const revised = sectionsOf(edits[0]!.version.technical!).find((s) => s.id === section.id)!;
    expect(revised.narration).toBe('<mark name="m1"/>Now the check runs before the save.');
    expect(revised.sources).toEqual(["pr:title"]);
    expect(revised.visual).toEqual(section.visual);
    expect(sectionsOf(edits[0]!.version.technical!).filter((s) => s.id !== section.id)).toEqual(sectionsOf(built.technical!).filter((s) => s.id !== section.id));
    expect(runs.start).toHaveBeenCalledWith({ fullName: snapshot.fullName, number: snapshot.number, headSha: HEAD });
    expect(runs.finish).toHaveBeenCalledWith(7, { status: "done", step: "revise", usage: [] });
  });

  it("keeps the section as it was when nothing the writer wrote passes the checks", async () => {
    const bad: ScriptWriter = { id: "bad", write: async () => [{ text: "Made up.", sources: ["nowhere"] }] };
    const { deps: d, edits } = deps(bad);
    const result = await reviseNarration(d, built.catchId, { cut: "technical", sectionId: target(built).id, instruction: "Anything" });
    expect(result.outcome).toBe("invalid");
    expect(result.outcome === "invalid" && result.reasons.join()).toContain("no known source");
    expect(edits).toEqual([]);
  });

  it("records a writer's failure and throws it", async () => {
    const broken: ScriptWriter = { id: "broken", write: async () => Promise.reject(new Error("timeout")) };
    const { deps: d, runs } = deps(broken);
    await expect(reviseNarration(d, built.catchId, { cut: "technical", sectionId: target(built).id, instruction: "Anything" })).rejects.toThrow("timeout");
    expect(runs.finish).toHaveBeenCalledWith(7, expect.objectContaining({ status: "failed", error: "timeout" }));
  });

  it("needs the snapshot the catch was built from", async () => {
    const { deps: d, runs } = deps(writer(), false);
    expect(await reviseNarration(d, built.catchId, { cut: "technical", sectionId: target(built).id, instruction: "Anything" })).toEqual({ outcome: "no-snapshot" });
    expect(runs.start).not.toHaveBeenCalled();
  });
});
