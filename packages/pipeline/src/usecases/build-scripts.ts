import { PullRequestSnapshotSchema } from "@kiasm-tech/star-catch-contracts";
import { generateScripts, type ScriptOptions, type Scripts } from "../script/generate.js";
import type { ScriptWriter } from "../ports/script-writer.js";
import { buildContext, type ContextOptions, type ContextPorts } from "./build-context.js";
import { changeStatsOf } from "./change-stats.js";

export interface ScriptPorts extends ContextPorts {
  writer: ScriptWriter;
}

/** A snapshot → its context → both cuts' scripts. The draft appendix appears only while the PR is open. */
export async function buildScripts(
  snapshot: unknown,
  { writer, ...ports }: ScriptPorts,
  options: ContextOptions & Pick<ScriptOptions, "instruction" | "foldThin"> = {},
): Promise<Scripts> {
  const pr = PullRequestSnapshotSchema.parse(snapshot);
  const context = await buildContext(pr, ports, options);
  // The size people read: lockfiles, generated and vendored files don't count.
  const excluded = new Set(context.excluded.map((e) => e.file));
  const counted = pr.files.filter((f) => !excluded.has(f.filename));
  const size = { files: counted.length, additions: counted.reduce((n, f) => n + f.additions, 0), deletions: counted.reduce((n, f) => n + f.deletions, 0) };
  return generateScripts(
    context,
    { fullName: pr.fullName, number: pr.number, title: pr.title, ...(pr.author && { author: pr.author }), branch: pr.headRef, size, change: changeStatsOf(pr, counted, context) },
    { writer, open: pr.state === "open", ...(options.instruction && { instruction: options.instruction }), ...(options.foldThin && { foldThin: true }), ...(options.signal && { signal: options.signal }) },
  );
}
