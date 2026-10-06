/** The words a visual shows, by element id: what a writer may relabel at its cut's level. */
import type { Cut, Visual } from "@kiasm-tech/star-catch-contracts";

export interface Label {
  id: string;
  text: string;
  /** The schema's limit for this field: 80 for a label, 160 for a sentence. */
  max: number;
}

const L = 80;
const S = 160;

/** Every relabelable field, in reading order. The technical cut keeps code where code is the point (rule conditions). */
export function labelsOf(visual: Visual, cut: Cut): Label[] {
  switch (visual.type) {
    case "titleCard":
      return cut === "business" ? [{ id: "title", text: visual.data.title, max: S }] : [];
    case "beforeAfterSplit":
      return [...visual.data.before.items, ...visual.data.after.items].map((i) => ({ id: i.id, text: i.text, max: S }));
    case "componentMap":
    case "architectureMorph":
      return visual.data.nodes.map((n) => ({ id: n.id, text: n.label, max: L }));
    case "contractCard":
      return visual.data.items.map((i) => ({ id: i.id, text: i.label, max: L }));
    case "systemSequenceDiagram":
      return [...visual.data.messages, ...visual.data.outcomes].map((m) => ({ id: m.id, text: m.label, max: L }));
    case "sequenceDiagram":
      return visual.data.messages.map((m) => ({ id: m.id, text: m.label, max: L }));
    case "stateMachine":
      return visual.data.states.map((s) => ({ id: s.id, text: s.label, max: L }));
    case "decisionDiagram":
      return [
        { id: visual.data.subject.id, text: visual.data.subject.label, max: L },
        ...(cut === "business" ? [visual.data.before, visual.data.after].flatMap((c) => (c ? [{ id: c.id, text: c.condition, max: S }] : [])) : []),
      ];
    case "dataFlow":
      return visual.data.places.map((p) => ({ id: p.id, text: p.label, max: L }));
    case "impactRings":
      return [{ id: visual.data.center.id, text: visual.data.center.label, max: L }, ...visual.data.rings.flatMap((r) => r.items.map((i) => ({ id: i.id, text: i.label, max: L })))];
    case "checklist":
      return visual.data.items.map((i) => ({ id: i.id, text: i.label, max: S }));
    case "riskCards":
      return visual.data.cards.map((c) => ({ id: c.id, text: c.risk, max: S }));
    case "userJourney":
      return visual.data.steps.map((s) => ({ id: s.id, text: s.label, max: L }));
    case "featureMap":
      return visual.data.areas.map((a) => ({ id: a.id, text: a.label, max: L }));
    case "metricCard":
      return [{ id: visual.data.id, text: visual.data.label, max: S }];
    case "dataModelDiff":
    case "recap":
      return [];
  }
}

/** The visual with each relabelable field passed through `to`; everything else untouched. */
export function mapLabels(visual: Visual, cut: Cut, to: (id: string, text: string) => string): Visual {
  const ids = new Set(labelsOf(visual, cut).map((l) => l.id));
  const as = <T extends { id: string }>(item: T, key: keyof T): T => (ids.has(item.id) ? { ...item, [key]: to(item.id, item[key] as string) } : item);
  switch (visual.type) {
    case "titleCard":
      return ids.has("title") ? { ...visual, data: { ...visual.data, title: to("title", visual.data.title) } } : visual;
    case "beforeAfterSplit": {
      const side = (s: typeof visual.data.before) => ({ ...s, items: s.items.map((i) => as(i, "text")) });
      return { ...visual, data: { before: side(visual.data.before), after: side(visual.data.after) } };
    }
    case "componentMap":
      return { ...visual, data: { ...visual.data, nodes: visual.data.nodes.map((n) => as(n, "label")) } };
    case "architectureMorph":
      return { ...visual, data: { ...visual.data, nodes: visual.data.nodes.map((n) => as(n, "label")) } };
    case "contractCard":
      return { ...visual, data: { items: visual.data.items.map((i) => as(i, "label")) } };
    case "systemSequenceDiagram":
      return { ...visual, data: { ...visual.data, messages: visual.data.messages.map((m) => as(m, "label")), outcomes: visual.data.outcomes.map((o) => as(o, "label")) } };
    case "sequenceDiagram":
      return { ...visual, data: { ...visual.data, messages: visual.data.messages.map((m) => as(m, "label")) } };
    case "stateMachine":
      return { ...visual, data: { ...visual.data, states: visual.data.states.map((s) => as(s, "label")) } };
    case "decisionDiagram":
      return {
        ...visual,
        data: {
          subject: as(visual.data.subject, "label"),
          before: visual.data.before && as(visual.data.before, "condition"),
          after: as(visual.data.after, "condition"),
        },
      };
    case "dataFlow":
      return { ...visual, data: { ...visual.data, places: visual.data.places.map((p) => as(p, "label")) } };
    case "impactRings":
      return { ...visual, data: { center: as(visual.data.center, "label"), rings: visual.data.rings.map((r) => ({ ...r, items: r.items.map((i) => as(i, "label")) })) } };
    case "checklist":
      return { ...visual, data: { ...visual.data, items: visual.data.items.map((i) => as(i, "label")) } };
    case "riskCards":
      return { ...visual, data: { cards: visual.data.cards.map((c) => as(c, "risk")) } };
    case "userJourney":
      return { ...visual, data: { steps: visual.data.steps.map((s) => as(s, "label")) } };
    case "featureMap":
      return { ...visual, data: { areas: visual.data.areas.map((a) => as(a, "label")) } };
    case "metricCard":
      return as(visual.data, "label") === visual.data ? visual : { ...visual, data: as(visual.data, "label") };
    case "dataModelDiff":
    case "recap":
      return visual;
  }
}
