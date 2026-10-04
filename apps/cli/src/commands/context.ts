import { buildContext } from "@star-catch/pipeline";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";
import { readSnapshot } from "./snapshot-file.js";

export const contextUsage = "context <fixture-dir | snapshot.json>        print a pull request's context";

const MAX_SHOWN = 100;
const shown = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text;
};

/** The context as JSON on stdout; concerns, facts and the time it took on stderr. */
export async function context(args: string[], services: Services, io: Io): Promise<number> {
  if (args.length !== 1) throw new UsageError(`Usage: ${contextUsage}`);
  const snapshot = await readSnapshot(args[0]);
  const { classifier, labelCache } = services.classification();

  const started = performance.now();
  const result = await buildContext(snapshot, { classifier, labelCache });
  const ms = Math.round(performance.now() - started);

  io.out(JSON.stringify(result, null, 2));
  for (const concern of result.concerns) io.err(`${concern.id} (importance ${concern.importance}): ${concern.unitIds.join(", ")}`);
  for (const fact of result.facts) io.err(`${`${fact.group}.${fact.key}`.padEnd(28)} ${shown(fact.value)}`);
  const unlabelled =
    result.units.filter((u) => u.verdict === "behavioural" && !u.labels).length + result.sentences.filter((s) => !s.class).length;
  const counts = `${result.units.length} units, ${result.sentences.length} sentences, ${result.concerns.length} concerns, ${result.facts.length} facts`;
  io.err(`${counts} in ${ms} ms by ${classifier.id}${unlabelled > 0 ? ` (${unlabelled} left unlabelled)` : ""}`);
  return 0;
}
