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

/** The one question each section answers (§5 chapters, §6–§7 rows): the writer says that and nothing else. */
export const SECTION_PURPOSES: Record<SectionId | DraftSectionId, string> = {
  title: "In one sentence, what happened.",
  problem: "Why this change: what was wrong or missing before, then what is different now. Nothing about how.",
  changeMap: "Which parts of the system changed. Name them; no reasons.",
  structureChange: "What was added or removed, and what now connects to it.",
  contractChange: "What callers send or get back now that they didn't before.",
  dataChange: "Which data changed shape, and how.",
  fromOutside: "What someone outside sees: what they send and the answers they get.",
  interaction: "The steps inside the system, in order.",
  lifecycle: "Which states something goes through now.",
  rule: "The rule that decides the outcome, before and after.",
  dataFlow: "Where the data goes, step by step.",
  reach: "What else depends on the change.",
  verification: "What the tests in this change prove.",
  risksRollout: "What could go wrong when it ships, and how that's handled.",
  wrap: "One or two sentences to remember. Nothing new.",
  headline: "In one sentence, what changes for people.",
  before: "What was painful or wrong for people before.",
  whatsNew: "What people get now.",
  howItWorksForYou: "What people do now, step by step.",
  theRuleNow: "The rule now, in everyday words.",
  whoItAffects: "Who is affected.",
  inNumbers: "The one real number and what it means.",
  whatToKnow: "What to be aware of; say plainly if there's nothing to do.",
  whatYouMayNeedToDo: "What someone has to do, and who.",
  reviewFocus: "Where a reviewer should look first.",
};

/** The facts each section is about: the writer sees these, not the whole context. */
export const SECTION_FACTS: Record<SectionId | DraftSectionId, string[]> = {
  title: ["intent"],
  problem: ["intent"],
  changeMap: ["shape.components"],
  structureChange: ["shape.added", "shape.removed", "reach"],
  contractChange: ["contracts"],
  dataChange: ["data", "rollout.migration"],
  fromOutside: ["interactions.entryPoints", "intent.rationale"],
  interaction: ["interactions"],
  lifecycle: ["data"],
  rule: ["rules", "evidence", "intent.rationale"],
  dataFlow: ["interactions", "data"],
  reach: ["reach", "interactions.entryPoints"],
  verification: ["quality.tests", "quality.covered"],
  risksRollout: ["rollout", "contracts.breaking", "quality.untested"],
  wrap: ["intent"],
  headline: ["intent"],
  before: ["intent.problem", "interactions.entryPoints"],
  whatsNew: ["intent.rationale", "interactions.entryPoints", "users"],
  howItWorksForYou: ["interactions", "users"],
  theRuleNow: ["rules", "evidence", "intent.rationale"],
  whoItAffects: ["interactions.entryPoints", "users"],
  inNumbers: ["evidence"],
  whatToKnow: ["contracts", "rules", "rollout", "intent.rationale"],
  whatYouMayNeedToDo: ["rollout.instruction"],
  reviewFocus: ["shape", "quality.untested"],
};

/** Section headings in the article, as named in §6–§7. */
export const SECTION_TITLES: Record<SectionId | DraftSectionId, string> = {
  title: "Title & summary",
  problem: "Why it changed",
  changeMap: "Change map",
  structureChange: "Structure change",
  contractChange: "Contract change",
  dataChange: "Data change",
  fromOutside: "From the outside",
  interaction: "Interaction",
  lifecycle: "Lifecycle",
  rule: "Rule",
  dataFlow: "Data flow",
  reach: "Reach",
  verification: "Verification",
  risksRollout: "Risks & rollout",
  wrap: "Wrap",
  headline: "Headline",
  before: "Before",
  whatsNew: "What's new",
  howItWorksForYou: "How it works for you",
  theRuleNow: "The rule now",
  whoItAffects: "Who it affects",
  inNumbers: "In numbers",
  whatToKnow: "What to know",
  whatYouMayNeedToDo: "What you may need to do",
  reviewFocus: "Review focus",
};

export const SECTION_RULES: SectionRule[] = [
  { id: "title", cut: "technical", chapter: "opening", include: "always", visual: "titleCard", estSeconds: 10 },
  { id: "problem", cut: "technical", chapter: "why", include: "whenRelevant", precondition: (f) => f.has("intent"), visual: "beforeAfterSplit", estSeconds: 20 },
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
