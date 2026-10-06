import type { CommentWrite, PullRequestComments, PullRequestRef } from "@star-catch/pipeline";

export interface StoredComment {
  fullName: string;
  number: number;
  body: string;
}

/** Keeps comments in memory, so a run can be checked without GitHub. */
export class MemoryPullRequestComments implements PullRequestComments {
  readonly comments: StoredComment[] = [];

  async upsert({ fullName, number }: PullRequestRef, marker: string, body: string): Promise<CommentWrite> {
    const ours = this.comments.find((c) => c.fullName === fullName && c.number === number && c.body.includes(marker));
    if (!ours) {
      this.comments.push({ fullName, number, body });
      return "created";
    }
    if (ours.body === body) return "unchanged";
    ours.body = body;
    return "updated";
  }
}
