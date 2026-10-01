import { describe, expect, it } from "vitest";
import type { Context } from "@kiasm-tech/star-catch-contracts";
import { expectContextMatches } from "./match.js";

const actual = {
  version: 1,
  labelSetVersion: 1,
  pr: { fullName: "acme/shop", number: 1, headSha: "a".repeat(40) },
  degraded: false,
  truncated: false,
  units: [
    { id: "a.ts#fmt", file: "a.ts", name: "fmt", verdict: "structural", refactorings: ["rename"] },
    { id: "a.ts#run", file: "a.ts", name: "run", verdict: "behavioural", refactorings: [] },
  ],
  links: [{ from: "a.ts#run", to: "a.ts#fmt", type: "calls" }],
  entryPoints: [],
  concerns: [],
  sentences: [],
  facts: [],
  excluded: [
    { file: "pnpm-lock.yaml", reason: "lockfile" },
    { file: "dist/a.js", reason: "generated" },
  ],
} as unknown as Context;

const mismatch = (expected: object) => {
  try {
    expectContextMatches(actual, expected);
  } catch (error) {
    return (error as Error).message;
  }
  return null;
};

describe("expectContextMatches", () => {
  it("passes on matching data", () => {
    expect(() => expectContextMatches(actual, structuredClone(actual))).not.toThrow();
  });

  it("ignores fields absent from the expectation", () => {
    expect(mismatch({})).toBeNull();
    expect(
      mismatch({ units: [{ id: "a.ts#fmt" }, { id: "a.ts#run", verdict: "behavioural" }] }),
    ).toBeNull();
  });

  it("matches arrays of objects by id, or by file for excluded", () => {
    expect(
      mismatch({
        units: [{ id: "a.ts#run", refactorings: [] }, { id: "a.ts#fmt", refactorings: ["rename"] }],
        excluded: [{ file: "dist/a.js", reason: "generated" }, { file: "pnpm-lock.yaml" }],
      }),
    ).toBeNull();
  });

  it("reports the path of the first difference", () => {
    const run = { id: "a.ts#run" };
    expect(mismatch({ units: [{ id: "a.ts#fmt", verdict: "notAChange" }, run] })).toBe(
      "units[a.ts#fmt].verdict: expected notAChange, got structural",
    );
    expect(mismatch({ units: [{ id: "a.ts#fmt", refactorings: ["move"] }, run] })).toBe(
      "units[a.ts#fmt].refactorings[0]: expected move, got rename",
    );
    expect(mismatch({ links: [{ type: "covers" }] })).toBe(
      "links[0].type: expected covers, got calls",
    );
    const excluded = [{ file: "dist/a.js", reason: "vendored" }, { file: "pnpm-lock.yaml" }];
    expect(mismatch({ excluded })).toBe(
      "excluded[dist/a.js].reason: expected vendored, got generated",
    );
    expect(mismatch({ pr: { number: 2 } })).toBe("pr.number: expected 2, got 1");
  });

  it("treats an array as the whole set", () => {
    expect(mismatch({ units: [] })).toBe("units: expected 0 items, got 2");
    expect(mismatch({ units: [{ id: "a.ts#fmt" }] })).toBe(
      "units[a.ts#run]: expected no element, got one",
    );
    expect(mismatch({ units: [{ id: "a.ts#fmt" }, { id: "a.ts#run" }, { id: "b.ts#x" }] })).toBe(
      "units[b.ts#x]: expected an element, got none",
    );
    expect(mismatch({ units: [{ id: "a.ts#fmt", refactorings: [] }, { id: "a.ts#run" }] })).toBe(
      "units[a.ts#fmt].refactorings: expected 0 items, got 1",
    );
  });
});
