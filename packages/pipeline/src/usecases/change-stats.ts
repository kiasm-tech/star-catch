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
export type QualityContext = Pick<Context, "units" | "sentences">;

const SIZES: { below: number; size: (typeof SIZE_CLASSES)[number]; points: number }[] = [
  { below: 50, size: "XS", points: 25 },
  { below: 200, size: "S", points: 25 },
  { below: 500, size: "M", points: 20 },
  { below: 1000, size: "L", points: 12 },
  { below: Infinity, size: "XL", points: 4 },
];
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?: \S/;
const FIXUP = /^(fixup!|squash!|amend!|wip\b)/i;
const DESCRIPTION_WORDS = 40;

/**
 * Fixed rules about the PR itself, so the same PR always gets the same score: context 35, size 25,
 * focus 20, commits 20. A ≥ 85, B ≥ 70, C ≥ 55, D below.
 */
export function qualityOf(pr: PullRequestSnapshot, counted: PullRequestSnapshot["files"], { units, sentences }: QualityContext): Quality {
  const lines = counted.reduce((n, f) => n + f.additions + f.deletions, 0);
  const size = SIZES.find((s) => lines < s.below)!;

  const changed = units.filter((u) => u.verdict !== "notAChange");
  const parts = new Set(changed.map((u) => u.component).filter(Boolean)).size;
  const level = parts <= 2 ? "focused" : parts <= 4 ? "moderate" : "spread";
  const largest = Math.max(0, ...counted.map((f) => f.additions + f.deletions));
  const largestShare = lines ? Math.round((largest / lines) * 100) / 100 : null;

  const words = (pr.body ?? "").split(/\s+/).filter(Boolean).length;
  const why = sentences.some((x) => x.class === "problem" || x.class === "rationale");
  const issue = pr.linkedIssues.length > 0 || parseLinkedIssueNumbers(pr.body).length > 0;

  const firstLines = pr.commits.map((c) => c.message.split("\n")[0]!.trim());
  const commits = { total: firstLines.length, conventional: firstLines.filter((m) => CONVENTIONAL.test(m)).length, fixups: firstLines.filter((m) => FIXUP.test(m)).length };

  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));
  const areas: Quality["areas"] = [
    { area: "context", max: 35, points: (words >= DESCRIPTION_WORDS ? 15 : 0) + (why ? 10 : 0) + (issue ? 10 : 0) },
    { area: "size", max: 25, points: size.points },
    { area: "focus", max: 20, points: clamp({ focused: 20, moderate: 14, spread: 8 }[level] - (largestShare !== null && largestShare > 0.6 && counted.length > 1 ? 4 : 0), 20) },
    { area: "commits", max: 20, points: clamp(commits.total ? (20 * commits.conventional) / commits.total - 5 * commits.fixups : 20, 20) },
  ];
  const score = areas.reduce((n, a) => n + a.points, 0);
  return {
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D",
    areas,
    sizeClass: size.size,
    focus: { parts, level },
    largestShare,
    description: { words, why, issue },
    commits,
  };
}
