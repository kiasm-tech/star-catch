/** A PR's change by the numbers, for the title card: what the size is made of, and who made it. */
import { parseLinkedIssueNumbers, type ChangeStats, type FILE_KINDS, type PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
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
export function changeStatsOf(pr: PullRequestSnapshot, counted: PullRequestSnapshot["files"]): ChangeStats {
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
  };
}
