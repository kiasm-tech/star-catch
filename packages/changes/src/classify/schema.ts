import {
  CHANGE_TYPES,
  ENTRY_POINTS,
  INTENTS,
  KINDS,
  LABEL_SOURCES,
  RISKS,
  SENTENCE_CLASSES,
  UNIT_KINDS,
  VISIBILITIES,
} from "@kiasm-tech/star-catch-contracts";
import { z } from "zod";
import { FileClassSchema } from "../schema.js";

const confidence = z.number().min(0).max(1);

/** What rules decided before a model sees the unit; an axis left out is the model's. */
export const RuleLabelsSchema = z.object({
  kind: z.enum(KINDS).optional(),
  intent: z.enum(INTENTS).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  risks: z.array(z.enum(RISKS)),
});

/** One unit as the classifier sees it: bounded, about 1–2k tokens (changes.md §6.3). */
export const UnitItemSchema = z.object({
  type: z.literal("unit"),
  id: z.string(),
  path: z.string(),
  language: z.string(),
  fileClass: FileClassSchema,
  unitKind: z.enum(UNIT_KINDS),
  changeType: z.enum(CHANGE_TYPES),
  name: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
  /** Names of the other changed units in the same file. */
  siblings: z.array(z.string()),
  references: z.array(z.string()),
  /** Visibility hints. */
  exported: z.boolean(),
  entryPoint: z.enum(ENTRY_POINTS).optional(),
  title: z.string(),
  decided: RuleLabelsSchema,
});

export const SentenceItemSchema = z.object({
  type: z.literal("sentence"),
  id: z.string(),
  origin: z.string(),
  text: z.string(),
  title: z.string(),
});

export const ClassifyItemSchema = z.discriminatedUnion("type", [UnitItemSchema, SentenceItemSchema]);

/** Self-reported confidence: a hint for review, not calibrated (changes.md §6.3). */
export const UnitResultSchema = z.object({
  type: z.literal("unit"),
  id: z.string(),
  /** Only when the rules left it open. */
  kind: z.enum(KINDS).optional(),
  intent: z.enum(INTENTS),
  visibility: z.enum(VISIBILITIES),
  breaking: z.boolean(),
  securitySensitive: z.boolean(),
  confidence: z.object({ kind: confidence.optional(), intent: confidence, visibility: confidence, risks: confidence }),
});

export const SentenceResultSchema = z.object({
  type: z.literal("sentence"),
  id: z.string(),
  class: z.enum(SENTENCE_CLASSES),
  confidence,
});

export const ClassifyResultSchema = z.discriminatedUnion("type", [UnitResultSchema, SentenceResultSchema]);

/** A cache row: the exact input is kept, so the rows double as training data (changes.md §6.2). */
export const StoredLabelsSchema = z.object({
  inputHash: z.string(),
  classifier: z.string(),
  input: ClassifyItemSchema,
  result: ClassifyResultSchema,
  source: z.enum(LABEL_SOURCES),
});

export type RuleLabels = z.infer<typeof RuleLabelsSchema>;
export type UnitItem = z.infer<typeof UnitItemSchema>;
export type SentenceItem = z.infer<typeof SentenceItemSchema>;
export type ClassifyItem = z.infer<typeof ClassifyItemSchema>;
export type UnitResult = z.infer<typeof UnitResultSchema>;
export type SentenceResult = z.infer<typeof SentenceResultSchema>;
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;
export type StoredLabels = z.infer<typeof StoredLabelsSchema>;
