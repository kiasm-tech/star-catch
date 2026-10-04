/** Update scripts (docs/spec-update-structure.md §5–§10): cuts, chapters, sections, visuals, gates. */
import { z } from "zod";

export const CUTS = ["technical", "business"] as const;

/** §5, in order. */
export const CHAPTERS = ["opening", "why", "whatChanged", "howItWorks", "reach", "watchOut", "wrap"] as const;

/** §6, in table order. */
export const TECHNICAL_SECTIONS = [
  "title",
  "problem",
  "changeMap",
  "structureChange",
  "contractChange",
  "dataChange",
  "interaction",
  "lifecycle",
  "rule",
  "dataFlow",
  "reach",
  "verification",
  "risksRollout",
  "wrap",
] as const;

/** §7, in table order. */
export const BUSINESS_SECTIONS = [
  "headline",
  "before",
  "whatsNew",
  "howItWorksForYou",
  "theRuleNow",
  "whoItAffects",
  "inNumbers",
  "whatToKnow",
  "whatYouMayNeedToDo",
  "wrap",
] as const;

/** Article appendices shown only while the PR is open, never in the video (§6). */
export const DRAFT_SECTIONS = ["reviewFocus"] as const;

/** §8. The chapter bar is drawn over every section; the others carry one section each. */
export const VISUAL_TYPES = [
  "componentMap",
  "architectureMorph",
  "contextDiagram",
  "deploymentView",
  "systemSequenceDiagram",
  "sequenceDiagram",
  "stateMachine",
  "decisionDiagram",
  "requestPipeline",
  "eventFlow",
  "dataFlow",
  "dataModelDiff",
  "contractCard",
  "permissionMatrix",
  "userJourney",
  "swimlane",
  "screenshotSlider",
  "personaCards",
  "featureMap",
  "beforeAfterSplit",
  "rolloutTimeline",
  "impactRings",
  "metricCard",
  "checklist",
  "riskCards",
  "titleCard",
  "chapterBar",
  "glossaryCard",
  "recap",
] as const;

/** §3. */
export const GATES = ["readable", "meaningful", "explainable", "safe", "visible"] as const;
export const GATE_OUTCOMES = ["none", "articleOnly", "full"] as const;
/** Why a section isn't in the script; one that didn't fit the video is in Read more, not skipped. */
export const SKIP_REASONS = ["precondition", "gate"] as const;

export type Cut = (typeof CUTS)[number];
export type ChapterId = (typeof CHAPTERS)[number];
export type TechnicalSectionId = (typeof TECHNICAL_SECTIONS)[number];
export type BusinessSectionId = (typeof BUSINESS_SECTIONS)[number];
export type DraftSectionId = (typeof DRAFT_SECTIONS)[number];
export type SectionId = TechnicalSectionId | BusinessSectionId;
export type VisualType = (typeof VISUAL_TYPES)[number];
export type Gate = (typeof GATES)[number];
export type GateOutcome = (typeof GATE_OUTCOMES)[number];

const SectionIdSchema = z.enum([...new Set([...TECHNICAL_SECTIONS, ...BUSINESS_SECTIONS])] as [SectionId, ...SectionId[]]);

export const GateResultSchema = z.object({
  outcome: z.enum(GATE_OUTCOMES),
  /** The gates that didn't pass. */
  failed: z.array(z.enum(GATES)),
});

export const PlannedSectionSchema = z.object({
  id: SectionIdSchema,
  chapter: z.enum(CHAPTERS),
  visual: z.enum(VISUAL_TYPES),
  /** What the writer may use: 150 words a minute of the section's share of the cap. */
  wordLimit: z.number().int().positive(),
  /** Didn't fit the video's length cap: article only, under Read more. */
  readMore: z.boolean(),
});

/** Which sections a cut has, before anything is written (§3, §6, §7, §9). */
export const SectionPlanSchema = z.object({
  cut: z.enum(CUTS),
  gate: GateResultSchema,
  /** Only chapters with at least one section, in arc order. */
  chapters: z.array(z.object({ id: z.enum(CHAPTERS), sections: z.array(PlannedSectionSchema) })),
  skipped: z.array(z.object({ sectionId: SectionIdSchema, reason: z.enum(SKIP_REASONS) })),
  draft: z.array(
    z.object({ id: z.enum(DRAFT_SECTIONS), visual: z.enum(VISUAL_TYPES), wordLimit: z.number().int().positive() }),
  ),
});

/** A fixture's `expected-sections.json`: per cut, null when the gates say no update. */
const CutExpectationSchema = z.object({
  gate: z.enum(["articleOnly", "full"]),
  /** In the video, in script order. */
  sections: z.array(SectionIdSchema),
  readMore: z.array(SectionIdSchema).default([]),
  draft: z.array(z.enum(DRAFT_SECTIONS)).default([]),
});

export const SectionsExpectationSchema = z.object({
  technical: CutExpectationSchema.nullable(),
  business: CutExpectationSchema.nullable(),
});

export type GateResult = z.infer<typeof GateResultSchema>;
export type PlannedSection = z.infer<typeof PlannedSectionSchema>;
export type SectionPlan = z.infer<typeof SectionPlanSchema>;
export type SectionsExpectation = z.infer<typeof SectionsExpectationSchema>;
