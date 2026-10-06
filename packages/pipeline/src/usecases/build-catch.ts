import { CatchVersionSchema, PullRequestSnapshotSchema, catchIdOf, type CatchVersion } from "@kiasm-tech/star-catch-contracts";
import type { ContextOptions } from "./build-context.js";
import { buildScripts, type ScriptPorts } from "./build-scripts.js";

/** A snapshot → the catch Crux shows: the PR's chrome and both cuts' scripts. */
export async function buildCatch(snapshot: unknown, ports: ScriptPorts, options: ContextOptions = {}): Promise<CatchVersion> {
  const pr = PullRequestSnapshotSchema.parse(snapshot);
  const scripts = await buildScripts(pr, ports, options);
  return CatchVersionSchema.parse({
    catchId: catchIdOf(pr.fullName, pr.number),
    pr: {
      fullName: pr.fullName,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      url: pr.url,
      state: pr.merged ? "merged" : pr.state,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
    },
    technical: scripts.technical,
    business: scripts.business,
    generatedBy: { classifier: ports.classifier.id, writer: ports.writer.id },
  });
}
