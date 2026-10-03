import { numbered, type Section } from "./sections.js";

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

interface Heading {
  /** 0-based line the section starts on: the heading, or the text a setext underline belongs to. */
  start: number;
  level: number;
  title: string;
}

/** ATX (`## Title`) and setext (underlined) headings, outside fenced code and front matter. */
function headingsOf(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let i = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, at) => at > 0 && line.trim() === "---");
    i = close < 0 ? lines.length : close + 1;
  }
  let fence: string | null = null;
  let paragraph = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const close = FENCE.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length && line.trim() === close) fence = null;
      continue;
    }
    const open = FENCE.exec(line)?.[1];
    const atx = ATX.exec(line);
    const setext = SETEXT.exec(line);
    if (open) {
      fence = open;
      paragraph = false;
    } else if (atx) {
      headings.push({ start: i, level: atx[1].length, title: (atx[2] ?? "").trim() });
      paragraph = false;
    } else if (setext && paragraph) {
      headings.push({ start: i - 1, level: setext[1][0] === "=" ? 1 : 2, title: lines[i - 1].trim() });
      paragraph = false;
    } else {
      paragraph = line.trim() !== "";
    }
  }
  return headings;
}

/** Trimmed lines without blank ones, with runs of spaces as one: what a section says. */
const normalise = (lines: string[]) =>
  lines
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter((line) => line !== "")
    .join("\n");

/** One section per heading path (`Install > macOS`); text before the first heading is `(intro)`. */
export function markdownSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const headings = headingsOf(lines);
  const sections: Section[] = [];
  const add = (name: string, from: number, to: number) => {
    let last = to - 1;
    while (last >= from && lines[last].trim() === "") last--;
    if (last < from) return;
    const own = lines.slice(from, last + 1);
    sections.push({ name, unitKind: "docSection", value: normalise(own), text: own.join("\n"), lines: [from + 1, last + 1] });
  };
  add("(intro)", 0, headings[0]?.start ?? lines.length);
  const path: Heading[] = [];
  headings.forEach((heading, k) => {
    while (path.length > 0 && path[path.length - 1].level >= heading.level) path.pop();
    path.push(heading);
    add(path.map((h) => h.title).join(" > "), heading.start, headings[k + 1]?.start ?? lines.length);
  });
  return numbered(sections);
}
