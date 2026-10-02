import { recordPullRequests, type PullRequestRef } from "@star-catch/pipeline";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";

export const recordUsage = "record <owner/repo> <number> [<number> …]   snapshot pull requests as fixtures";

export async function record(args: string[], services: Services, io: Io): Promise<number> {
  const [fullName, ...numbers] = args;
  if (!fullName || !/^[^/\s]+\/[^/\s]+$/.test(fullName) || numbers.length === 0) {
    throw new UsageError(`Usage: ${recordUsage}`);
  }
  const refs: PullRequestRef[] = numbers.map((raw) => {
    const number = Number(raw);
    if (!Number.isInteger(number) || number <= 0) throw new UsageError(`Not a pull request number: ${raw}`);
    return { fullName, number };
  });
  const recorded = await recordPullRequests(
    { source: services.pullRequests(), writer: services.fixtures },
    refs,
  );
  for (const r of recorded) {
    io.out(`${r.id}: ${r.files} files, ${r.commits} commits${r.truncated ? ", truncated" : ""}`);
  }
  return 0;
}
