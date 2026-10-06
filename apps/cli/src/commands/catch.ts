import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatchVersion } from "@kiasm-tech/star-catch-contracts";
import { buildCatch } from "@star-catch/pipeline";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";
import { readSnapshot } from "./snapshot-file.js";

export const catchUsage = "catch <fixture-dir | snapshot.json> | --all [--out <dir>]  export catches for Crux";

function parse(args: string[]): { target?: string; all: boolean; out?: string } {
  const rest = [...args];
  const out = rest.indexOf("--out");
  const dir = out >= 0 ? rest.splice(out, 2)[1] : undefined;
  if (out >= 0 && !dir) throw new UsageError(`Usage: ${catchUsage}`);
  const all = rest.includes("--all");
  const targets = rest.filter((a) => a !== "--all");
  if (all ? targets.length > 0 || !dir : targets.length !== 1) throw new UsageError(`Usage: ${catchUsage}`);
  return { ...(targets[0] && { target: targets[0] }), all, ...(dir && { out: dir }) };
}

const summary = (c: CatchVersion) =>
  `${c.catchId}: technical ${c.technical ? c.technical.gate.outcome : "none"}, business ${c.business ? c.business.gate.outcome : "none"}`;

/**
 * One catch as JSON, or with `--all` every synthetic and recorded PR that gets an update, one
 * `<catchId>.json` each: the files Crux shows until it reads catches from the API.
 */
export async function catchCommand(args: string[], services: Services, io: Io): Promise<number> {
  const { target, all, out } = parse(args);
  const { classifier, labelCache } = services.classification();
  const { writer } = services.writer();
  const ports = { classifier, ...(labelCache && { labelCache }), writer };

  const snapshots: unknown[] = target
    ? [await readSnapshot(target)]
    : [
        ...(await services.fixtures.syntheticFixtures()).map((f) => f.snapshot),
        ...(await services.fixtures.recordedSnapshots()).map((s) => s.data),
      ];
  const catches = [];
  for (const snapshot of snapshots) catches.push(await buildCatch(snapshot, ports));

  if (!out) {
    io.out(JSON.stringify(catches[0], null, 2));
    io.err(summary(catches[0]!));
    return 0;
  }
  await mkdir(out, { recursive: true });
  let written = 0;
  for (const c of catches) {
    if (all && !c.technical && !c.business) {
      io.err(`${c.catchId}: no update, skipped`);
      continue;
    }
    await writeFile(path.join(out, `${c.catchId}.json`), `${JSON.stringify(c, null, 2)}\n`);
    io.err(summary(c));
    written++;
  }
  io.err(`${written} catches written to ${out}`);
  return 0;
}
