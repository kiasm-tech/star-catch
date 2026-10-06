/** Builds a pull request snapshot from the GitHub API, translating GitHub's shapes into the contract's. */
import type { Octokit } from "@octokit/rest";
import {
  BINARY_EXTENSION_PATTERN,
  LOCKFILE_PATTERN,
  parseLinkedIssueNumbers,
  PullRequestSnapshotSchema,
  SNAPSHOT_LIMITS as LIMITS,
  type PullRequestSnapshot,
  type PullRequestSnapshotFile,
} from "@kiasm-tech/star-catch-contracts";

// Every call is bounded: one stuck request must not stall the whole snapshot.
const REQUEST_TIMEOUT_MS = 10_000;
const PAGINATION_TIMEOUT_MS = 20_000;
// File versions per GraphQL query; keeps each response well under GitHub's limits.
const BLOBS_PER_QUERY = 40;
const PARALLEL_QUERIES = 4;


const FAILED_CONCLUSIONS = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "startup_failure",
]);

/** Every file path at a commit, for the parts around the change; missing when GitHub can't say. */
async function readTree(gh: Octokit, owner: string, repo: string, sha: string): Promise<PullRequestSnapshot["tree"]> {
  try {
    const { data } = await gh.git.getTree({ owner, repo, tree_sha: sha, recursive: "1", ...timeout() });
    const paths = data.tree.filter((entry) => entry.type === "blob" && entry.path).map((entry) => entry.path!);
    return { paths: paths.slice(0, LIMITS.treePaths), truncated: data.truncated || paths.length > LIMITS.treePaths };
  } catch {
    return undefined;
  }
}

function splitFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}

function clip(text: string | null | undefined, max: number): string | null {
  if (text == null) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function timeout(ms = REQUEST_TIMEOUT_MS) {
  return { request: { signal: AbortSignal.timeout(ms) } };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface BlobResult {
  text: string | null;
  isBinary: boolean | null;
  isTruncated: boolean;
}

/**
 * Text of many files at given commits, in a few GraphQL queries instead of one
 * REST call per file version. Missing, binary or oversized blobs come back
 * undefined; `failed` reports a batch that errored or timed out.
 */
async function readBlobs(
  gh: Octokit,
  owner: string,
  repo: string,
  expressions: string[],
): Promise<{ texts: (string | undefined)[]; failed: boolean }> {
  const texts = new Array<string | undefined>(expressions.length);
  let failed = false;
  const starts: number[] = [];
  for (let start = 0; start < expressions.length; start += BLOBS_PER_QUERY) starts.push(start);

  await mapLimit(starts, PARALLEL_QUERIES, async (start) => {
    const batch = expressions.slice(start, start + BLOBS_PER_QUERY);
    const vars = batch.map((_, i) => `$e${i}: String!`).join(", ");
    const fields = batch
      .map((_, i) => `f${i}: object(expression: $e${i}) { ... on Blob { text isBinary isTruncated } }`)
      .join("\n");
    const variables = Object.fromEntries(batch.map((e, i) => [`e${i}`, e]));

    try {
      const data = await gh.graphql<{ repository: Record<string, BlobResult | null> }>(
        `query($owner: String!, $repo: String!, ${vars}) {
          repository(owner: $owner, name: $repo) { ${fields} }
        }`,
        { owner, repo, ...variables, ...timeout() },
      );
      batch.forEach((_, i) => {
        const blob = data.repository[`f${i}`];
        if (blob?.text != null && !blob.isBinary && !blob.isTruncated) {
          texts[start + i] = blob.text;
        }
      });
    } catch {
      failed = true;
    }
  });

  return { texts, failed };
}

async function readLinkedIssues(gh: Octokit, owner: string, repo: string, body: string | null) {
  const issues = await mapLimit(
    parseLinkedIssueNumbers(body).slice(0, LIMITS.linkedIssues),
    LIMITS.linkedIssues,
    async (issueNumber) => {
      try {
        const { data } = await gh.issues.get({
          owner,
          repo,
          issue_number: issueNumber,
          ...timeout(),
        });
        return {
          number: issueNumber,
          title: data.title,
          body: clip(data.body, LIMITS.issueBodyChars),
        };
      } catch {
        return null;
      }
    },
  );
  return issues.filter((i) => i !== null);
}

async function readCiConclusion(
  gh: Octokit,
  owner: string,
  repo: string,
  headSha: string,
): Promise<PullRequestSnapshot["ciConclusion"]> {
  try {
    const { data } = await gh.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      per_page: 100,
      ...timeout(),
    });
    return reduceChecks(data.check_runs);
  } catch {
    // No access to checks on this repo, or it timed out.
    return "none";
  }
}

