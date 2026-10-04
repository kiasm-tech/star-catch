/** Jobs between the backend and Crux, on the pg-boss queue both share (schema pgboss). */
import { z } from "zod";

/** Both services must run this pg-boss major: they share its tables. */
export const PG_BOSS_MAJOR = 12;

/** Installation, member, team, membership, organization and repository deliveries, for Crux. */
export const CRUX_GITHUB_EVENT = "crux.github-event";

export const CruxGitHubEventSchema = z.object({
  /** X-GitHub-Delivery */
  deliveryId: z.string().min(1),
  /** X-GitHub-Event */
  event: z.string().min(1),
  /** The payload as GitHub sent it; the signature was checked by the backend. */
  payload: z.record(z.string(), z.unknown()),
});

export type CruxGitHubEvent = z.infer<typeof CruxGitHubEventSchema>;
