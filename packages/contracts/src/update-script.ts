/** The script document (docs/spec-update-structure.md §10): one per cut, what the video and the article are made from. */
import { z } from "zod";
import { BUSINESS_SECTIONS, CHAPTERS, CUTS, DRAFT_SECTIONS, GateResultSchema, SKIP_REASONS, TECHNICAL_SECTIONS } from "./script.js";
import { VisualSchema } from "./visuals.js";

const SectionIdSchema = z.enum([...new Set([...TECHNICAL_SECTIONS, ...BUSINESS_SECTIONS, ...DRAFT_SECTIONS])] as [string, ...string[]]);

export const ScriptSectionSchema = z.object({
  id: SectionIdSchema,
  visual: VisualSchema,
  /** Spoken text; `<mark name="m1"/>` before the word that reveals an element. */
  narration: z.string(),
  /** Voice mark → the visual element it reveals. */
  reveals: z.record(z.string(), z.string()),
  /** Unit or sentence ids, or `pr:title`. */
  sources: z.array(z.string()),
  article: z.object({ heading: z.string().min(1), readMore: z.boolean() }),
});

export const ScriptFlagSchema = z.object({ sectionId: z.string(), message: z.string() });

export const ScriptSchema = z.object({
  cut: z.enum(CUTS),
  /** Never the PR's state: the script reads the same before and after the merge. */
  pr: z.object({ fullName: z.string(), number: z.number().int().positive(), title: z.string() }),
  gate: GateResultSchema,
  chapters: z.array(z.object({ id: z.enum(CHAPTERS), title: z.string(), sections: z.array(ScriptSectionSchema) })),
  /** Draft-only article appendices; empty once the PR is merged or closed. */
  draft: z.array(ScriptSectionSchema),
  skipped: z.array(z.object({ sectionId: z.string(), reason: z.enum(SKIP_REASONS) })),
  /** What the checks couldn't fix, for the developer to correct. */
  flags: z.array(ScriptFlagSchema),
});

export type ScriptSection = z.infer<typeof ScriptSectionSchema>;
export type ScriptFlag = z.infer<typeof ScriptFlagSchema>;
export type Script = z.infer<typeof ScriptSchema>;
