import type { FixtureWriter } from "../ports/fixtures.js";
import type { PullRequestRef, PullRequestSource } from "../ports/pull-request-source.js";
import { fixtureId, openedWebhook } from "../fixtures/webhook.js";

export interface RecordedPullRequest {
  id: string;
  files: number;
  commits: number;
  truncated: boolean;
}

/** Snapshots each pull request and stores it with a matching `pull_request.opened` payload. */
export async function recordPullRequests(
  deps: { source: PullRequestSource; writer: FixtureWriter },
  refs: PullRequestRef[],
): Promise<RecordedPullRequest[]> {
  const recorded: RecordedPullRequest[] = [];
  for (const ref of refs) {
    const snapshot = await deps.source.snapshot(ref);
    const id = fixtureId(ref);
    await deps.writer.saveRecording({ id, snapshot, webhook: openedWebhook(snapshot) });
    recorded.push({
      id,
      files: snapshot.files.length,
      commits: snapshot.commits.length,
      truncated: snapshot.truncated,
    });
  }
  return recorded;
}
