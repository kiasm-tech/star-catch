import { describe, expect, it } from "vitest";
import { parseLinkedIssueNumbers, repoKey } from "./snapshot.js";

describe("parseLinkedIssueNumbers", () => {
  it("finds closing keywords in any case, first mention first", () => {
    expect(
      parseLinkedIssueNumbers("Closes #12. Also fixes #7, and RESOLVED #12 again. Fix: #3"),
    ).toEqual([12, 7, 3]);
  });

  it("ignores plain mentions and cross-repo references", () => {
    expect(parseLinkedIssueNumbers("See #4. Closes acme/api#9. Related to #5.")).toEqual([]);
  });

  it("handles an empty body", () => {
    expect(parseLinkedIssueNumbers(null)).toEqual([]);
    expect(parseLinkedIssueNumbers("")).toEqual([]);
  });
});

describe("repoKey", () => {
  it("lower-cases and trims", () => {
    expect(repoKey(" PMNDRS/Zustand ")).toBe("pmndrs/zustand");
  });
});
