import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import type {} from "./postgres.js";

/** One Postgres per test run; STAR_CATCH_TEST_DATABASE_URL reuses a running server instead. */
export default async function setup(project: TestProject): Promise<(() => Promise<void>) | void> {
  const existing = process.env.STAR_CATCH_TEST_DATABASE_URL;
  if (existing) {
    project.provide("postgresUrl", existing);
    return;
  }
  // Same major as the Azure server (crux-infra modules/postgres).
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  project.provide("postgresUrl", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
