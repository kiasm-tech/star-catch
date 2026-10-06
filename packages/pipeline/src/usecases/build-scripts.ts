import { PullRequestSnapshotSchema } from "@kiasm-tech/star-catch-contracts";
import { generateScripts, type ScriptOptions, type Scripts } from "../script/generate.js";
import type { ScriptWriter } from "../ports/script-writer.js";
import { buildContext, type ContextOptions, type ContextPorts } from "./build-context.js";

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
  return generateScripts(
    context,
    { fullName: pr.fullName, number: pr.number, title: pr.title, ...(pr.author && { author: pr.author }) },
    { writer, open: pr.state === "open", ...(options.instruction && { instruction: options.instruction }), ...(options.foldThin && { foldThin: true }), ...(options.signal && { signal: options.signal }) },
  );
}
