/** Everything Star Catch needs to know about one pull request, captured once at a head commit. */
import { z } from "zod";

// Caps keep a snapshot small enough to store as one row and send as one job.
export const SNAPSHOT_LIMITS = {
  files: 300,
  contentFiles: 80,
  contentChars: 250_000,
  patchChars: 350_000,
  commits: 100,
  commitMessageChars: 1_000,
  linkedIssues: 5,
  issueBodyChars: 8_000,
  bodyChars: 20_000,
  /** File paths kept from the head commit's tree: enough to see a repository's parts. */
  treePaths: 20_000,
} as const;

/** Files by extension that are never text: the snapshot skips their contents, analysis excludes them. */
export const BINARY_EXTENSION_PATTERN =
  /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tgz|tar|7z|mp3|mp4|mov|wav|woff2?|ttf|otf|eot|wasm|jar|exe|dll|so|dylib|bin|lockb)$/i;

/** Lockfiles: the snapshot skips their contents, analysis excludes them. */
export const LOCKFILE_PATTERN =
  /(^|\/)(pnpm-lock\.yaml|bun\.lockb?|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|Gemfile\.lock|composer\.lock|pubspec\.lock|Podfile\.lock|Package\.resolved|packages\.lock\.json|gradle\.lockfile|mix\.lock|flake\.lock)$/;

export const CI_CONCLUSIONS = ["success", "failure", "pending", "none"] as const;

export const PullRequestSnapshotFileSchema = z.object({
  filename: z.string(),
  previousFilename: z.string().optional(),
  status: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  patch: z.string().optional(),
  baseContent: z.string().optional(),
  headContent: z.string().optional(),
});

export const PullRequestSnapshotSchema = z.object({
  fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  number: z.number().int().positive(),
  url: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  author: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean(),
  baseRef: z.string(),
  headRef: z.string(),
  baseSha: z.string().min(7),
  headSha: z.string().min(7),
  createdAt: z.string(),
  updatedAt: z.string(),
  labels: z.array(z.string()),
  installationId: z.number().int().nullable(),
  fetchedAt: z.string(),
  /** Some patches, contents or list entries were dropped to fit the limits. */
  truncated: z.boolean(),
  files: z.array(PullRequestSnapshotFileSchema),
  commits: z.array(z.object({ sha: z.string(), message: z.string() })),
  linkedIssues: z.array(
    z.object({
      number: z.number().int().positive(),
      title: z.string(),
      body: z.string().nullable(),
    }),
  ),
  ciConclusion: z.enum(CI_CONCLUSIONS),
  /** Every file path at the head commit (not their contents), for the parts around the change. */
  tree: z.object({ paths: z.array(z.string()).max(SNAPSHOT_LIMITS.treePaths), truncated: z.boolean() }).optional(),
});

export type PullRequestSnapshot = z.infer<typeof PullRequestSnapshotSchema>;
export type PullRequestSnapshotFile = z.infer<typeof PullRequestSnapshotFileSchema>;

const LINK_KEYWORD =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;

/**
 * Issue numbers a PR body says it closes, in order of first mention. Only
 * same-repo references (`closes #12`); cross-repo ones (`org/repo#12`) never
 * match because the keyword must be followed directly by `#`.
 */
export function parseLinkedIssueNumbers(body: string | null): number[] {
  if (!body) return [];
  const numbers: number[] = [];
  for (const match of body.matchAll(LINK_KEYWORD)) {
    const n = Number(match[1]);
    if (n > 0 && !numbers.includes(n)) numbers.push(n);
  }
  return numbers;
}

/** Lower-cased "owner/repo" — GitHub names are case-insensitive. */
export function repoKey(fullName: string): string {
  return fullName.trim().toLowerCase();
}

/** Storage id for a snapshot: one per repo and head commit. */
export function snapshotDocId(fullName: string, headSha: string): string {
  const [owner, repo] = repoKey(fullName).split("/");
  return `${owner}__${repo}__${headSha}`;
}

export function latestSnapshot(snapshots: PullRequestSnapshot[]): PullRequestSnapshot | null {
  return snapshots.reduce<PullRequestSnapshot | null>(
    (latest, s) => (!latest || s.fetchedAt > latest.fetchedAt ? s : latest),
    null,
  );
}
