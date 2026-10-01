/** What Crux's pages show: catches on the list, and the detail of one update. */
import { z } from "zod";

export const CutRoleSchema = z.enum(["technical", "business"]);
/** "published" is the post-merge state; the UI may still say "Merged". */
export const CatchStatusSchema = z.enum(["draft", "published"]);

export const CatchSchema = z.object({
  id: z.string(),
  /** PR number formatted for display ("#4182"). */
  num: z.string(),
  title: z.string(),
  summary: z.string(),
  author: z.string(),
  initials: z.string(),
  /** Short display date ("Sep 18"). */
  date: z.string(),
  /** Video runtime ("1:24"). */
  dur: z.string(),
  /** Review state of an unmerged PR ("open", "to merge"); absent once published. */
  state: z.string().optional(),
});

export const StarCatchRepoSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Branch and subscriber count, formatted ("main · 38 subscribers"). */
  meta: z.string(),
  /** Newest first. Watched state is per reader and lives in Crux, not here. */
  catches: z.array(CatchSchema),
});

export const StakeholdersSchema = z.object({
  technical: z.array(z.string()),
  business: z.array(z.string()),
});

export const CodeLineSchema = z.object({
  text: z.string(),
  change: z.enum(["add", "remove"]).optional(),
});

const sceneBase = {
  /** A floor at the video's frame rate: narration may make the scene run longer. */
  durationInFrames: z.number().int().positive(),
  narration: z.string().optional(),
};

export const TitleSceneSchema = z.object({
  ...sceneBase,
  kind: z.literal("title"),
  eyebrow: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
});

export const CalloutSceneSchema = z.object({
  ...sceneBase,
  kind: z.literal("callout"),
  label: z.string(),
  headline: z.string(),
  detail: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
});

export const CodeSceneSchema = z.object({
  ...sceneBase,
  kind: z.literal("code"),
  caption: z.string(),
  filename: z.string().optional(),
  lines: z.array(CodeLineSchema),
});

export const ClosingSceneSchema = z.object({
  ...sceneBase,
  kind: z.literal("closing"),
  headline: z.string(),
  bullets: z.array(z.string()).optional(),
  footer: z.string().optional(),
});

/** Never authored: the player inserts one before each section. */
export const SectionSceneSchema = z.object({
  ...sceneBase,
  kind: z.literal("section"),
  titles: z.array(z.string()),
  index: z.number().int().nonnegative(),
});

export const SceneSchema = z.discriminatedUnion("kind", [
  TitleSceneSchema,
  CalloutSceneSchema,
  CodeSceneSchema,
  ClosingSceneSchema,
]);

export const PlayedSceneSchema = z.discriminatedUnion("kind", [
  TitleSceneSchema,
  CalloutSceneSchema,
  CodeSceneSchema,
  ClosingSceneSchema,
  SectionSceneSchema,
]);

export const SectionSchema = z.object({
  title: z.string(),
  scenes: z.array(SceneSchema),
});

export const QuizQuestionSchema = z
  .object({
    q: z.string(),
    options: z.array(z.string()).min(2),
    /** Index into `options`. */
    correct: z.number().int().nonnegative(),
  })
  .refine((quiz) => quiz.correct < quiz.options.length, {
    message: "correct must point at one of the options",
    path: ["correct"],
  });

export const SubscriberSchema = z.object({
  email: z.string(),
  role: CutRoleSchema,
});

export const ChatMessageSchema = z.object({
  who: z.enum(["you", "system", "bot"]),
  text: z.string(),
});

/** One cut: the article, and the video that says the same thing. */
export const CatchCutSchema = z.object({
  paragraphs: z.array(z.string()),
  readMore: z.array(z.string()).optional(),
  sections: z.array(SectionSchema),
});

export const StarCatchDetailSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  repoName: z.string(),
  /** "#921" */
  prNumber: z.string(),
  prTitle: z.string(),
  openedBy: z.string(),
  initials: z.string(),
  status: CatchStatusSchema,
  /** The cut this update was addressed to; the role control opens on it. */
  audience: CutRoleSchema,
  /** "Opened Sep 19" / "Merged Sep 20". */
  timestampLabel: z.string(),
  /** Draft only. */
  seenBy: z
    .object({ watched: z.number().int(), total: z.number().int(), initials: z.array(z.string()) })
    .optional(),
  technical: CatchCutSchema,
  business: CatchCutSchema,
  /** Published only, technical cut only. */
  quiz: z.array(QuizQuestionSchema).optional(),
  /** Draft only. */
  subscribers: z.array(SubscriberSchema).optional(),
  /** Draft only: the fix chat's starting suggestions. */
  suggestions: z.array(z.string()).optional(),
  openingMessage: z.string(),
});

export type CutRole = z.infer<typeof CutRoleSchema>;
export type CatchStatus = z.infer<typeof CatchStatusSchema>;
export type Catch = z.infer<typeof CatchSchema>;
export type StarCatchRepo = z.infer<typeof StarCatchRepoSchema>;
export type Stakeholders = z.infer<typeof StakeholdersSchema>;
export type StakeholderGroup = keyof Stakeholders;
export type CodeLine = z.infer<typeof CodeLineSchema>;
export type TitleScene = z.infer<typeof TitleSceneSchema>;
export type CalloutScene = z.infer<typeof CalloutSceneSchema>;
export type CodeScene = z.infer<typeof CodeSceneSchema>;
export type ClosingScene = z.infer<typeof ClosingSceneSchema>;
export type SectionScene = z.infer<typeof SectionSceneSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type PlayedScene = z.infer<typeof PlayedSceneSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type Subscriber = z.infer<typeof SubscriberSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CatchCut = z.infer<typeof CatchCutSchema>;
export type StarCatchDetail = z.infer<typeof StarCatchDetailSchema>;
