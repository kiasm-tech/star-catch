// Timings of analyze() over the recorded pull requests: `pnpm bench`.
import { loadRecordedSnapshots } from "@star-catch/testkit";
import { analyze } from "../src/analyze.js";
import { toAnalyzeInput } from "../src/input.js";

const RUNS = 7;
const snapshots = loadRecordedSnapshots();

const coldStart = performance.now();
for (const snapshot of snapshots) await analyze(toAnalyzeInput(snapshot));
console.log(`first pass, grammars loading included: ${Math.round(performance.now() - coldStart)} ms`);

for (const snapshot of snapshots) {
  const input = toAnalyzeInput(snapshot);
  const chars = input.files.reduce((sum, f) => sum + (f.base?.length ?? 0) + (f.head?.length ?? 0), 0);
  const times: number[] = [];
  let units = 0;
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    units = (await analyze(input)).units.length;
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(RUNS / 2)];
  console.log(
    `${`${snapshot.fullName}#${snapshot.number}`.padEnd(22)} ${String(input.files.length).padStart(3)} files  ${`${Math.round(chars / 1000)}k chars`.padStart(10)}  ${String(units).padStart(3)} units  median ${median.toFixed(0).padStart(4)} ms  (min ${times[0].toFixed(0)}, max ${times.at(-1)!.toFixed(0)})`,
  );
}
