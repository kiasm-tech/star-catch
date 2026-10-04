import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ContextExpectationSchema,
  PullRequestSnapshotSchema,
  SectionsExpectationSchema,
  type ContextExpectation,
  type PullRequestSnapshot,
  type SectionsExpectation,
} from "@kiasm-tech/star-catch-contracts";

/** The repository's fixtures/ folder. */
export const FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

export interface SyntheticFixture {
  name: string;
  snapshot: PullRequestSnapshot;
  expected: ContextExpectation;
  /** Absent only while a fixture is being written; `pnpm cli fixtures` requires it. */
  sections?: SectionsExpectation;
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

/** Hand-made PRs with their expected context — the answer key — sorted by name. */
export function loadSyntheticFixtures(dir = FIXTURES_DIR): SyntheticFixture[] {
  const root = path.join(dir, "synthetic");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      snapshot: PullRequestSnapshotSchema.parse(readJson(path.join(root, name, "snapshot.json"))),
      expected: ContextExpectationSchema.parse(readJson(path.join(root, name, "expected.json"))),
      ...(existsSync(path.join(root, name, "expected-sections.json")) && {
        sections: SectionsExpectationSchema.parse(readJson(path.join(root, name, "expected-sections.json"))),
      }),
    }));
}

/** Recorded real PRs, sorted by file name. */
export function loadRecordedSnapshots(dir = FIXTURES_DIR): PullRequestSnapshot[] {
  const root = path.join(dir, "snapshots");
  return readdirSync(root)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => PullRequestSnapshotSchema.parse(readJson(path.join(root, file))));
}
