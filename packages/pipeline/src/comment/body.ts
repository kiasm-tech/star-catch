/** The PR comment that points at a catch's video: what changed, why, and the link to watch and read more. */
import type { CatchVersion, Cut, Script, ScriptSection } from "@kiasm-tech/star-catch-contracts";
import { WORDS_PER_MINUTE } from "../script/select.js";
import { splitSentences } from "../text.js";

/** Finds the comment again on the next run, so it is edited rather than posted twice. */
export const COMMENT_MARKER = "<!-- star-catch -->";

const OTHER_CUT_LABEL: Record<Cut, string> = { technical: "plain-language version", business: "technical version" };

const spoken = (section: ScriptSection) => section.narration.replace(/<mark\b[^>]*\/>/g, "").replace(/\s+/g, " ").trim();

/** Narration is model-written: no raw HTML, no `@name` that would ping someone, and no long dashes. */
const escape = (text: string) =>
  text
    .replace(/</g, "&lt;")
    .replace(/@(?=\w)/g, "@\u2060")
    .replace(/\s*\u2014\s*|\s+\u2013\s+/g, ", ");

const lead = (section: ScriptSection | undefined, sentences = 2) =>
  section ? escape(splitSentences(spoken(section)).slice(0, sentences).join(" ")) : "";

const hasVideo = (script: Script | null): script is Script => script?.gate.outcome === "full";

const firstOf = (script: Script, chapter: Script["chapters"][number]["id"]) => script.chapters.find((c) => c.id === chapter)?.sections[0];

/** The video's spoken length: every section not left to Read more, at the narrator's pace. */
export function videoSeconds(script: Script): number {
  const words = script.chapters
    .flatMap((c) => c.sections)
    .filter((s) => !s.article.readMore)
    .reduce((n, s) => n + spoken(s).split(" ").filter(Boolean).length, 0);
  return Math.round((words * 60) / WORDS_PER_MINUTE);
}

/** 77 → "1:17". */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export interface CommentLinks {
  /** Crux's origin, e.g. https://crux.kiasm.dev */
  cruxUrl: string;
  /** The commit the catch was built from. */
  headSha: string;
}

/** Leads with the technical cut, else the business one; null when neither has a video. */
export function commentBody(version: CatchVersion, { cruxUrl, headSha }: CommentLinks): string | null {
  const script = [version.technical, version.business].find(hasVideo);
  if (!script) return null;
  const other = script.cut === "technical" ? version.business : version.technical;
  const page = (cut: Cut) => `${cruxUrl.replace(/\/+$/, "")}/star-catch/${encodeURIComponent(version.catchId)}?cut=${cut}`;

  const what = lead(firstOf(script, "opening"), 1);
  const why = lead(firstOf(script, "why"));
  const contents =
    other && other.gate.outcome !== "none"
      ? `the full video, the article it's narrated from, and a [${OTHER_CUT_LABEL[script.cut]}](${page(other.cut)})`
      : "the full video and the article it's narrated from";

  return [
    COMMENT_MARKER,
    `> [!TIP]\n> **🎬 This PR has a ${clock(videoSeconds(script))} video.** [Watch it on Crux →](${page(script.cut)})`,
    what && `**What it does:** ${what}`,
    why && `**Why:** ${why}`,
    `[Read more](${page(script.cut)}): ${contents}.`,
    `<sub>Star Catch · built from \`${headSha.slice(0, 7)}\`</sub>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
