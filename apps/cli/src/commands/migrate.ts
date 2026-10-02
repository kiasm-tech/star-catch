import { migrate as applyMigrations } from "@star-catch/adapters";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";

export const migrateUsage = "migrate                                      apply db/migrations to DATABASE_URL";

export async function migrate(args: string[], services: Services, io: Io): Promise<number> {
  if (args.length > 0) throw new UsageError(`Usage: ${migrateUsage}`);
  const db = services.database();
  try {
    const applied = await applyMigrations(db);
    for (const name of applied) io.out(`applied  ${name}`);
    if (applied.length === 0) io.out("up to date");
    return 0;
  } finally {
    await db.destroy();
  }
}
