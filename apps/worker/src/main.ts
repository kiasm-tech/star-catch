import { compose, jsonLog } from "./compose.js";
import { runWorker } from "./run.js";

const watch = process.argv.includes("--watch");
const worker = await compose(process.env);
const stopping = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => stopping.abort());

try {
  const handled = await runWorker(worker, { watch, signal: stopping.signal, log: jsonLog });
  jsonLog({ handled });
} finally {
  await worker.stop();
}
