import { consoleIo } from "./io.js";
import { run } from "./run.js";

process.exitCode = await run(process.argv.slice(2), process.env, consoleIo);
