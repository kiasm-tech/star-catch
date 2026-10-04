import {
  ChangeUnitSchema,
  EntryPointSchema,
  ExcludedSchema,
  LABEL_SET_VERSION,
  LinkSchema,
  REFACTORINGS,
} from "@kiasm-tech/star-catch-contracts";
import { z } from "zod";

export const ANALYZER_VERSION = "1";

/** What a file is, from its path and content (changes.md §5.1). The first four leave the analysis. */
export const FILE_CLASSES = [
  "lockfile",
  "generated",
  "vendored",
  "binary",
  "test",
  "schema",
  "config",
  "manifest",
  "docs",
  "buildCi",
  "source",
] as const;
export const FileClassSchema = z.enum(FILE_CLASSES);

export const ENGINES = ["code", "structured", "lines"] as const;

export const AnalyzeInputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().min(1),
      previousPath: z.string().optional(),
      status: z.enum(["added", "removed", "modified", "renamed"]),
      /** Absent for added files. */
      base: z.string().optional(),
      /** Absent for removed files. */
      head: z.string().optional(),
      /** GitHub's hunks; narrows hashing and feeds the line fallback. */
      patch: z.string().optional(),
    }),
  ),
  /** Context for the classifier only. */
  pr: z.object({ title: z.string(), body: z.string().nullish() }).optional(),
});

const lineRange = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export const MAX_REFERENCES = 100;

export const UnitSchema = ChangeUnitSchema.extend({
  fileClass: FileClassSchema,
  /** 1-based line ranges. */
  span: z.object({ base: lineRange.optional(), head: lineRange.optional() }),
  /** Identifiers the head version calls or uses. */
  references: z.array(z.string()).max(MAX_REFERENCES),
});

export const ChangeSetSchema = z.object({
  analyzerVersion: z.string(),
  labelSetVersion: z.literal(LABEL_SET_VERSION),
  /** Some file fell back to lines or had parse errors in a changed unit. */
  degraded: z.boolean(),
  /** A budget or cap cut the analysis short. */
  truncated: z.boolean(),
  files: z.array(
    z.object({
      path: z.string(),
      language: z.string(),
      fileClass: FileClassSchema,
      engine: z.enum(ENGINES),
      degraded: z.boolean(),
      error: z.string().optional(),
    }),
  ),
  units: z.array(UnitSchema),
  refactorings: z.array(
    z.object({
      type: z.enum(REFACTORINGS),
      description: z.string(),
      unitIds: z.array(z.string()),
    }),
  ),
  links: z.array(LinkSchema),
  entryPoints: z.array(EntryPointSchema),
  excluded: z.array(ExcludedSchema),
  timings: z.object({ totalMs: z.number(), analysisMs: z.number(), classifyMs: z.number() }),
});

export interface Budgets {
  /** Parsing one file; past it the file falls back to lines. */
  perFileMs?: number;
  /** The whole analysis; past it the remaining files fall back to lines. */
  analysisMs?: number;
  classifyMs?: number;
}

export interface AnalyzeOptions {
  /** The repo's component map; default: the top-level folder. */
  componentOf?: (path: string) => string;
  budgets?: Budgets;
  signal?: AbortSignal;
}

export type FileClass = z.infer<typeof FileClassSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type ChangeSet = z.infer<typeof ChangeSetSchema>;
