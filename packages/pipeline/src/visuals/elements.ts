import type { Visual } from "@kiasm-tech/star-catch-contracts";

export interface Element {
  id: string;
  label: string;
}

/** The elements a visual reveals one by one, each on the narration's mark (spec §8: "triggered by a word"). */
export function revealable(visual: Visual): Element[] {
  switch (visual.type) {
    case "titleCard":
    case "recap":
      return [];
    case "beforeAfterSplit":
      return [...visual.data.before.items, ...visual.data.after.items].map((i) => ({ id: i.id, label: i.text }));
    case "componentMap":
    case "architectureMorph":
    case "dataFlow":
      return "nodes" in visual.data ? visual.data.nodes.map((n) => ({ id: n.id, label: n.label })) : visual.data.places;
    case "contractCard":
      return visual.data.items.map((i) => ({ id: i.id, label: i.label }));
    case "dataModelDiff":
      return visual.data.entities.flatMap((e) => [{ id: e.id, label: e.label }, ...e.fields.map((f) => ({ id: f.id, label: `${e.label}.${f.name}` }))]);
    case "systemSequenceDiagram":
      return [...visual.data.messages, ...visual.data.outcomes].map((m) => ({ id: m.id, label: m.label }));
    case "sequenceDiagram":
      return visual.data.messages.map((m) => ({ id: m.id, label: m.label }));
    case "stateMachine":
      return visual.data.states.map((s) => ({ id: s.id, label: s.label }));
    case "decisionDiagram":
      return [visual.data.before, visual.data.after].flatMap((c) => (c ? [{ id: c.id, label: c.condition }] : []));
    case "impactRings":
      return visual.data.rings.flatMap((r) => r.items);
    case "checklist":
      return visual.data.items;
    case "riskCards":
      return visual.data.cards.map((c) => ({ id: c.id, label: c.risk }));
    case "userJourney":
      return visual.data.steps.map((s) => ({ id: s.id, label: s.label }));
    case "featureMap":
      return visual.data.areas.map((a) => ({ id: a.id, label: a.label }));
    case "metricCard":
      return [{ id: visual.data.id, label: `${visual.data.value} ${visual.data.label}` }];
  }
}

/** Every id a visual carries, revealable or not: a mark may only name one of these. */
export function elementIds(visual: Visual): Set<string> {
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        if (key === "id" && typeof inner === "string") ids.add(inner);
        else walk(inner);
      }
    }
  };
  walk(visual.data);
  return ids;
}
