/** A PR's change by the numbers, for the title card: what the size is made of, and who made it. */
import {
  parseLinkedIssueNumbers,
  type ChangeStats,
  type Context,
  type FILE_KINDS,
  type PullRequestSnapshot,
  type Quality,
  type SIZE_CLASSES,
} from "@kiasm-tech/star-catch-contracts";
import { triage, type FileClass } from "@star-catch/changes";

type Kind = (typeof FILE_KINDS)[number];

const KIND_OF: Partial<Record<FileClass, Kind>> = { test: "tests", schema: "migrations", docs: "docs", config: "config", manifest: "config", buildCi: "config" };

/** A file's kind, by the analysis's own classes; anything it doesn't set apart is code. */
export function kindOf(path: string): Kind {
  const t = triage({ path });
  return ("fileClass" in t && KIND_OF[t.fileClass]) || "code";
}

const STATUS: Record<string, keyof ChangeStats["files"]> = { added: "added", removed: "removed", renamed: "renamed" };

/** `counted` are the files the size counts: lockfiles, generated and vendored files already left out. */
export function changeStatsOf(pr: PullRequestSnapshot, counted: PullRequestSnapshot["files"], context?: QualityContext): ChangeStats {
  const files = { added: 0, modified: 0, removed: 0, renamed: 0 };
  for (const f of counted) files[STATUS[f.status] ?? "modified"]++;

  const kinds = new Map<Kind, { additions: number; deletions: number }>();
  for (const f of counted) {
    const k = kinds.get(kindOf(f.filename)) ?? { additions: 0, deletions: 0 };
    kinds.set(kindOf(f.filename), { additions: k.additions + f.additions, deletions: k.deletions + f.deletions });
  }
  const largest = counted.reduce<PullRequestSnapshot["files"][number] | undefined>((a, f) => (!a || f.additions + f.deletions > a.additions + a.deletions ? f : a), undefined);

  const byAuthor = new Map<string, number>();
  for (const c of pr.commits) if (c.author) byAuthor.set(c.author, (byAuthor.get(c.author) ?? 0) + 1);

  return {
    files,
    kinds: [...kinds]
      .filter(([, n]) => n.additions + n.deletions > 0)
      .sort((a, b) => b[1].additions + b[1].deletions - (a[1].additions + a[1].deletions))
      .map(([kind, n]) => ({ kind, ...n })),
    ...(largest && largest.additions + largest.deletions > 0 && { largest: { file: largest.filename, additions: largest.additions, deletions: largest.deletions } }),
    commits: pr.commits.length,
    contributors: [...byAuthor]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([login, commits]) => ({ login, commits })),
    labels: pr.labels.slice(0, 8),
    closes: parseLinkedIssueNumbers(pr.body).slice(0, 5),
    ...(context && { quality: qualityOf(pr, counted, context) }),
  };
}

/** The parts of the analysis the quality reads. */
export type QualityContext = Pick<Context, "units" | "links" | "sentences">;

const SIZES: { below: number; size: (typeof SIZE_CLASSES)[number]; points: number }[] = [
  { below: 50, size: "XS", points: 15 },
  { below: 200, size: "S", points: 15 },
  { below: 500, size: "M", points: 12 },
  { below: 1000, size: "L", points: 7 },
  { below: Infinity, size: "XL", points: 2 },
];
/** Kinds of change a test is expected to cover. */
const TESTABLE = new Set(["logic", "interface", "data", "ui"]);
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?: \S/;
const FIXUP = /^(fixup!|squash!|amend!|wip\b)/i;
const DESCRIPTION_WORDS = 40;

/**
 * Fixed rules, so the same PR always gets the same score: tests 30, risk 20, size 15, focus 10,
 * context 15, commits 10. A ≥ 85, B ≥ 70, C ≥ 55, D below.
 */
export function qualityOf(pr: PullRequestSnapshot, counted: PullRequestSnapshot["files"], { units, links, sentences }: QualityContext): Quality {
  const lines = counted.reduce((n, f) => n + f.additions + f.deletions, 0);
  const size = SIZES.find((s) => lines < s.below)!;

  const changed = units.filter((u) => u.verdict !== "notAChange");
  const testable = changed.filter((u) => u.verdict === "behavioural" && TESTABLE.has(u.labels?.kind ?? (kindOf(u.file) === "code" ? "logic" : "test")));
  const tests = new Set(changed.filter((u) => u.labels?.kind === "test" || kindOf(u.file) === "tests").map((u) => u.id));
  const covered = new Set(links.filter((l) => l.type === "covers" && tests.has(l.from)).map((l) => l.to));
  const coverage = testable.length ? { tested: testable.filter((u) => covered.has(u.id)).length, testable: testable.length } : null;

  const linesOf = (kind: string) => counted.filter((f) => kindOf(f.filename) === kind).reduce((n, f) => n + f.additions, 0);
  const code = linesOf("code");
  const testRatio = code ? Math.round((linesOf("tests") / code) * 100) / 100 : null;

  const parts = new Set(changed.map((u) => u.component).filter(Boolean)).size;
  const level = parts <= 2 ? "focused" : parts <= 4 ? "moderate" : "spread";
  const largest = Math.max(0, ...counted.map((f) => f.additions + f.deletions));
  const largestShare = lines ? Math.round((largest / lines) * 100) / 100 : null;

  const words = (pr.body ?? "").split(/\s+/).filter(Boolean).length;
  const why = sentences.some((x) => x.class === "problem" || x.class === "rationale");
  const issue = pr.linkedIssues.length > 0 || parseLinkedIssueNumbers(pr.body).length > 0;

  const firstLines = pr.commits.map((c) => c.message.split("\n")[0]!.trim());
  const commits = { total: firstLines.length, conventional: firstLines.filter((m) => CONVENTIONAL.test(m)).length, fixups: firstLines.filter((m) => FIXUP.test(m)).length };

  const breaking = { count: changed.filter((u) => u.labels?.risks.includes("breaking")).length, docs: counted.some((f) => kindOf(f.filename) === "docs") };
  const migration = changed.some((u) => u.labels?.risks.includes("dataMigration"));

  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));
  const areas: Quality["areas"] = [
    { area: "tests", max: 30, points: clamp(coverage ? (30 * coverage.tested) / coverage.testable : 30, 30) },
    { area: "risk", max: 20, points: clamp(20 - breaking.count * (breaking.docs ? 4 : 8) - (migration ? 4 : 0), 20) },
    { area: "size", max: 15, points: size.points },
    { area: "focus", max: 10, points: clamp({ focused: 10, moderate: 7, spread: 4 }[level] - (largestShare !== null && largestShare > 0.6 && counted.length > 1 ? 2 : 0), 10) },
    { area: "context", max: 15, points: (words >= DESCRIPTION_WORDS ? 5 : 0) + (why ? 5 : 0) + (issue ? 5 : 0) },
    { area: "commits", max: 10, points: clamp(commits.total ? (10 * commits.conventional) / commits.total - 3 * commits.fixups : 10, 10) },
  ];
  const score = areas.reduce((n, a) => n + a.points, 0);
  return {
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D",
    areas,
    sizeClass: size.size,
    coverage,
    testRatio,
    focus: { parts, level },
    largestShare,
    description: { words, why, issue },
    commits,
    breaking,
  };
}
