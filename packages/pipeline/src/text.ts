import type { PullRequestSnapshot, Sentence } from "@kiasm-tech/star-catch-contracts";

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
/** A sentence ends at `.`, `!` or `?` before a space and a capital, digit, quote or bracket. */
const BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9"'“‘([])/;
/** Merge commits say nothing about the change. */
const MERGE = /^Merge (branch|pull request|remote-tracking branch) /;
/** As written ("10%", "1,000", "4.99"); not a `#921` reference or the 8 in `v8`. */
const NUMBER = /(?<![\w#.,])\d+(?:[.,]\d+)*%?(?![\w])/g;

/** Inline code spans become placeholders while splitting, so their dots don't end sentences. */
function protectCode(text: string): { text: string; restore: (s: string) => string } {
  const spans: string[] = [];
  const masked = text.replace(/`[^`\n]+`/g, (span) => `\uE000${spans.push(span) - 1}\uE000`);
  return { text: masked, restore: (s) => s.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => spans[Number(i)]) };
}

/** Paragraphs and bullet items of Markdown-ish text, without fenced code, headings' marks or HTML comments. */
function blocks(markdown: string): string[] {
  const out: string[] = [];
  let paragraph: string[] = [];
  let fenced = false;
  const flush = () => {
    if (paragraph.length > 0) out.push(paragraph.join(" "));
    paragraph = [];
  };
  // GitHub bodies often have CRLF line endings, and `.` doesn't match `\r`.
  for (const line of markdown.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      flush();
      continue;
    }
    if (fenced) continue;
    const bullet = BULLET.exec(line);
    const heading = HEADING.exec(line);
    if (line.trim() === "") flush();
    else if (bullet || heading) {
      flush();
      out.push((bullet ?? heading)![1]);
    } else paragraph.push(line.trim());
  }
  flush();
  return out;
}

/** Sentences of a text, in order; code spans intact. */
export function splitSentences(markdown: string): string[] {
  return blocks(markdown).flatMap((block) => {
    const { text, restore } = protectCode(block.replace(/\s+/g, " ").trim());
    return text
      .split(BOUNDARY)
      .map((s) => restore(s).trim())
      .filter((s) => s !== "");
  });
}

export function numbersIn(sentence: string): string[] {
  return sentence.replace(/`[^`]+`/g, " ").match(NUMBER) ?? [];
}

function sentencesFrom(origin: Sentence["origin"], texts: string[]): Sentence[] {
  return texts.map((text, index) => ({ id: `${origin}:${index}`, origin, text, numbers: numbersIn(text) }));
}

/**
 * The text lane (pr-analysis.md step A): the description, linked issues (title, then body) and
 * commit subjects as sentences with ids `${origin}:${index}`. Classes come from the classifier.
 */
export function sentencesOf(snapshot: PullRequestSnapshot): Sentence[] {
  return [
    ...sentencesFrom("description", splitSentences(snapshot.body ?? "")),
    ...snapshot.linkedIssues.flatMap((issue) =>
      sentencesFrom(`issue#${issue.number}`, [...splitSentences(issue.title), ...splitSentences(issue.body ?? "")]),
    ),
    ...snapshot.commits.flatMap((commit) => {
      const subject = commit.message.split("\n")[0].trim();
      return subject === "" || MERGE.test(subject) ? [] : sentencesFrom(`commit:${commit.sha}`, [subject]);
    }),
  ];
}
