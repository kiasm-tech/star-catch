/** The context: a PR as labels, links and quoted text (docs/pr-analysis.md). */
import { z } from "zod";
import {
  CHANGE_TYPES,
  ENTRY_POINTS,
  FACT_GROUPS,
  INTENTS,
  KINDS,
  LABEL_SET_VERSION,
  LABEL_SOURCES,
  LINK_TYPES,
  REFACTORINGS,
  RISKS,
  SENTENCE_CLASSES,
  UNIT_KINDS,
  VERDICTS,
  VISIBILITIES,
} from "./labels.js";

export const CONTEXT_VERSION = 1;
export const MAX_UNIT_CODE_CHARS = 2_000;
export const EXCLUDED_REASONS = ["lockfile", "generated", "vendored", "binary"] as const;

const confidence = z.number().min(0).max(1);
const source = z.enum(LABEL_SOURCES);

const ConfidenceSchema = z.object({
  kind: confidence,
  intent: confidence,
  visibility: confidence,
  risks: confidence,
});

const LabelSourceSchema = z.object({
  kind: source,
  intent: source,
  visibility: source,
  risks: source,
});

export const UnitLabelsSchema = z.object({
  kind: z.enum(KINDS),
  intent: z.enum(INTENTS),
  visibility: z.enum(VISIBILITIES),
  risks: z.array(z.enum(RISKS)),
  confidence: ConfidenceSchema,
  source: LabelSourceSchema,
});

export const ChangeUnitSchema = z.object({
  /**
   * `${file}#${name}`. Members are qualified by their container (`Cart.total`), a whole-file
   * unit is named by the file's basename, and a renamed or moved unit by its head name.
   */
  id: z.string(),
  file: z.string().min(1),
  name: z.string().min(1),
  unitKind: z.enum(UNIT_KINDS),
  /** Lowercase and open: "typescript", "python", "java", "json", "sql", "markdown", … */
  language: z.string().regex(/^[a-z0-9+#.-]+$/),
  verdict: z.enum(VERDICTS),
  changeType: z.enum(CHANGE_TYPES),
  /** Why a structural unit is structural. */
  refactorings: z.array(z.enum(REFACTORINGS)),
  component: z.string(),
  /** The unit's own code, not the file's. */
  before: z.string().max(MAX_UNIT_CODE_CHARS).optional(),
  after: z.string().max(MAX_UNIT_CODE_CHARS).optional(),
  labels: UnitLabelsSchema.optional(),
});

export const LinkSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(LINK_TYPES),
});

export const EntryPointSchema = z.object({
  unitId: z.string(),
  type: z.enum(ENTRY_POINTS),
  /** What reaches it from outside, when the framework says: `POST /api/orders`, a page's path. */
  route: z.object({ method: z.string().optional(), path: z.string().optional() }).optional(),
});

export const ConcernSchema = z.object({
  id: z.string(),
  unitIds: z.array(z.string()).min(1),
  importance: z.number().nonnegative(),
  rank: z.number().int().positive(),
});

export const SentenceOriginSchema = z.union([
  z.literal("description"),
  z.templateLiteral(["issue#", z.string().regex(/^[1-9][0-9]*$/)]),
  z.templateLiteral(["commit:", z.string().regex(/^[0-9a-f]{7,40}$/)]),
]);

export const SentenceSchema = z.object({
  /** `${origin}:${index}`, counted from 0 within the origin. */
  id: z.string(),
  origin: SentenceOriginSchema,
  text: z.string().min(1),
  class: z.enum(SENTENCE_CLASSES).optional(),
  /** As written in the text ("10%", "1,000"), never computed. */
  numbers: z.array(z.string()),
});

export const FactSchema = z.object({
  group: z.enum(FACT_GROUPS),
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  /** Unit or sentence ids. */
  sources: z.array(z.string()).min(1),
});

export const ExcludedSchema = z.object({
  file: z.string().min(1),
  reason: z.enum(EXCLUDED_REASONS),
});

const PrRefSchema = z.object({
  fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  number: z.number().int().positive(),
  headSha: z.string().min(7),
});