function reduceChecks(runs: { status: string; conclusion: string | null }[]) {
  if (runs.length === 0) return "none" as const;
  if (runs.some((r) => r.status !== "completed")) return "pending" as const;
  if (runs.some((r) => r.conclusion && FAILED_CONCLUSIONS.has(r.conclusion))) {
    return "failure" as const;
  }
  return "success" as const;
}

export async function fetchPullRequestSnapshot(
  gh: Octokit,
  fullName: string,
  number: number,
  installationId: number | null,
): Promise<PullRequestSnapshot> {
  const { owner, repo } = splitFullName(fullName);
  let truncated = false;

  const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: number, ...timeout() });
  const baseSha = pr.base.sha;
  const headSha = pr.head.sha;

  const [rawFiles, rawCommits] = await Promise.all([
    gh.paginate(gh.pulls.listFiles, {
      owner,
      repo,
      pull_number: number,
      per_page: 100,
      ...timeout(PAGINATION_TIMEOUT_MS),
    }),
    gh.paginate(gh.pulls.listCommits, {
      owner,
      repo,
      pull_number: number,
      per_page: 100,
      ...timeout(PAGINATION_TIMEOUT_MS),
    }),
  ]);

  if (rawFiles.length > LIMITS.files) truncated = true;
  const listed = rawFiles.slice(0, LIMITS.files);

  // Patches, in order, until the budget runs out.
  let patchChars = 0;
  const files: PullRequestSnapshotFile[] = listed.map((f) => {
    const file: PullRequestSnapshotFile = {
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    };
    if (f.previous_filename) file.previousFilename = f.previous_filename;
    if (f.patch) {
      if (patchChars + f.patch.length <= LIMITS.patchChars) {
        file.patch = f.patch;
        patchChars += f.patch.length;
      } else {
        truncated = true;
      }
    }
    return file;
  });

  // Base and head contents of text files, fetched together, then kept in order
  // until the budget runs out.
  const eligible = files.filter(
    (f) => !BINARY_EXTENSION_PATTERN.test(f.filename) && !LOCKFILE_PATTERN.test(f.filename),
  );
  if (eligible.length > LIMITS.contentFiles) truncated = true;
  const toRead = eligible.slice(0, LIMITS.contentFiles);

  const wanted: { file: PullRequestSnapshotFile; side: "base" | "head"; expression: string }[] = [];
  for (const file of toRead) {
    if (file.status !== "added") {
      wanted.push({
        file,
        side: "base",
        expression: `${baseSha}:${file.previousFilename ?? file.filename}`,
      });
    }
    if (file.status !== "removed") {
      wanted.push({ file, side: "head", expression: `${headSha}:${file.filename}` });
    }
  }
  const [blobs, linkedIssues, ciConclusion, tree] = await Promise.all([
    readBlobs(gh, owner, repo, wanted.map((w) => w.expression)),
    readLinkedIssues(gh, owner, repo, pr.body ?? null),
    readCiConclusion(gh, owner, repo, headSha),
    readTree(gh, owner, repo, headSha),
  ]);
  if (blobs.failed) truncated = true;

  const byFile = new Map<PullRequestSnapshotFile, { base?: string; head?: string }>();
  wanted.forEach((w, i) => {
    const entry = byFile.get(w.file) ?? {};
    entry[w.side] = blobs.texts[i];
    byFile.set(w.file, entry);
  });

  let contentChars = 0;
  for (const file of toRead) {
    const { base, head } = byFile.get(file) ?? {};
    const size = (base?.length ?? 0) + (head?.length ?? 0);
    if (contentChars + size > LIMITS.contentChars) {
      truncated = true;
      continue;
    }
    if (base !== undefined) file.baseContent = base;
    if (head !== undefined) file.headContent = head;
    contentChars += size;
  }

  if (rawCommits.length > LIMITS.commits) truncated = true;

  return PullRequestSnapshotSchema.parse({
    fullName: `${owner}/${repo}`,
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    body: clip(pr.body, LIMITS.bodyChars),
    author: pr.user?.login ?? null,
    state: pr.state,
    merged: pr.merged_at != null,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    baseSha,
    headSha,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    labels: pr.labels.map((l) => l.name ?? "").filter(Boolean),
    installationId,
    fetchedAt: new Date().toISOString(),
    truncated,
    files,
    commits: rawCommits.slice(0, LIMITS.commits).map((c) => ({
      sha: c.sha,
      message: clip(c.commit.message, LIMITS.commitMessageChars) ?? "",
    })),
    linkedIssues,
    ciConclusion,
    ...(tree && { tree }),
  });
}
