import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    globalSetup: ["packages/testkit/src/postgres.setup.ts"],
    // Tests never reach a real service; adapters that could are swapped for their fixture twins.
    env: { STAR_CATCH_MOCK: "true" },
  },
});
