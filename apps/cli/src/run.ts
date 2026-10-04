import { compose, UsageError, type Env } from "./compose.js";
import { analyze, analyzeUsage } from "./commands/analyze.js";
import { context, contextUsage } from "./commands/context.js";
import { evalClassify, evalClassifyUsage } from "./commands/eval-classify.js";
import { fixtures, fixturesUsage } from "./commands/fixtures.js";
import { migrate, migrateUsage } from "./commands/migrate.js";
import { record, recordUsage } from "./commands/record.js";
import { replay, replayUsage } from "./commands/replay.js";
import type { Io } from "./io.js";

const commands = { record, fixtures, analyze, context, "eval-classify": evalClassify, migrate, replay } as const;
const usage = ["Usage: pnpm cli <command>", "", `  ${recordUsage}`, `  ${fixturesUsage}`, `  ${analyzeUsage}`, `  ${contextUsage}`, `  ${evalClassifyUsage}`, `  ${migrateUsage}`, `  ${replayUsage}`].join("\n");

/** Exit codes: 0 done, 1 failed, 2 used wrongly. */
export async function run(argv: string[], env: Env, io: Io): Promise<number> {
  const [name, ...args] = argv;
  const command = name !== undefined && Object.hasOwn(commands, name) ? commands[name as keyof typeof commands] : undefined;
  if (!command) {
    io.err(usage);
    return 2;
  }
  try {
    return await command(args, compose(env), io);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return error instanceof UsageError ? 2 : 1;
  }
}
