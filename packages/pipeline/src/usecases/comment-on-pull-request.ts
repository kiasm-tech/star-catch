import { CatchVersionSchema, catchIdOf } from "@kiasm-tech/star-catch-contracts";
import { COMMENT_MARKER, commentBody } from "../comment/body.js";
import { CommentJobSchema } from "../jobs/queues.js";
import type { CatchStore } from "../ports/catch-store.js";
import type { CommentWrite, PullRequestComments } from "../ports/pull-request-comments.js";
import type { RepoSettings } from "../ports/repo-settings.js";

export type CommentOutcome = CommentWrite | "repo-disabled" | "no-catch" | "no-video" | "invalid";

export interface CommentDeps {
  settings: RepoSettings;
  catches: Pick<CatchStore, "latest">;
  comments: PullRequestComments;
  /** Crux's origin; the comment links to the catch's page there. */
  cruxUrl: string;
}

/** Puts the PR's latest catch in the app's comment on it: created the first time, edited after. */
export async function commentOnPullRequest({ settings, catches, comments, cruxUrl }: CommentDeps, data: unknown): Promise<CommentOutcome> {
  const parsed = CommentJobSchema.safeParse(data);
  if (!parsed.success) return "invalid";
  const job = parsed.data;
  if (!(await settings.isEnabled(job.fullName))) return "repo-disabled";

  // The latest, not the job's commit: a newer run may have saved since.
  const stored = await catches.latest(catchIdOf(job.fullName, job.number));
  if (stored === null) return "no-catch";
  const body = commentBody(CatchVersionSchema.parse(stored.version), { cruxUrl, headSha: stored.headSha });
  if (body === null) return "no-video";
  return comments.upsert({ fullName: job.fullName, number: job.number, installationId: job.installationId }, COMMENT_MARKER, body);
}
