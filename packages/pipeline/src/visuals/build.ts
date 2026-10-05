/** Each section's visual data, from the context alone (spec-update-structure.md §6–§8). */
import {
  MAX_FILES,
  MAX_PRIMARY,
  type ChangeUnit,
  type Context,
  type Cut,
  type DraftSectionId,
  type EntryPoint,
  type SectionId,
  type SectionPlan,
  type Visual,
} from "@kiasm-tech/star-catch-contracts";
import { CHAPTER_TITLES } from "../script/sections.js";
import { FactIndex } from "../script/facts-index.js";
import { lanes, rows } from "./layout.js";
import { clip, humanize, plainTitle, testTitle } from "./words.js";

/** What a visual may say about the PR itself; never its state (open or merged). */
export interface PrInfo {
  fullName: string;
  number: number;
  title: string;
  author?: string;
}

export interface VisualInput {
  context: Context;
  pr: PrInfo;
  cut: Cut;
  /** The cut's plan, for the recap's chapters. */
  plan: SectionPlan;
}

export interface Built {
  visual: Visual;
  /** What had to be dropped to stay readable, for the script's flags. */
  flags: string[];
}

const ACTOR: Record<EntryPoint["type"], { technical: string; business: string }> = {
  page: { technical: "User", business: "You" },
  apiRoute: { technical: "API client", business: "Your app" },
  exportedApi: { technical: "Calling code", business: "Your app" },
  command: { technical: "Operator", business: "Your team" },
  job: { technical: "Scheduler", business: "A scheduled run" },
};

class Source {
  readonly facts: FactIndex;
  private readonly units: Map<string, ChangeUnit>;
  private readonly rank: Map<string, number>;

  constructor(readonly context: Context) {
    this.facts = new FactIndex(context);
    this.units = new Map(context.units.map((u) => [u.id, u]));
    this.rank = new Map(context.concerns.flatMap((c) => c.unitIds.map((id) => [id, c.rank] as const)));
  }

  unit(id: string): ChangeUnit | undefined {
    return this.units.get(id);
  }

  /** The units a fact cites, most important concern first, then in context order. */
  unitsOf(group: Parameters<FactIndex["list"]>[0], key?: string): ChangeUnit[] {
    const ids = [...new Set(this.facts.list(group, key).flatMap((f) => f.sources))];
    return this.ranked(ids.flatMap((id) => this.unit(id) ?? []));
  }

  ranked(units: ChangeUnit[]): ChangeUnit[] {
    const order = new Map(this.context.units.map((u, i) => [u.id, i]));
    return [...units].sort((a, b) => (this.rank.get(a.id) ?? 99) - (this.rank.get(b.id) ?? 99) || order.get(a.id)! - order.get(b.id)!);
  }

  sentences(cls: string): Context["sentences"] {
    return this.context.sentences.filter((s) => s.class === cls);
  }

  /** Sentences people wrote as prose: the description and issues, not commit subjects. */
  prose(cls: string): Context["sentences"] {
    return this.sentences(cls).filter((s) => !s.origin.startsWith("commit:"));
  }

  /** What the change does, in the PR's words: the rationale, else a behaviour sentence. */
  statement(): Context["sentences"][number] | undefined {
    return [...this.prose("rationale"), ...this.prose("behaviour")][0];
  }

  /** The changed entry points, most important concern first. */
  entries(): { entry: EntryPoint; unit: ChangeUnit }[] {
    const found = this.context.entryPoints.flatMap((entry) => {
      const unit = this.unit(entry.unitId);
      return unit && unit.verdict !== "notAChange" ? [{ entry, unit }] : [];
    });
    const ranked = this.ranked(found.map((f) => f.unit));
    return ranked.map((u) => found.find((f) => f.unit.id === u.id)!);
  }
}

/** Keeps the first `MAX_PRIMARY`, saying what was dropped. */
function top<T>(items: T[], what: string, flags: string[], max = MAX_PRIMARY): T[] {
  if (items.length > max) flags.push(`kept the first ${max} of ${items.length} ${what}`);
  return items.slice(0, max);
}

const repoName = (fullName: string) => fullName.split("/").at(-1)!;
const routeLabel = (entry: EntryPoint, unit: ChangeUnit) =>
  entry.route ? [entry.route.method, entry.route.path].filter(Boolean).join(" ") : humanize(unit.name);

