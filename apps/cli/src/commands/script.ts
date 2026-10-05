import { buildScripts } from "@star-catch/pipeline";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";
import { readSnapshot } from "./snapshot-file.js";

export const scriptUsage = "script <fixture-dir | snapshot.json>         print both cuts' scripts";

const words = (narration: string) => narration.replace(/<mark name="[^"]*"\/>/g, "").split(/\s+/).filter(Boolean).length;

/** Both scripts as JSON on stdout; per cut, its sections with their length and the flags on stderr. */
export async function script(args: string[], services: Services, io: Io): Promise<number> {
  if (args.length !== 1) throw new UsageError(`Usage: ${scriptUsage}`);
  const snapshot = await readSnapshot(args[0]);
  const { classifier, labelCache } = services.classification();
  const { writer } = services.writer();

  const started = performance.now();
  const scripts = await buildScripts(snapshot, { classifier, ...(labelCache && { labelCache }), writer });
  const ms = Math.round(performance.now() - started);

  io.out(JSON.stringify(scripts, null, 2));
  for (const cut of ["technical", "business"] as const) {
    const s = scripts[cut];
    if (!s) {
      io.err(`${cut}: no update`);
      continue;
    }
    const sections = s.chapters.flatMap((c) => c.sections);
    const spoken = sections.filter((x) => !x.article.readMore).reduce((n, x) => n + words(x.narration), 0);
    io.err(`${cut} (${s.gate.outcome}, ${spoken} words): ${sections.map((x) => `${x.id}${x.article.readMore ? "*" : ""}`).join(", ")}${s.draft.length ? ` + draft ${s.draft.map((d) => d.id).join(", ")}` : ""}`);
    for (const flag of s.flags) io.err(`  flag ${flag.sectionId}: ${flag.message}`);
  }
  io.err(`in ${ms} ms by ${classifier.id} and ${writer.id}`);
  return 0;
}
