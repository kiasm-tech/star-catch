import { describe, expect, it } from "vitest";
import type { FixtureReader, SyntheticFixtureFiles } from "../ports/fixtures.js";
import { openedWebhook } from "../fixtures/webhook.js";
import { checkFixtures } from "./check-fixtures.js";
import { snapshotOf } from "@star-catch/testkit";

const ref = { fullName: "acme/shop", number: 105 };
const base = "if (q >= 10) {\n";
const head = "if (q >= 5) {\n";
const synthetic = snapshotOf(ref, {
  files: [
    {
      filename: "src/discount.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: "@@ -1 +1 @@\n-if (q >= 10) {\n+if (q >= 5) {",
      baseContent: base,
      headContent: head,
    },
  ],
});
const expected = { pr: { fullName: ref.fullName, number: ref.number, headSha: synthetic.headSha } };

function reader(parts: Partial<{ snapshots: unknown[]; webhooks: unknown[]; synthetic: SyntheticFixtureFiles[] }>): FixtureReader {
  return {
    recordedSnapshots: async () => (parts.snapshots ?? []).map((data, i) => ({ name: `s${i}.json`, data })),
    recordedWebhooks: async () => (parts.webhooks ?? []).map((data, i) => ({ name: `w${i}.json`, data })),
    syntheticFixtures: async () => parts.synthetic ?? [],
  };
}

const problemsOf = async (r: FixtureReader) =>
  (await checkFixtures(r)).filter((c) => c.problems.length > 0).map((c) => [c.fixture, c.problems]);

describe("checkFixtures", () => {
  it("passes consistent fixtures", async () => {
    const recorded = snapshotOf({ fullName: "pmndrs/zustand", number: 1 });
    const r = reader({
      snapshots: [recorded],
      webhooks: [openedWebhook(recorded)],
      synthetic: [{ name: "05-condition", snapshot: synthetic, expected }],
    });
    expect(await problemsOf(r)).toEqual([]);
    expect(await checkFixtures(r)).toHaveLength(3);
  });

  it("reports a snapshot that breaks the contract", async () => {
    const [[fixture, problems]] = (await problemsOf(reader({ snapshots: [{ fullName: "nope" }] }))) as [string, string[]][];
    expect(fixture).toBe("snapshots/s0.json");
    expect(problems[0]).toMatch(/fullName/);
  });

  it("reports a webhook without a snapshot at its head commit", async () => {
    const recorded = snapshotOf({ fullName: "pmndrs/zustand", number: 1 });
    const moved = { ...openedWebhook(recorded) };
    moved.pull_request = { ...moved.pull_request, head: { ...moved.pull_request.head, sha: "d".repeat(40) } };
    expect(await problemsOf(reader({ snapshots: [recorded], webhooks: [moved] }))).toEqual([
      ["webhooks/w0.json", [`head ${"d".repeat(40)} differs from the snapshot's ${"b".repeat(40)}`]],
    ]);
  });

  it("reports a synthetic patch that doesn't produce the head content", async () => {
    const broken = structuredClone(synthetic);
    broken.files[0]!.headContent = "if (q >= 6) {\n";
    expect(await problemsOf(reader({ synthetic: [{ name: "05-condition", snapshot: broken, expected }] }))).toEqual([
      ["synthetic/05-condition", ["src/discount.ts: patch doesn't turn the base content into the head content"]],
    ]);
  });

  it("reports an expectation that states intent", async () => {
    const withIntent = { ...expected, units: [{ id: "src/discount.ts#bulkDiscount", labels: { intent: "fix" } }] };
    const [[, problems]] = (await problemsOf(
      reader({ synthetic: [{ name: "05-condition", snapshot: synthetic, expected: withIntent }] }),
    )) as [string, string[]][];
    expect(problems).toEqual(["src/discount.ts#bulkDiscount: expectations never state intent or visibility"]);
  });
});