const contextShape = {
  version: z.literal(CONTEXT_VERSION),
  labelSetVersion: z.literal(LABEL_SET_VERSION),
  pr: PrRefSchema,
  /** The AST diff was unavailable and a line diff was used. */
  degraded: z.boolean(),
  truncated: z.boolean(),
  units: z.array(ChangeUnitSchema),
  links: z.array(LinkSchema),
  entryPoints: z.array(EntryPointSchema),
  concerns: z.array(ConcernSchema),
  sentences: z.array(SentenceSchema),
  facts: z.array(FactSchema),
  excluded: z.array(ExcludedSchema),
};

/** Loose view of either variant; a collection left out of an expectation is not checked. */
type Referencing = {
  units?: { id?: string; file?: string; name?: string }[];
  sentences?: { id?: string }[];
  concerns?: { id?: string; unitIds?: string[] }[];
  links?: { from?: string; to?: string }[];
  entryPoints?: { unitId?: string }[];
  facts?: { sources?: string[] }[];
  excluded?: { file?: string }[];
};

function checkReferences(value: Referencing, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });

  const unique = (key: "units" | "sentences" | "concerns" | "excluded", field: "id" | "file") => {
    const seen = new Set<string>();
    (value[key] as Record<string, string | undefined>[] | undefined)?.forEach((item, i) => {
      const v = item[field];
      if (v === undefined) return;
      if (seen.has(v)) issue([key, i, field], `duplicate ${field} ${v}`);
      seen.add(v);
    });
    return seen;
  };
  const unitIds = unique("units", "id");
  const sentenceIds = unique("sentences", "id");
  unique("concerns", "id");
  unique("excluded", "file");

  value.units?.forEach((u, i) => {
    if (u.id === undefined || u.file === undefined || u.name === undefined) return;
    const id = `${u.file}#${u.name}`;
    if (u.id !== id) issue(["units", i, "id"], `id ${u.id} is not ${id}`);
  });

  if (value.units) {
    const unit = (id: string | undefined, path: (string | number)[]) => {
      if (id !== undefined && !unitIds.has(id)) issue(path, `unknown unit ${id}`);
    };
    value.links?.forEach((l, i) => {
      unit(l.from, ["links", i, "from"]);
      unit(l.to, ["links", i, "to"]);
    });
    value.entryPoints?.forEach((e, i) => unit(e.unitId, ["entryPoints", i, "unitId"]));
    value.concerns?.forEach((c, i) =>
      c.unitIds?.forEach((id, j) => unit(id, ["concerns", i, "unitIds", j])),
    );
  }

  if (value.units && value.sentences) {
    value.facts?.forEach((f, i) =>
      f.sources?.forEach((id, j) => {
        if (!unitIds.has(id) && !sentenceIds.has(id)) {
          issue(["facts", i, "sources", j], `unknown unit or sentence ${id}`);
        }
      }),
    );
  }
}

export const ContextSchema = z.object(contextShape).superRefine(checkReferences);

/** An expectation for tests: every field optional at every level, same reference checks. */
export const ContextExpectationSchema = z
  .object({
    ...contextShape,
    pr: PrRefSchema.partial(),
    units: z.array(
      ChangeUnitSchema.extend({
        labels: UnitLabelsSchema.extend({
          confidence: ConfidenceSchema.partial(),
          source: LabelSourceSchema.partial(),
        }).partial(),
      }).partial(),
    ),
    links: z.array(LinkSchema.partial()),
    entryPoints: z.array(EntryPointSchema.partial()),
    concerns: z.array(ConcernSchema.partial()),
    sentences: z.array(SentenceSchema.partial()),
    facts: z.array(FactSchema.partial()),
    excluded: z.array(ExcludedSchema.partial()),
  })
  .partial()
  .superRefine(checkReferences);

export type UnitLabels = z.infer<typeof UnitLabelsSchema>;
export type ChangeUnit = z.infer<typeof ChangeUnitSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type EntryPoint = z.infer<typeof EntryPointSchema>;
export type Concern = z.infer<typeof ConcernSchema>;
export type Sentence = z.infer<typeof SentenceSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type Excluded = z.infer<typeof ExcludedSchema>;
export type Context = z.infer<typeof ContextSchema>;
export type ContextExpectation = z.infer<typeof ContextExpectationSchema>;
