import { describe, expect, it } from "vitest";
import { QuizQuestionSchema, SceneSchema, StarCatchDetailSchema, type StarCatchDetail } from "./domain.js";

const cut = {
  paragraphs: ["Discounts now start at five units."],
  sections: [
    {
      title: "What changed",
      scenes: [
        { kind: "title", eyebrow: "acme/shop · #105", title: "Bulk discount from 5 units", durationInFrames: 90 },
        { kind: "callout", label: "Threshold", headline: "10 → 5 units", before: "10", after: "5", durationInFrames: 120 },
      ],
    },
  ],
};

const detail: StarCatchDetail = {
  id: "acme-shop-105",
  repoId: "acme-shop",
  repoName: "acme/shop",
  prNumber: "#105",
  prTitle: "fix(pricing): apply the bulk discount from 5 units",
  openedBy: "acme-dev",
  initials: "AD",
  status: "draft",
  audience: "business",
  timestampLabel: "Opened Sep 30",
  technical: StarCatchDetailSchema.shape.technical.parse(cut),
  business: StarCatchDetailSchema.shape.business.parse(cut),
  openingMessage: "Ask for a change to this draft.",
};

describe("domain schemas", () => {
  it("accept a draft update", () => {
    expect(StarCatchDetailSchema.parse(detail)).toEqual(detail);
  });

  it("reject a scene kind that isn't authored", () => {
    const section = { kind: "section", titles: ["a"], index: 0, durationInFrames: 30 };
    expect(SceneSchema.safeParse(section).success).toBe(false);
  });

  it("reject a quiz answer outside its options", () => {
    const result = QuizQuestionSchema.safeParse({ q: "Which?", options: ["a", "b"], correct: 2 });
    expect(result.success).toBe(false);
  });
});
