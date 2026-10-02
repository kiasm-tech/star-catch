import { z } from "zod";
import { CRUX_GITHUB_EVENT_QUEUE, INGEST_QUEUE, ingestKey, type IngestJob } from "../jobs/queues.js";

/** The events Crux's access handlers take (githubWebhook.ts). */
const CRUX_EVENTS = new Set([
  "installation",
  "installation_repositories",
  "installation_target",
  "member",
  "team",
  "membership",
  "organization",
  "repository",
]);

/** synchronize, closed and issue_comment wait for the tasks that handle them. */
const INGEST_ACTIONS = new Set(["opened", "reopened", "ready_for_review"]);

const PullRequestDeliverySchema = z.object({
  action: z.string(),
  installation: z.object({ id: z.number().int() }),
  repository: z.object({ full_name: z.string() }),
  pull_request: z.object({
    number: z.number().int().positive(),
    // Recorded fixture payloads are trimmed and leave these two out.
    draft: z.boolean().default(false),
    user: z.object({ login: z.string().nullable(), type: z.string().default("User") }),
    head: z.object({ sha: z.string() }),
  }),
});

export interface Route {
  queue: string;
  data: object;
  singletonKey?: string;
}

/** Where a delivery goes, or null when it is only stored. */
export function routeDelivery(deliveryId: string, event: string, payload: Record<string, unknown>): Route | null {
  if (CRUX_EVENTS.has(event)) {
    return { queue: CRUX_GITHUB_EVENT_QUEUE.name, data: { deliveryId, event, payload } };
  }
  if (event !== "pull_request") return null;
  const parsed = PullRequestDeliverySchema.safeParse(payload);
  if (!parsed.success || !INGEST_ACTIONS.has(parsed.data.action)) return null;
  const { installation, repository, pull_request: pr } = parsed.data;
  const job: IngestJob = {
    deliveryId,
    fullName: repository.full_name,
    number: pr.number,
    headSha: pr.head.sha,
    installationId: installation.id,
    draft: pr.draft,
    // GitHub reports deleted accounts as null.
    author: { login: pr.user.login ?? "ghost", type: pr.user.type },
  };
  return { queue: INGEST_QUEUE.name, data: job, singletonKey: ingestKey(job) };
}
