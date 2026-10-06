import type { PullRequestRef } from "./pull-request-source.js";

export type CommentWrite = "created" | "updated" | "unchanged";

/** The GitHub App's own comments on a pull request, found again by a hidden marker. */
export interface PullRequestComments {
  /** Edits the app's comment that carries `marker`, else creates one. */
  upsert(ref: PullRequestRef & { installationId: number }, marker: string, body: string): Promise<CommentWrite>;
}
