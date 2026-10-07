import { CatchVersionSchema, catchIdOf } from "@kiasm-tech/star-catch-contracts";
import { PrStateJobSchema } from "../jobs/queues.js";
import type { CatchStore } from "../ports/catch-store.js";

export type PrStateOutcome = "updated" | "no-catch" | "invalid";

/**
 * A merged or closed PR's latest catch, with its new state and without the draft-only appendix.
 * The content stays as it was: an update says the same before and after merge.
 */
export async function updatePrState({ catches }: { catches: CatchStore }, data: unknown): Promise<PrStateOutcome> {
  const parsed = PrStateJobSchema.safeParse(data);
  if (!parsed.success) return "invalid";
  const job = parsed.data;
  const stored = await catches.latest(catchIdOf(job.fullName, job.number));
  if (!stored) return "no-catch";
  const version = CatchVersionSchema.parse(stored.version);
  const settled = (script: typeof version.technical) => script && { ...script, draft: [] };
  await catches.save(
    { ...version, pr: { ...version.pr, state: job.state, updatedAt: job.at }, technical: settled(version.technical), business: settled(version.business) },
    stored.headSha,
  );
  return "updated";
}
