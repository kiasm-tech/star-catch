import type { PullRequestSnapshot } from "@kiasm-tech/star-catch-contracts";
import { z } from "zod";
import type { PullRequestRef } from "../ports/pull-request-source.js";

/** Installation id written into recorded payloads; recordings never belong to a real installation. */
export const FIXTURE_INSTALLATION_ID = 1;

/** The part of GitHub's `pull_request.opened` payload Star Catch reads. */
export const OpenedWebhookSchema = z.object({
  action: z.literal("opened"),
  number: z.number().int().positive(),
  installation: z.object({ id: z.number().int() }),
  repository: z.object({
    full_name: z.string(),
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    user: z.object({ login: z.string().nullable() }),
    head: z.object({ sha: z.string(), ref: z.string() }),
    base: z.object({ sha: z.string(), ref: z.string() }),
  }),
  sender: z.object({ login: z.string().nullable(), type: z.string() }),
});

export type OpenedWebhook = z.infer<typeof OpenedWebhookSchema>;

export function fixtureId(ref: PullRequestRef): string {
  const [owner, repo] = ref.fullName.split("/");
  return `${owner}__${repo}__${ref.number}`.toLowerCase();
}

export function openedWebhook(snapshot: PullRequestSnapshot): OpenedWebhook {
  const [owner = "", repo = ""] = snapshot.fullName.split("/");
  return {
    action: "opened",
    number: snapshot.number,
    installation: { id: FIXTURE_INSTALLATION_ID },
    repository: { full_name: snapshot.fullName, name: repo, owner: { login: owner } },
    pull_request: {
      number: snapshot.number,
      title: snapshot.title,
      user: { login: snapshot.author },
      head: { sha: snapshot.headSha, ref: snapshot.headRef },
      base: { sha: snapshot.baseSha, ref: snapshot.baseRef },
    },
    sender: { login: snapshot.author, type: "User" },
  };
}