/** Responses and errors written in the entry point's code: `new Response("Too many requests", { status: 429 })`. */
export function outcomesOf(code: string): { label: string; kind: "ok" | "refused" | "error" }[] {
  const outcomes: { label: string; kind: "ok" | "refused" | "error" }[] = [];
  const kindOf = (status: number) => (status >= 500 ? "error" : status >= 400 ? "refused" : "ok");
  for (const [, , text, status] of code.matchAll(/new (?:Next)?Response\((["'`])(.+?)\1\s*,\s*\{[^}]*status:\s*(\d{3})/g)) {
    outcomes.push({ label: clip(`${status} ${text}`), kind: kindOf(Number(status)) });
  }
  for (const [, status] of code.matchAll(/\.status\((\d{3})\)|HTTPException\(\s*status_code\s*=\s*(\d{3})/g)) {
    if (status) outcomes.push({ label: status, kind: kindOf(Number(status)) });
  }
  for (const [, , text] of code.matchAll(/throw new \w*Error\((["'`])(.+?)\1/g)) outcomes.push({ label: clip(text!), kind: "refused" });
  if (/(?:Next)?Response\.json\(|res\.json\(|return\s+jsonify\(/.test(code)) outcomes.push({ label: "200 OK", kind: "ok" });
  return outcomes.filter((o, i) => outcomes.findIndex((p) => p.label === o.label) === i);
}

/** The condition a rule change touched, before and after: the first `if` or ternary test that differs. */
export function changedCondition(before: string | undefined, after: string | undefined): { before: string | null; after: string } | null {
  const tests = (code = "") =>
    [...code.matchAll(/\bif\s*\(\s*(.+?)\s*\)\s*(?:\{|return|throw|$)|\bif\s+(.+?):\s*$|\(?([^?\n;=]+?)\)?\s*\?\s*[^:\n]+:/gm)].map((m) =>
      (m[1] ?? m[2] ?? m[3]!).trim(),
    );
  const was = tests(before);
  const now = tests(after);
  const index = now.findIndex((test, i) => test !== was[i]);
  if (index < 0) return null;
  return { before: was[index] ?? null, after: now[index]! };
}

type Builder = (source: Source, input: VisualInput, flags: string[]) => Visual;

const titleCard: Builder = (_s, { pr, cut }) => ({
  type: "titleCard",
  data: { pr: { fullName: pr.fullName, number: pr.number }, title: clip(plainTitle(pr.title), 160), ...(pr.author && { author: pr.author }), cut },
});

const recap: Builder = (_s, { plan }) => ({
  type: "recap",
  data: { chapters: plan.chapters.map((c) => ({ id: c.id, title: CHAPTER_TITLES[c.id] })) },
});

const beforeAfter: Builder = (s, { pr }, flags) => {
  const after = s.sentences("rationale").length > 0 ? s.sentences("rationale") : s.prose("behaviour");
  const items = (list: Context["sentences"], side: string) =>
    top(list, `${side} sentences`, flags, 3).map((x) => ({ id: `${side}:${x.id}`, text: clip(x.text, 160) }));
  const now = items(after, "after");
  return {
    type: "beforeAfterSplit",
    data: {
      before: { label: "Before", items: items(s.sentences("problem"), "before") },
      after: { label: "Now", items: now.length > 0 ? now : [{ id: "after:title", text: clip(plainTitle(pr.title), 160) }] },
    },
  };
};

const changeWord = (u: ChangeUnit): "added" | "removed" | "changed" | "renamed" | "moved" =>
  u.refactorings.includes("rename") ? "renamed" : u.changeType === "added" || u.changeType === "removed" || u.changeType === "moved" ? u.changeType : "changed";

/** The one box of a single-component map, sized for its files and the changes under them. */
function opened(files: number, changes: number) {
  const w = 560;
  const h = 64 + files * 32 + changes * 30;
  return { x: (1000 - w) / 2, y: Math.max(20, Math.round((562 - h) / 2)), w, h };
}

function componentMap(s: Source, flags: string[], focusUnits: Set<string> = new Set()): Visual {
  const changed = s.ranked(s.context.units.filter((u) => u.verdict !== "notAChange" && u.component !== ""));
  const components = top([...new Set(changed.map((u) => u.component))], "components", flags);
  const of = new Map(changed.map((u) => [u.id, u.component]));
  const edges = new Map<string, { id: string; from: string; to: string }>();
  for (const link of s.context.links) {
    const [from, to] = [of.get(link.from), of.get(link.to)];
    if (link.type !== "calls" || !from || !to || from === to || !components.includes(from) || !components.includes(to)) continue;
    const id = `edge:${from}->${to}`;
    edges.set(id, { id, from: `component:${from}`, to: `component:${to}` });
  }
  const files = new Map(
    components.map((c) => {
      const all = [...new Set(changed.filter((u) => u.component === c).map((u) => u.file))];
      if (all.length > MAX_FILES) flags.push(`kept the first ${MAX_FILES} of ${all.length} files in ${c}`);
      return [c, all.slice(0, MAX_FILES)] as const;
    }),
  );
  // One component opens to show what changed in it; otherwise boxes grow to list their files.
  const only = components.length === 1 ? components[0]! : undefined;
  const changes = only
    ? top(
        changed.filter((u) => u.component === only && u.unitKind !== "file").map((u) => ({ file: u.file, name: clip(humanize(u.name)), change: changeWord(u) })),
        "changes",
        flags,
      )
    : [];
  const most = Math.max(0, ...[...files.values()].map((f) => f.length));
  const boxes = only && changes.length > 0 ? [opened(files.get(only)!.length, changes.length)] : rows(components.length, 72 + most * 30);
  return {
    type: "componentMap",
    data: {
      nodes: components.map((c, i) => ({
        id: `component:${c}`,
        label: c,
        box: boxes[i]!,
        changed: true,
        ...(files.get(c)!.length > 0 && { files: files.get(c)! }),
        ...(c === only && changes.length > 0 && { changes }),
        ...(focusUnits.size > 0 && { focus: changed.some((u) => u.component === c && focusUnits.has(u.id)) }),
      })),
      edges: [...edges.values()],
    },
  };
}

const architectureMorph: Builder = (s, _input, flags) => {
  const added = s.unitsOf("shape", "added");
  const removed = s.unitsOf("shape", "removed");
  const touched = new Set([...added, ...removed].map((u) => u.id));
  const neighbours = s.context.links
    .filter((l) => l.type === "calls" && (touched.has(l.from) || touched.has(l.to)))
    .flatMap((l) => [l.from, l.to])
    .filter((id) => !touched.has(id))
    .flatMap((id) => s.unit(id) ?? []);
  const units = top(s.ranked([...new Map([...added, ...removed, ...neighbours].map((u) => [u.id, u])).values()]), "parts", flags);
  const kept = new Set(units.map((u) => u.id));
  const boxes = rows(units.length);
  const state = (u: ChangeUnit) => (added.includes(u) ? "added" : removed.includes(u) ? "removed" : "kept");
  const edges = s.context.links
    .filter((l) => l.type === "calls" && kept.has(l.from) && kept.has(l.to))
    .map((l) => ({ id: `edge:${l.from}->${l.to}`, from: `unit:${l.from}`, to: `unit:${l.to}`, added: added.some((u) => u.id === l.from || u.id === l.to), removed: removed.some((u) => u.id === l.from || u.id === l.to) }));
  return {
    type: "architectureMorph",
    data: {
      nodes: units.map((u, i) => ({ id: `unit:${u.id}`, label: humanize(u.name), box: boxes[i]!, state: state(u) })),
      before: edges.filter((e) => !e.added).map(({ id, from, to }) => ({ id, from, to })),
      after: edges.filter((e) => !e.removed).map(({ id, from, to }) => ({ id, from, to })),
    },
  };
};

const firstLine = (code: string | undefined) => (code ? clip(code.split("\n")[0]!.replace(/\{\s*$/, "").trim(), 160) : null);

const contractCard: Builder = (s, _input, flags) => {
  const routes = new Map(s.context.entryPoints.map((e) => [e.unitId, e]));
  return {
    type: "contractCard",
    data: {
      items: top(s.unitsOf("contracts", "changed"), "contract changes", flags).map((u) => ({
        id: `contract:${u.id}`,
        label: routes.get(u.id)?.route ? routeLabel(routes.get(u.id)!, u) : humanize(u.name),
        before: firstLine(u.before),
        after: firstLine(u.after),
      })),
    },
  };
};

const dataModelDiff: Builder = (s, _input, flags) => {
  const change = (u: ChangeUnit) => (u.changeType === "added" ? "added" : u.changeType === "removed" ? "removed" : "changed") as "added" | "removed" | "changed";
  const entities = new Map<string, { id: string; label: string; change: "added" | "removed" | "changed"; fields: { id: string; name: string; change: "added" | "removed" | "changed" }[] }>();
  for (const u of s.unitsOf("data")) {
    const [entity, field] = u.name.includes(".") ? [u.name.slice(0, u.name.indexOf(".")), u.name.slice(u.name.indexOf(".") + 1)] : [u.name, undefined];
    const current = entities.get(entity) ?? { id: `entity:${entity}`, label: entity, change: field ? "changed" : change(u), fields: [] };
    if (field) current.fields.push({ id: `field:${entity}.${field}`, name: field, change: change(u) });
    entities.set(entity, current);
  }
  let budget = MAX_PRIMARY;
  const kept = [...entities.values()].flatMap((e) => {
    if (budget <= 0) return [];
    budget -= 1;
    const fields = e.fields.slice(0, budget);
    budget -= fields.length;
    return [{ ...e, fields }];
  });
  if (kept.length < entities.size || kept.some((e, i) => e.fields.length < [...entities.values()][i]!.fields.length)) flags.push("kept the first 7 entities and fields");
  return { type: "dataModelDiff", data: { entities: kept } };
};

const outsideView = (cut: Cut): Builder => (s, { pr }, flags) => {
  const [first] = s.entries();
  const system = { id: "system", label: repoName(pr.fullName), x: 0, role: "system" as const };
  const statement = s.statement();
  const said = statement ? [{ id: `outcome:${statement.id}`, label: clip(statement.text), kind: "ok" as const }] : [];
  if (!first) {
    const [ax, sx] = lanes(2);
    return {
      type: "systemSequenceDiagram",
      data: {
        participants: [
          { id: "actor", label: cut === "business" ? "People using it" : "Calling code", x: ax!, role: "actor" },
          { ...system, x: sx! },
        ],
        messages: [{ id: "message:use", from: "actor", to: "system", label: clip(plainTitle(pr.title)) }],
        outcomes: said,
      },
    };
  }
  const { entry, unit } = first;
  const [ax, sx] = lanes(2);
  const message =
    cut === "business"
      ? entry.type === "page"
        ? `opens the ${humanize(unit.name)}`
        : plainTitle(pr.title)
      : entry.type === "page"
        ? `opens ${entry.route?.path ?? `the ${humanize(unit.name)}`}`
        : routeLabel(entry, unit);
  const outcomes = cut === "business" ? said : top(outcomesOf(unit.after ?? ""), "outcomes", flags, MAX_PRIMARY - 1);
  return {
    type: "systemSequenceDiagram",
    data: {
      participants: [
        { id: "actor", label: ACTOR[entry.type][cut], x: ax!, role: "actor" },
        { ...system, x: sx! },
      ],
      messages: [{ id: `message:${unit.id}`, from: "actor", to: "system", label: clip(message) }],
      outcomes: cut === "business" ? said : outcomes.map((o, i) => ({ id: `outcome:${i}`, ...o })),
    },
  };
};

const sequenceDiagram: Builder = (s, _input, flags) => {
  const flow = s.facts.flows(3).sort((a, b) => (b.value as string[]).length - (a.value as string[]).length)[0]!;
  const path = flow.sources.flatMap((id) => s.unit(id) ?? []);
  const components = top([...new Set(path.map((u) => u.component))], "lifelines", flags);
  const x = lanes(components.length);
  const onPath = new Map(path.map((u, i) => [u.id, i]));
  const calls = s.context.links
    .filter((l) => l.type === "calls" && onPath.has(l.from) && onPath.has(l.to))
    .sort((a, b) => onPath.get(a.to)! - onPath.get(b.to)!);
  const messages = top(
    calls.flatMap((l) => {
      const [from, to] = [s.unit(l.from)!, s.unit(l.to)!];
      if (!components.includes(from.component) || !components.includes(to.component)) return [];
      return [{ id: `message:${l.from}->${l.to}`, from: `component:${from.component}`, to: `component:${to.component}`, label: humanize(to.name) }];
    }),
    "messages",
    flags,
  );
  return {
    type: "sequenceDiagram",
    data: { participants: components.map((c, i) => ({ id: `component:${c}`, label: c, x: x[i]! })), messages },
  };
};

/** The rule others depend on, when callers share one: #921's limiter, not one of its callers. */
function sharedRule(s: Source, group: "rules" | "contracts", key?: string): ChangeUnit | undefined {
  const callers = (u: ChangeUnit) => s.context.links.filter((l) => l.type === "calls" && l.to === u.id).length;
  return [...s.unitsOf(group, key)].sort((a, b) => callers(b) - callers(a))[0];
}

const decision = (cut: Cut): Builder => (s) => {
  const unit = sharedRule(s, "rules", "conditionChanged");
  const condition = unit ? changedCondition(unit.before, unit.after) : null;
  const subject = { id: `rule:${unit?.id ?? "rule"}`, label: unit ? humanize(unit.name) : "the rule" };
  if (cut === "business") {
    // Plain words only: the sentence that states the new rule, never the code.
    const now = condition?.after.match(/\d+(?:\.\d+)?/g) ?? [];
    const was = condition?.before?.match(/\d+(?:\.\d+)?/g) ?? [];
    const mentions = (x: Context["sentences"][number], numbers: string[]) => numbers.some((n) => x.numbers.includes(n));
    const candidates = s.context.sentences.filter((x) => x.class !== "noise" && x.class !== "problem");
    // Best: the sentence that states the old and the new value; then one with the new value.
    const stated = candidates.find((x) => mentions(x, now) && mentions(x, was)) ?? candidates.find((x) => mentions(x, now));
    const fallback = s.statement();
    return {
      type: "decisionDiagram",
      data: { subject, before: null, after: { id: "condition:after", condition: clip((stated ?? fallback)?.text ?? plainTitle(subject.label), 160) } },
    };
  }
  return {
    type: "decisionDiagram",
    data: {
      subject,
      before: condition?.before ? { id: "condition:before", condition: clip(condition.before, 160) } : null,
      after: { id: "condition:after", condition: clip(condition?.after ?? "changed", 160) },
    },
  };
};

const impactRings: Builder = (s, _input, flags) => {
  const callers = s.unitsOf("reach", "callers");
  const called = s.context.links.filter((l) => l.type === "calls" && callers.some((c) => c.id === l.from));
  const counts = new Map<string, number>();
  for (const l of called) counts.set(l.to, (counts.get(l.to) ?? 0) + 1);
  const centre = s.unit([...counts].sort((a, b) => b[1] - a[1])[0]![0])!;
  const outside = [...new Set(callers.map((u) => u.component).filter((c) => c !== centre.component))];
  const items = outside.length > 0 ? outside.map((c) => ({ id: `component:${c}`, label: c })) : callers.filter((u) => u.id !== centre.id).map((u) => ({ id: `unit:${u.id}`, label: humanize(u.name) }));
  return {
    type: "impactRings",
    data: {
      center: { id: `component:${centre.component}`, label: outside.length > 0 ? centre.component : humanize(centre.name) },
      rings: [{ id: "ring:callers", label: "calls it", items: top(items, "dependents", flags) }],
    },
  };
};

const checklist = (items: { id: string; label: string }[], what: string, flags: string[]): Visual => ({
  type: "checklist",
  data: { items: top(items, what, flags).map((i) => ({ id: i.id, label: clip(i.label, 160) })), more: Math.max(0, items.length - MAX_PRIMARY) },
});

const verification: Builder = (s, _input, flags) =>
  checklist(
    s.unitsOf("quality", "tests").filter((u) => u.name.includes(" > ")).map((u) => ({ id: `test:${u.id}`, label: testTitle(u.name) })),
    "tests",
    flags,
  );

const mitigation = (s: Source, word: RegExp) => {
  const found = s.context.sentences.find((x) => x.class !== "noise" && word.test(x.text));
  return found ? clip(found.text, 160) : null;
};

const technicalRisks: Builder = (s, _input, flags) => {
  const names = (units: ChangeUnit[]) => units.map((u) => humanize(u.name)).join(", ");
  const cards = [
    ...(s.facts.has("rollout", "migration") ? [{ id: "risk:migration", kind: "migration" as const, risk: "A data migration runs when this ships", mitigation: mitigation(s, /migrat/i) }] : []),
    ...(s.facts.has("contracts", "breaking") ? [{ id: "risk:breaking", kind: "breaking" as const, risk: `Breaking change: ${names(s.unitsOf("contracts", "breaking"))}`, mitigation: null }] : []),
    ...(s.facts.has("rollout", "gated") ? [{ id: "risk:flag", kind: "flag" as const, risk: "Behind a feature flag until it's switched on", mitigation: null }] : []),
    ...(s.facts.has("rollout", "config") ? [{ id: "risk:config", kind: "config" as const, risk: `Configuration changes: ${names(s.unitsOf("rollout", "config"))}`, mitigation: mitigation(s, /flag|config|default/i) }] : []),
    ...(s.facts.has("quality", "untested") ? [{ id: "risk:untested", kind: "untested" as const, risk: clip(`No test in this change covers: ${names(s.unitsOf("quality", "untested"))}`, 160), mitigation: null }] : []),
  ];
  return { type: "riskCards", data: { cards: top(cards, "risks", flags) } };
};

const businessRisks: Builder = (s, _input, flags) => {
  const subject = (group: "rules" | "contracts") => humanize(sharedRule(s, group)?.name ?? "it");
  const cards = [
    ...(s.facts.has("contracts", "breaking") ? [{ id: "risk:breaking", kind: "breaking" as const, risk: "Existing integrations may need to change", mitigation: null }] : []),
    ...(s.facts.has("rollout", "gated") ? [{ id: "risk:flag", kind: "flag" as const, risk: "It arrives switched off and is turned on later", mitigation: null }] : []),
    // The PR's own statement of what changed; a unit's name would mislead (#921 isn't about "create order").
    ...(s.facts.has("rules") ? [{ id: "risk:rules", kind: "behaviour" as const, risk: s.statement() ? clip(s.statement()!.text, 160) : `How ${subject("rules")} works has changed`, mitigation: null }] : []),
    ...(s.facts.has("contracts", "changed") ? [{ id: "risk:contracts", kind: "behaviour" as const, risk: `What ${subject("contracts")} accepts or returns has changed`, mitigation: null }] : []),
  ];
  return { type: "riskCards", data: { cards: top(cards, "notices", flags) } };
};

const userJourney: Builder = (s, _input, flags) => {
  const screens = s.entries().filter((e) => e.entry.type === "page").map((e) => ({ id: `step:${e.unit.id}`, label: `opens the ${humanize(e.unit.name)}`, changed: false }));
  const problem = s.sentences("problem")[0];
  const steps = [...screens, ...(problem ? [{ id: `step:${problem.id}`, label: clip(problem.text), changed: true }] : [])];
  return { type: "userJourney", data: { steps: top(steps, "steps", flags) } };
};

const featureMap: Builder = (s, _input, flags) => {
  const areas = s.entries().map(({ entry, unit }) => ({
    id: `area:${unit.id}`,
    label: entry.type === "page" ? humanize(unit.name) : (entry.route?.path?.split("/").filter(Boolean).at(-1) ?? humanize(unit.name)),
    touched: true,
  }));
  return { type: "featureMap", data: { areas: top(areas, "areas", flags) } };
};

const metricCard: Builder = (s) => {
  const [value] = s.facts.businessNumbers();
  const sentence = s.context.sentences.find((x) => x.class !== "noise" && x.numbers.includes(value!))!;
  return { type: "metricCard", data: { id: `metric:${sentence.id}:${value}`, value: value!, label: clip(sentence.text, 160), source: sentence.id } };
};

const toDo: Builder = (s, _input, flags) =>
  checklist(s.sentences("instruction").map((x) => ({ id: `todo:${x.id}`, label: x.text })), "actions", flags);

const BUILDERS: Record<SectionId | DraftSectionId, Builder | undefined> & Record<string, Builder | undefined> = {
  title: titleCard,
  headline: titleCard,
  problem: beforeAfter,
  before: userJourney,
  changeMap: (s, _i, flags) => componentMap(s, flags),
  reviewFocus: (s, _i, flags) => componentMap(s, flags, new Set(s.context.concerns.filter((c) => c.rank <= 3).flatMap((c) => c.unitIds))),
  structureChange: architectureMorph,
  contractChange: contractCard,
  dataChange: dataModelDiff,
  fromOutside: outsideView("technical"),
  whatsNew: outsideView("business"),
  howItWorksForYou: outsideView("business"),
  interaction: sequenceDiagram,
  rule: decision("technical"),
  theRuleNow: decision("business"),
  reach: impactRings,
  verification,
  risksRollout: technicalRisks,
  whatToKnow: businessRisks,
  whoItAffects: featureMap,
  inNumbers: metricCard,
  whatYouMayNeedToDo: toDo,
  wrap: recap,
  // No fact carries states or data paths yet, so these sections never qualify.
  lifecycle: undefined,
  dataFlow: undefined,
};

/** A section's visual; throws for the sections no fact can qualify yet. */
export function buildVisual(sectionId: SectionId | DraftSectionId, input: VisualInput): Built {
  const builder = BUILDERS[sectionId];
  if (!builder) throw new Error(`No visual builder for section ${sectionId}`);
  const flags: string[] = [];
  return { visual: builder(new Source(input.context), input, flags), flags: flags.map((f) => `${sectionId}: ${f}`) };
}
