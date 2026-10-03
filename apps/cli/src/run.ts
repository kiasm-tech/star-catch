import { compose, UsageError, type Env } from "./compose.js";
import { fixtures, fixturesUsage } from "./commands/fixtures.js";
import { migrate, migrateUsage } from "./commands/migrate.js";
import { record, recordUsage } from "./commands/record.js";
import type { Io } from "./io.js";

const commands = { record, fixtures, migrate } as const;
const usage = ["Usage: pnpm cli <command>", "", `  ${recordUsage}`, `  ${fixturesUsage}`, `  ${migrateUsage}`].join("\n");

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
