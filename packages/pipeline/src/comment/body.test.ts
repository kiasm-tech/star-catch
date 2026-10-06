import type { CatchVersion, Script } from "@kiasm-tech/star-catch-contracts";
import { loadRecordedSnapshots } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { mockClassifier } from "../classifier.js";
import { templateWriter } from "../script/template-writer.js";
import { buildCatch } from "../usecases/build-catch.js";
import { COMMENT_MARKER, commentBody, videoSeconds } from "./body.js";

const snapshot = loadRecordedSnapshots().find((s) => s.number === 3555)!;
const version = await buildCatch(snapshot, { classifier: mockClassifier, writer: templateWriter });
const links = { cruxUrl: "https://crux.example/", headSha: snapshot.headSha };
const page = (cut: string) => `https://crux.example/star-catch/pmndrs__zustand__3555?cut=${cut}`;

function withSection(script: Script, chapter: string, narration: string): Script {
  return { ...script, chapters: script.chapters.map((c) => (c.id === chapter ? { ...c, sections: [{ ...c.sections[0]!, narration }, ...c.sections.slice(1)] } : c)) };
}

describe("commentBody", () => {
  it("leads with the technical video in a tip: its length and link, what it does, why, and read more", () => {
    const technical = withSection(
      withSection(version.technical!, "opening", 'Clearing <mark name="m1"/>storage now invalidates a pending read. A second sentence.'),
      "why",
      "Before, an older read could restore cleared data. The version never advanced. A third sentence stays out.",
    );
    const seconds = videoSeconds(technical);
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const body = commentBody({ ...version, technical }, links)!;

    expect(body).toBe(
      [
        COMMENT_MARKER,
        `> [!TIP]\n> **🎬 This PR has a ${clock} video.** [Watch it on Crux →](${page("technical")})`,
        "**What it does:** Clearing storage now invalidates a pending read.",
        "**Why:** Before, an older read could restore cleared data. The version never advanced.",
        `[Read more](${page("technical")}): the full video, the article it's narrated from, and a [plain-language version](${page("business")}).`,
        `<sub>Star Catch · built from \`${snapshot.headSha.slice(0, 7)}\`</sub>`,
      ].join("\n\n"),
    );
  });

  it("falls back to the business video, linking the technical article", () => {
    const technical = { ...version.technical!, gate: { outcome: "articleOnly" as const, failed: ["visible" as const] } };
    const body = commentBody({ ...version, technical }, links)!;
    expect(body).toContain(`[Watch it on Crux →](${page("business")})`);
    expect(body).toContain(`and a [technical version](${page("technical")}).`);
  });

  it("is null when no cut has a video", () => {
    const articleOnly = (s: Script | null) => s && { ...s, gate: { outcome: "articleOnly" as const, failed: [] } };
    expect(commentBody({ ...version, technical: articleOnly(version.technical), business: articleOnly(version.business) }, links)).toBeNull();
    expect(commentBody({ ...version, technical: null, business: null } as CatchVersion, links)).toBeNull();
  });

  it("says only the video and article when the other cut has nothing", () => {
    const body = commentBody({ ...version, business: null }, links)!;
    expect(body).toContain(`[Read more](${page("technical")}): the full video and the article it's narrated from.`);
  });

  it("can't ping anyone or inject HTML, and writes no long dashes", () => {
    const technical = withSection(version.technical!, "opening", "Thanks @octocat for <img src=x> the fix \u2014 it holds \u2013 mostly.");
    const body = commentBody({ ...version, technical }, links)!;
    expect(body).not.toMatch(/@octocat|<img|[\u2013\u2014]/);
    expect(body).toContain("@\u2060octocat");
    expect(body).toContain("the fix, it holds, mostly.");
  });
});

describe("videoSeconds", () => {
  it("counts the spoken words outside Read more at 150 a minute", () => {
    const section = version.technical!.chapters[0]!.sections[0]!;
    const sections = [
      { ...section, narration: Array(150).fill('<mark name="m1"/>word').join(" ") },
      { ...section, narration: Array(75).fill("word").join(" ") },
      { ...section, narration: Array(500).fill("word").join(" "), article: { ...section.article, readMore: true } },
    ];
    expect(videoSeconds({ ...version.technical!, chapters: [{ ...version.technical!.chapters[0]!, sections }] })).toBe(90);
  });
});
