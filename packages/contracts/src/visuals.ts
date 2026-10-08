/**
 * Visual data (docs/spec-update-structure.md §8): what each visual shows, with stable element ids for
 * the narration's marks and layout already computed, so rendering never lays anything out.
 * Coordinates are in a 1000 × 562 canvas (16:9).
 */
import { z } from "zod";
import { CHAPTERS, CUTS } from "./script.js";

export const CANVAS = { width: 1000, height: 562 } as const;
/** About seven elements per diagram (§8); more and it's split or trimmed by rank. */
export const MAX_PRIMARY = 7;
/** Changed files listed under a component: enough to place the change, few enough to read. */
export const MAX_FILES = 4;

const id = z.string().min(1);
const label = z.string().min(1).max(80);
const sentence = z.string().min(1).max(160);
const Box = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() });
const Edge = z.object({ id, from: id, to: id, label: label.optional() });

const atMost = <T>(count: (data: T) => number, what: string) =>
  [(data: T) => count(data) <= MAX_PRIMARY, { message: `at most ${MAX_PRIMARY} ${what}` }] as const;

const lines = { additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative() };

/** Kinds of file a change is counted by: tests, migrations, docs and config apart from the code. */
export const FILE_KINDS = ["code", "tests", "migrations", "docs", "config"] as const;

/** A PR's change by the numbers: files by status and kind, the biggest file, its commits and their authors. */
export const ChangeStatsSchema = z.object({
  files: z.object({ added: z.number().int().nonnegative(), modified: z.number().int().nonnegative(), removed: z.number().int().nonnegative(), renamed: z.number().int().nonnegative() }),
  /** Kinds with any lines, most lines first. */
  kinds: z.array(z.object({ kind: z.enum(FILE_KINDS), ...lines })).max(FILE_KINDS.length),
  largest: z.object({ file: z.string(), ...lines }).optional(),
  commits: z.number().int().nonnegative(),
  /** Commit authors, most commits first; empty when the commits don't say who made them. */
  contributors: z.array(z.object({ login: z.string(), commits: z.number().int().nonnegative() })).max(10),
  labels: z.array(z.string()).max(8),
  /** Issues the PR says it closes. */
  closes: z.array(z.number().int().positive()).max(5),
});

export type ChangeStats = z.infer<typeof ChangeStatsSchema>;

