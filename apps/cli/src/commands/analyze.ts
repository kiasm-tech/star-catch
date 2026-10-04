import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { analyzeChanges } from "@star-catch/pipeline";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";

export const analyzeUsage = "analyze <fixture-dir | snapshot.json>         print a pull request's change set";

/** The change set as JSON on stdout; one line per unit and the time it took on stderr. */
export async function analyze(args: string[], _services: Services, io: Io): Promise<number> {
  if (args.length !== 1) throw new UsageError(`Usage: ${analyzeUsage}`);
  const [target] = args;
  const file = (await stat(target)).isDirectory() ? path.join(target, "snapshot.json") : target;
  const snapshot: unknown = JSON.parse(await readFile(file, "utf8"));

  const started = performance.now();
  const changes = await analyzeChanges(snapshot);
  const ms = Math.round(performance.now() - started);

  io.out(JSON.stringify(changes, null, 2));
  for (const unit of changes.units) {
    const refactorings = unit.refactorings.length > 0 ? ` [${unit.refactorings.join(", ")}]` : "";
    io.err(`${unit.verdict.padEnd(11)} ${unit.changeType.padEnd(16)} ${unit.id}${refactorings}`);
  }
  const notes = [changes.truncated && "truncated", changes.degraded && "degraded"].filter(Boolean);
  io.err(`${changes.units.length} units in ${ms} ms${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`);
  return 0;
}
