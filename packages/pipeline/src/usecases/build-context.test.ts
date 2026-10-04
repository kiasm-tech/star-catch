import { mockClassifier } from "@star-catch/changes";
import { expectContextMatches, loadRecordedSnapshots, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { buildContext } from "./build-context.js";

const ports = { classifier: mockClassifier };

describe("the context gate", () => {
  it.each(loadSyntheticFixtures().map((f) => [f.name, f] as const))("%s", async (_name, { snapshot, expected }) => {
    expectContextMatches(await buildContext(snapshot, ports), expected);
  });
});

describe("buildContext", () => {
  it("labels behavioural units by rule and classifier, structural ones by rule, unchanged ones not at all", async () => {
    const fixtures = loadSyntheticFixtures();
    const context = async (name: string) => buildContext(fixtures.find((f) => f.name === name)!.snapshot, ports);
    const [page] = (await context("08-ui-with-test")).units;
    expect(page.labels).toMatchObject({ kind: "ui", visibility: "user", source: { kind: "rule", visibility: "model" } });
    expect((await context("03-rename-only")).units[0].labels).toMatchObject({ intent: "refactor", source: { intent: "rule" } });
    expect((await context("01-formatting-only")).units[0].labels).toBeUndefined();
  });

  it("marks behavioural logic no test covers as untested", async () => {
    const fixtures = loadSyntheticFixtures();
    const { units } = await buildContext(fixtures.find((f) => f.name === "05-condition-change")!.snapshot, ports);
    expect(units[0].labels?.risks).toEqual(["untested"]);
  });

  it.each(loadRecordedSnapshots().map((s) => [`${s.fullName}#${s.number}`, s] as const))(
    "%s gives a valid context, the same both times",
    async (_name, snapshot) => {
      const once = await buildContext(snapshot, ports);
      expect(await buildContext(snapshot, ports)).toEqual(once);
      expect(once.units.every((u) => u.verdict === "notAChange" || u.labels !== undefined)).toBe(true);
    },
  );
});
