import { checkFixtures } from "@star-catch/pipeline";
import type { Services } from "../compose.js";
import type { Io } from "../io.js";

export const fixturesUsage = "fixtures                                     check every fixture against the contracts";

export async function fixtures(_args: string[], services: Services, io: Io): Promise<number> {
  const checks = await checkFixtures(services.fixtures);
  let failed = 0;
  for (const { fixture, problems } of checks) {
    if (problems.length === 0) {
      io.out(`ok    ${fixture}`);
    } else {
      failed++;
      io.out(`FAIL  ${fixture}`);
      for (const problem of problems) io.out(`      ${problem}`);
    }
  }
  io.out(`${checks.length - failed}/${checks.length} fixtures ok`);
  return failed === 0 ? 0 : 1;
}
