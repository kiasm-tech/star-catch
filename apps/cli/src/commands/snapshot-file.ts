import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/** A fixture directory's snapshot.json, or a snapshot file, parsed but not validated. */
export async function readSnapshot(target: string): Promise<unknown> {
  const file = (await stat(target)).isDirectory() ? path.join(target, "snapshot.json") : target;
  return JSON.parse(await readFile(file, "utf8"));
}
