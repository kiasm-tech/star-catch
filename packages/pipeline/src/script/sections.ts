/** The sections of each cut as data: spec-update-structure.md §5–§7, one entry per table row, in order. */
import type { ChapterId, Cut, DraftSectionId, SectionId, VisualType } from "@kiasm-tech/star-catch-contracts";
import type { FactIndex } from "./facts-index.js";

export type Include = "always" | "whenRelevant" | "ifRoom";

export interface SectionRule {
  id: SectionId;
  cut: Cut;
  chapter: ChapterId;
  include: Include;
  /** Reads facts only; none means the section always qualifies. */
  precondition?: (facts: FactIndex) => boolean;
  visual: VisualType;
  /** Spoken length the budget plans with, before anything is written. */
  estSeconds: number;
}

export const CHAPTER_TITLES: Record<ChapterId, string> = {
  opening: "Opening",
  why: "Why",
  whatChanged: "What changed",
  howItWorks: "How it works",
  reach: "Reach",
  watchOut: "Watch out",
  wrap: "Wrap",
};

const ruleChanged = (f: FactIndex) => f.has("rules", "conditionChanged");

export const SECTION_RULES: SectionRule[] = [
  { id: "title", cut: "technical", chapter: "opening", include: "always", visual: "titleCard", estSeconds: 10 },
  { id: "problem", cut: "technical", chapter: "why", include: "whenRelevant", precondition: (f) => f.has("intent", "problem"), visual: "beforeAfterSplit", estSeconds: 20 },
  { id: "changeMap", cut: "technical", chapter: "whatChanged", include: "always", precondition: (f) => f.has("shape", "components"), visual: "componentMap", estSeconds: 20 },
  { id: "structureChange", cut: "technical", chapter: "whatChanged", include: "whenRelevant", precondition: (f) => f.has("shape", "added") || f.has("shape", "removed"), visual: "architectureMorph", estSeconds: 25 },
  { id: "contractChange", cut: "technical", chapter: "whatChanged", include: "whenRelevant", precondition: (f) => f.has("contracts", "changed"), visual: "contractCard", estSeconds: 25 },
  { id: "dataChange", cut: "technical", chapter: "whatChanged", include: "whenRelevant", precondition: (f) => f.has("data"), visual: "dataModelDiff", estSeconds: 25 },
  // The product as one box between whoever reaches the changed entry point and the answer they get.
  { id: "fromOutside", cut: "technical", chapter: "howItWorks", include: "whenRelevant", precondition: (f) => f.has("interactions", "entryPoints"), visual: "systemSequenceDiagram", estSeconds: 25 },
  { id: "interaction", cut: "technical", chapter: "howItWorks", include: "whenRelevant", precondition: (f) => f.flows(3).length > 0, visual: "sequenceDiagram", estSeconds: 30 },
  // No fact carries states or data paths yet.
  { id: "lifecycle", cut: "technical", chapter: "howItWorks", include: "whenRelevant", precondition: () => false, visual: "stateMachine", estSeconds: 25 },
  { id: "rule", cut: "technical", chapter: "howItWorks", include: "whenRelevant", precondition: ruleChanged, visual: "decisionDiagram", estSeconds: 25 },
  { id: "dataFlow", cut: "technical", chapter: "howItWorks", include: "ifRoom", precondition: () => false, visual: "dataFlow", estSeconds: 25 },
  { id: "reach", cut: "technical", chapter: "reach", include: "whenRelevant", precondition: (f) => f.has("reach", "callers"), visual: "impactRings", estSeconds: 15 },
  { id: "verification", cut: "technical", chapter: "watchOut", include: "whenRelevant", precondition: (f) => f.has("quality", "tests"), visual: "checklist", estSeconds: 15 },
  {
    id: "risksRollout",
    cut: "technical",
    chapter: "watchOut",
    include: "always",
    precondition: (f) =>
      ["migration", "gated", "config"].some((key) => f.has("rollout", key)) || f.has("contracts", "breaking") || f.has("quality", "untested"),
    visual: "riskCards",
    estSeconds: 25,
  },
  { id: "wrap", cut: "technical", chapter: "wrap", include: "always", visual: "recap", estSeconds: 10 },

  { id: "headline", cut: "business", chapter: "opening", include: "always", visual: "titleCard", estSeconds: 8 },
  { id: "before", cut: "business", chapter: "why", include: "whenRelevant", precondition: (f) => f.has("intent", "problem"), visual: "userJourney", estSeconds: 18 },
  { id: "whatsNew", cut: "business", chapter: "whatChanged", include: "always", visual: "systemSequenceDiagram", estSeconds: 20 },
  { id: "howItWorksForYou", cut: "business", chapter: "howItWorks", include: "whenRelevant", precondition: (f) => f.flows(2, "page").length > 0, visual: "systemSequenceDiagram", estSeconds: 20 },
  { id: "theRuleNow", cut: "business", chapter: "howItWorks", include: "whenRelevant", precondition: ruleChanged, visual: "decisionDiagram", estSeconds: 18 },
  { id: "whoItAffects", cut: "business", chapter: "reach", include: "whenRelevant", precondition: (f) => f.has("interactions", "entryPoints") || f.has("users", "screens"), visual: "featureMap", estSeconds: 15 },
  { id: "inNumbers", cut: "business", chapter: "reach", include: "whenRelevant", precondition: (f) => f.businessNumbers().length > 0, visual: "metricCard", estSeconds: 12 },
  {
    id: "whatToKnow",
    cut: "business",
    chapter: "watchOut",
    include: "whenRelevant",
    precondition: (f) => f.has("contracts") || f.has("rules") || f.has("rollout", "gated"),
    visual: "riskCards",
    estSeconds: 15,
  },
  { id: "whatYouMayNeedToDo", cut: "business", chapter: "watchOut", include: "whenRelevant", precondition: (f) => f.has("rollout", "instruction"), visual: "checklist", estSeconds: 15 },
  { id: "wrap", cut: "business", chapter: "wrap", include: "always", visual: "recap", estSeconds: 8 },
];

/** Draft-only article appendices (§6): never in the video, gone once the PR is merged or closed. */
export const DRAFT_RULES: { id: DraftSectionId; cut: Cut; visual: VisualType; estSeconds: number }[] = [
  { id: "reviewFocus", cut: "technical", visual: "componentMap", estSeconds: 20 },
];
