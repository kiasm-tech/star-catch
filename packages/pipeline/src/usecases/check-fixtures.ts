import {
  ContextExpectationSchema,
  PullRequestSnapshotSchema,
  SectionsExpectationSchema,
  type PullRequestSnapshot,
} from "@kiasm-tech/star-catch-contracts";
import type { FixtureReader } from "../ports/fixtures.js";
import { applyPatch, countPatchLines } from "../fixtures/patch.js";
import { OpenedWebhookSchema } from "../fixtures/webhook.js";

export interface FixtureCheck {
  fixture: string;
  problems: string[];
}

/** Every recorded and synthetic fixture, checked against the contracts and its own patches. */
export async function checkFixtures(reader: FixtureReader): Promise<FixtureCheck[]> {
  const checks: FixtureCheck[] = [];
  const recorded = new Map<string, PullRequestSnapshot>();

  for (const { name, data } of await reader.recordedSnapshots()) {
    const parsed = PullRequestSnapshotSchema.safeParse(data);
    if (parsed.success) recorded.set(`${parsed.data.fullName.toLowerCase()}#${parsed.data.number}`, parsed.data);
    checks.push({ fixture: `snapshots/${name}`, problems: parsed.success ? [] : [issues(parsed.error)] });
  }

  for (const { name, data } of await reader.recordedWebhooks()) {
    const parsed = OpenedWebhookSchema.safeParse(data);
    if (!parsed.success) {
      checks.push({ fixture: `webhooks/${name}`, problems: [issues(parsed.error)] });
      continue;
    }
    const { repository, pull_request } = parsed.data;
    const snapshot = recorded.get(`${repository.full_name.toLowerCase()}#${pull_request.number}`);
    const problems =
      snapshot === undefined
        ? ["no recorded snapshot for this pull request"]
        : snapshot.headSha !== pull_request.head.sha
          ? [`head ${pull_request.head.sha} differs from the snapshot's ${snapshot.headSha}`]
          : [];
    checks.push({ fixture: `webhooks/${name}`, problems });
  }

  const numbers = new Map<number, string>();
  for (const { name, snapshot, expected, sections } of await reader.syntheticFixtures()) {
    const problems: string[] = [];
    const snap = PullRequestSnapshotSchema.safeParse(snapshot);
    const exp = ContextExpectationSchema.safeParse(expected);
    if (!snap.success) problems.push(`snapshot: ${issues(snap.error)}`);
    if (!exp.success) problems.push(`expected: ${issues(exp.error)}`);
    if (sections === undefined) problems.push("no expected-sections.json");
    else {
      const sec = SectionsExpectationSchema.safeParse(sections);
      if (!sec.success) problems.push(`expected-sections: ${issues(sec.error)}`);
    }
    if (snap.success) {
      problems.push(...syntheticProblems(snap.data));
      const other = numbers.get(snap.data.number);
      if (other) problems.push(`PR number ${snap.data.number} is also used by ${other}`);
      numbers.set(snap.data.number, name);
      if (exp.success) {
        const { pr } = exp.data;
        const { fullName, number, headSha } = snap.data;
        if (pr?.fullName !== fullName || pr?.number !== number || pr?.headSha !== headSha) {
          problems.push("expected.pr doesn't name the snapshot's repo, number and head commit");
        }
        for (const unit of exp.data.units ?? []) {
          if (unit.labels?.intent !== undefined || unit.labels?.visibility !== undefined) {
            problems.push(`${unit.id}: expectations never state intent or visibility`);
          }
        }
      }
    }
    checks.push({ fixture: `synthetic/${name}`, problems });
  }
  return checks;
}

/** A synthetic PR is an answer key only if every patch is exact. */
function syntheticProblems(snapshot: PullRequestSnapshot): string[] {
  const problems: string[] = [];
  for (const file of snapshot.files) {
    const at = (problem: string) => problems.push(`${file.filename}: ${problem}`);
    if (file.patch === undefined) {
      at("no patch");
      continue;
    }
    if (file.status !== "added" && file.baseContent === undefined) at("no base content");
    if (file.status !== "removed" && file.headContent === undefined) at("no head content");
    const counts = countPatchLines(file.patch);
    if (counts.additions !== file.additions || counts.deletions !== file.deletions) {
      at(`patch has +${counts.additions}/-${counts.deletions}, file says +${file.additions}/-${file.deletions}`);
    }
    try {
      if (applyPatch(file.baseContent ?? "", file.patch) !== (file.headContent ?? "")) {
        at("patch doesn't turn the base content into the head content");
      }
    } catch (error) {
      at((error as Error).message);
    }
  }
  return problems;
}

function issues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`).join("; ");
}
