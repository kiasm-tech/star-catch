/** Services that have a mock twin. */
export type MockableService = "github" | "llm";

/** `STAR_CATCH_MOCK_<SERVICE>` wins over the `STAR_CATCH_MOCK` master switch; both default to off. */
export function isMock(service: MockableService, env: Record<string, string | undefined>): boolean {
  const specific = env[`STAR_CATCH_MOCK_${service.toUpperCase()}`];
  if (specific !== undefined) return specific === "true";
  return env.STAR_CATCH_MOCK === "true";
}