export const TitleCardSchema = z.object({
  pr: z.object({ fullName: z.string(), number: z.number().int().positive() }),
  title: sentence,
  author: z.string().optional(),
  cut: z.enum(CUTS),
  /** Since 0.10.0: the PR's head branch. */
  branch: z.string().optional(),
  /** Since 0.10.0: how big the PR is, lockfiles and generated files left out. */
  size: z
    .object({ files: z.number().int().nonnegative(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative() })
    .optional(),
  /** Since 0.11.0: what the size is made of, and who made it. Same files as `size`. */
  change: ChangeStatsSchema.optional(),
});

const SplitSide = z.object({ label, items: z.array(z.object({ id, text: sentence })).max(3) });
export const BeforeAfterSplitSchema = z.object({ before: SplitSide, after: SplitSide });

/** One change inside a component, for a map with a single component: the box opens to show what moved. */
const ComponentChange = z.object({ file: z.string().min(1).max(200), name: label, change: z.enum(["added", "removed", "changed", "renamed", "moved"]) });

/**
 * Boxes are components; `changed` ones are lit, `focus` marks the draft appendix's top concerns,
 * `files` are the changed files in it (repo paths), `changes` what changed in them when it's the only one.
 */
export const ComponentMapSchema = z
  .object({
    nodes: z.array(
      z.object({
        id,
        label,
        box: Box,
        changed: z.boolean(),
        focus: z.boolean().optional(),
        files: z.array(z.string().min(1).max(200)).max(MAX_FILES).optional(),
        changes: z.array(ComponentChange).max(MAX_PRIMARY).optional(),
      }),
    ),
    edges: z.array(Edge),
  })
  .refine(...atMost((d: { nodes: unknown[] }) => d.nodes.length, "components"));

const MorphNode = z.object({ id, label, box: Box, state: z.enum(["kept", "added", "removed"]) });
/** One node set, drawn twice: `before` hides added nodes, `after` hides removed ones. */
export const ArchitectureMorphSchema = z
  .object({ nodes: z.array(MorphNode), before: z.array(Edge), after: z.array(Edge) })
  .refine(...atMost((d: { nodes: unknown[] }) => d.nodes.length, "parts"));

const Change = z.enum(["added", "removed", "changed"]);

/** One part of a declaration that changed: a field, a parameter, what it returns, a union alternative. */
const ContractMember = z.object({ id, name: label, before: sentence.nullable(), after: sentence.nullable(), change: Change });

export const ContractCardSchema = z
  .object({
    items: z.array(
      z.object({
        id,
        label,
        /** The declaration's first line, before and after: what a reader without `members` shows. */
        before: sentence.nullable(),
        after: sentence.nullable(),
        /** Since 0.9.0: whether the declaration itself is new, gone or changed. */
        change: Change.optional(),
        /** Since 0.9.0: every member that changed inside it; absent when its shape couldn't be read. */
        members: z.array(ContractMember).optional(),
      }),
    ),
  })
  .refine(...atMost((d: { items: unknown[] }) => d.items.length, "items"));
export const DataModelDiffSchema = z
  .object({
    entities: z.array(z.object({ id, label, change: Change, fields: z.array(z.object({ id, name: label, change: Change })) })),
  })
  .refine(...atMost((d: { entities: { fields: unknown[] }[] }) => d.entities.reduce((n, e) => n + 1 + e.fields.length, 0), "entities and fields"));

const Participant = z.object({ id, label, x: z.number() });
const Message = z.object({ id, from: id, to: id, label });

/** The product as one box between who reaches it and anything it reaches out to. */
export const SystemSequenceDiagramSchema = z
  .object({
    participants: z.array(Participant.extend({ role: z.enum(["actor", "system", "external"]) })),
    messages: z.array(Message),
    outcomes: z.array(z.object({ id, label, kind: z.enum(["ok", "refused", "error"]) })),
  })
  .refine(...atMost((d: { messages: unknown[]; outcomes: unknown[] }) => d.messages.length + d.outcomes.length, "messages and outcomes"));

/** Components as lifelines, calls between them in order. */
export const SequenceDiagramSchema = z
  .object({ participants: z.array(Participant), messages: z.array(Message) })
  .refine(...atMost((d: { participants: unknown[] }) => d.participants.length, "lifelines"))
  .refine(...atMost((d: { messages: unknown[] }) => d.messages.length, "messages"));

export const StateMachineSchema = z
  .object({ states: z.array(z.object({ id, label, box: Box })), transitions: z.array(Edge), path: z.array(id) })
  .refine(...atMost((d: { states: unknown[] }) => d.states.length, "states"));

/** The condition that decides the outcome, as it was and as it is. */
export const DecisionDiagramSchema = z.object({
  subject: z.object({ id, label }),
  before: z.object({ id, condition: sentence }).nullable(),
  after: z.object({ id, condition: sentence }),
});

export const DataFlowSchema = z
  .object({ places: z.array(z.object({ id, label, box: Box })), arrows: z.array(Edge) })
  .refine(...atMost((d: { places: unknown[] }) => d.places.length, "places"));

export const ImpactRingsSchema = z
  .object({
    center: z.object({ id, label }),
    rings: z.array(z.object({ id, label, items: z.array(z.object({ id, label })) })),
  })
  .refine(...atMost((d: { rings: { items: unknown[] }[] }) => d.rings.reduce((n, r) => n + r.items.length, 0), "dependents"));

/** `more` counts what didn't fit, so the narration can say "and three more". */
export const ChecklistSchema = z
  .object({ items: z.array(z.object({ id, label: sentence })), more: z.number().int().nonnegative() })
  .refine(...atMost((d: { items: unknown[] }) => d.items.length, "items"));

export const RISK_KINDS = ["migration", "flag", "config", "breaking", "untested", "behaviour"] as const;
export const RiskCardsSchema = z
  .object({ cards: z.array(z.object({ id, kind: z.enum(RISK_KINDS), risk: sentence, mitigation: sentence.nullable() })) })
  .refine(...atMost((d: { cards: unknown[] }) => d.cards.length, "cards"));

export const UserJourneySchema = z
  .object({ steps: z.array(z.object({ id, label, changed: z.boolean() })) })
  .refine(...atMost((d: { steps: unknown[] }) => d.steps.length, "steps"));

export const FeatureMapSchema = z
  .object({ areas: z.array(z.object({ id, label, touched: z.boolean() })) })
  .refine(...atMost((d: { areas: unknown[] }) => d.areas.length, "areas"));

/** One real number, as written, with the sentence it came from. */
export const MetricCardSchema = z.object({ id, value: z.string().min(1), label: sentence, source: id });

export const RecapSchema = z.object({ chapters: z.array(z.object({ id: z.enum(CHAPTERS), title: label })) });

/** The visuals the sections of §6–§7 use; the rest of §8's catalogue comes with task 11. */
export const VisualSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("titleCard"), data: TitleCardSchema }),
  z.object({ type: z.literal("beforeAfterSplit"), data: BeforeAfterSplitSchema }),
  z.object({ type: z.literal("componentMap"), data: ComponentMapSchema }),
  z.object({ type: z.literal("architectureMorph"), data: ArchitectureMorphSchema }),
  z.object({ type: z.literal("contractCard"), data: ContractCardSchema }),
  z.object({ type: z.literal("dataModelDiff"), data: DataModelDiffSchema }),
  z.object({ type: z.literal("systemSequenceDiagram"), data: SystemSequenceDiagramSchema }),
  z.object({ type: z.literal("sequenceDiagram"), data: SequenceDiagramSchema }),
  z.object({ type: z.literal("stateMachine"), data: StateMachineSchema }),
  z.object({ type: z.literal("decisionDiagram"), data: DecisionDiagramSchema }),
  z.object({ type: z.literal("dataFlow"), data: DataFlowSchema }),
  z.object({ type: z.literal("impactRings"), data: ImpactRingsSchema }),
  z.object({ type: z.literal("checklist"), data: ChecklistSchema }),
  z.object({ type: z.literal("riskCards"), data: RiskCardsSchema }),
  z.object({ type: z.literal("userJourney"), data: UserJourneySchema }),
  z.object({ type: z.literal("featureMap"), data: FeatureMapSchema }),
  z.object({ type: z.literal("metricCard"), data: MetricCardSchema }),
  z.object({ type: z.literal("recap"), data: RecapSchema }),
]);

export type Visual = z.infer<typeof VisualSchema>;
export type ImplementedVisualType = Visual["type"];
export type VisualData<T extends ImplementedVisualType> = Extract<Visual, { type: T }>["data"];
export const IMPLEMENTED_VISUALS = VisualSchema.options.map((o) => o.shape.type.value) as ImplementedVisualType[];
