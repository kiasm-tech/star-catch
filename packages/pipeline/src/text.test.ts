import { SentenceSchema } from "@kiasm-tech/star-catch-contracts";
import { expectContextMatches, loadSyntheticFixtures, snapshotOf } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { numbersIn, sentencesOf, splitSentences } from "./text.js";

describe("splitSentences", () => {
  it("ends sentences at a full stop before a capital, not inside abbreviations, versions or code", () => {
    expect(splitSentences("Fixes the cache. It now expires after 5 min. Use `cache.clear()` e.g. on logout. Ships in v1.2.")).toEqual([
      "Fixes the cache.",
      "It now expires after 5 min.",
      "Use `cache.clear()` e.g. on logout.",
      "Ships in v1.2.",
    ]);
  });

  it("joins soft-wrapped lines, keeps bullets apart and drops code blocks and template comments", () => {
    const body = [
      "<!-- Describe your change -->",
      "## Summary",
      "The discount now applies",
      "from 5 units.",
      "",
      "- Lowers the threshold",
      "* Adds a test",
      "1. Update the docs",
      "",
      "```ts",
      "const x = 1. Not a sentence.",
      "```",
      "Done!",
    ].join("\n");
    expect(splitSentences(body)).toEqual([
      "Summary",
      "The discount now applies from 5 units.",
      "Lowers the threshold",
      "Adds a test",
      "Update the docs",
      "Done!",
    ]);
  });
});

describe("real-world bodies", () => {
  it("reads CRLF line endings and task-list boxes", () => {
    expect(splitSentences("Changes:\r\n- Add a regex\r\n- [x] Run the tests\r\n* [ ] Update docs\r\n")).toEqual([
      "Changes:",
      "Add a regex",
      "Run the tests",
      "Update docs",
    ]);
  });

  it("skips merge commits", () => {
    const snapshot = snapshotOf(
      { fullName: "acme/shop", number: 1 },
      {
        body: null,
        commits: [
          { sha: "a".repeat(40), message: "fix: handle it" },
          { sha: "b".repeat(40), message: "Merge branch 'main' into fix/it" },
          { sha: "c".repeat(40), message: "Merge pull request #3 from acme/fix" },
        ],
      },
    );
    expect(sentencesOf(snapshot).map((s) => s.text)).toEqual(["fix: handle it"]);
  });
});

describe("numbersIn", () => {
  it.each([
    ["Raised from 10% to 15%", ["10%", "15%"]],
    ["Now 1,000 or 4.99 EUR", ["1,000", "4.99"]],
    ["Fixes #921 in v8, see `retry(3)`", []],
    ["Between 5 and 9 units", ["5", "9"]],
  ])("%s", (sentence, numbers) => {
    expect(numbersIn(sentence)).toEqual(numbers);
  });
});

describe("sentencesOf", () => {
  it("matches fixture 05's sentences", () => {
    const { snapshot, expected } = loadSyntheticFixtures().find((f) => f.name === "05-condition-change")!;
    const sentences = sentencesOf(snapshot).map(({ class: _class, ...s }) => s);
    expectContextMatches({ sentences } as never, { sentences: expected.sentences!.map(({ class: _c, ...s }) => s) });
  });

  it("reads linked issues and commit subjects, each origin counted from 0", () => {
    const snapshot = snapshotOf(
      { fullName: "acme/shop", number: 1 },
      {
        body: null,
        linkedIssues: [{ number: 12, title: "Checkout fails", body: "It throws. Every time." }],
        commits: [{ sha: "a".repeat(40), message: "fix: handle it\n\nLonger explanation." }],
      },
    );
    const sentences = sentencesOf(snapshot);
    expect(sentences.map((s) => [s.id, s.text])).toEqual([
      ["issue#12:0", "Checkout fails"],
      ["issue#12:1", "It throws."],
      ["issue#12:2", "Every time."],
      [`commit:${"a".repeat(40)}:0`, "fix: handle it"],
    ]);
    for (const sentence of sentences) expect(SentenceSchema.parse(sentence)).toEqual(sentence);
  });
});
