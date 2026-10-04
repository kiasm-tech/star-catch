/** Facts (pr-analysis.md §5): checkable statements, each sourced from units or sentences. */
import {
  CHANGE_TYPES,
  type ChangeUnit,
  type Concern,
  type EntryPoint,
  type Fact,
  type FactGroup,
  type Link,
  type Risk,
  type Sentence,
} from "@kiasm-tech/star-catch-contracts";

export interface FactInput {
  units: ChangeUnit[];
  links: Link[];
  entryPoints: EntryPoint[];
  concerns: Concern[];
  sentences: Sentence[];
}

const unique = (values: string[]) => [...new Set(values)];

/**
 * In a fixed order: groups as in FACT_GROUPS, keys as below, then units and sentences in context
 * order (callers by the rank of the concern they call into). A key with nothing to say is left out. Identity and CI come from the snapshot, not here.
 */
export function factsOf({ units, links, entryPoints, concerns, sentences }: FactInput): Fact[] {
  const changed = units.filter((u) => u.verdict !== "notAChange");
  const behavioural = changed.filter((u) => u.verdict === "behavioural");
  const byId = new Map(changed.map((u) => [u.id, u]));
  const entryOf = new Map(entryPoints.filter((e) => byId.has(e.unitId)).map((e) => [e.unitId, e.type]));
  const kind = (u: ChangeUnit) => u.labels?.kind;
  const risky = (risk: Risk) => changed.filter((u) => u.labels?.risks.includes(risk));
  const facts: Fact[] = [];

  const names = (group: FactGroup, key: string, list: ChangeUnit[], sources = list) => {
    if (list.length) facts.push({ group, key, value: unique(list.map((u) => u.name)), sources: unique(sources.map((u) => u.id)) });
  };
  const flag = (group: FactGroup, key: string, list: ChangeUnit[]) => {
    if (list.length) facts.push({ group, key, value: true, sources: list.map((u) => u.id) });
  };
  const quote = (group: FactGroup, key: string, list: Sentence[]) => {
    for (const s of list) facts.push({ group, key, value: s.text, sources: [s.id] });
  };
  const classed = (c: Sentence["class"]) => sentences.filter((s) => s.class === c);

  quote("intent", "problem", classed("problem"));
  quote("intent", "rationale", classed("rationale"));

  const placed = changed.filter((u) => u.component !== "");
  if (placed.length) {
    facts.push({ group: "shape", key: "components", value: unique(placed.map((u) => u.component)).sort(), sources: placed.map((u) => u.id) });
  }
  names("shape", "added", changed.filter((u) => u.changeType === "added" && kind(u) !== "test"));
  names("shape", "removed", changed.filter((u) => u.changeType === "removed" && kind(u) !== "test"));

  const entered = changed.filter((u) => entryOf.has(u.id));
  if (entered.length) {
    facts.push({ group: "interactions", key: "entryPoints", value: entered.map((u) => `${u.name} (${entryOf.get(u.id)})`), sources: entered.map((u) => u.id) });
  }
  for (const start of entered) {
    const path = [start];
    for (let i = 0; i < path.length; i++) {
      for (const l of links) {
        const next = byId.get(l.to);
        if (l.type === "calls" && l.from === path[i].id && next && !path.includes(next)) path.push(next);
      }
    }
    if (new Set(path.map((u) => u.component)).size >= 2) names("interactions", "flow", path);
  }

  const data = changed.filter((u) => kind(u) === "data");
  for (const type of CHANGE_TYPES) names("data", type, data.filter((u) => u.changeType === type));

  names(
    "contracts",
    "changed",
    behavioural.filter(
      (u) =>
        kind(u) === "interface" ||
        ["apiRoute", "exportedApi"].includes(entryOf.get(u.id) ?? "") ||
        (u.changeType === "signatureChanged" && u.labels?.visibility === "apiConsumer"),
    ),
  );
  names("contracts", "breaking", risky("breaking"));

  names(
    "rules",
    "conditionChanged",
    behavioural.filter(
      (u) => u.changeType === "conditionChanged" && kind(u) === "logic" && ["user", "apiConsumer"].includes(u.labels?.visibility ?? ""),
    ),
  );

  names("users", "screens", changed.filter((u) => kind(u) === "ui" && entryOf.get(u.id) === "page"));

  names("rollout", "config", changed.filter((u) => kind(u) === "configuration"));
  flag("rollout", "migration", risky("dataMigration"));
  flag("rollout", "gated", risky("gated"));
  quote("rollout", "instruction", classed("instruction"));

  names("quality", "tests", changed.filter((u) => kind(u) === "test"));
  const covers = links.filter((l) => l.type === "covers" && byId.has(l.from) && byId.has(l.to));
  names("quality", "covered", covers.map((l) => byId.get(l.to)!), covers.map((l) => byId.get(l.from)!));
  names("quality", "untested", risky("untested"));

  const rankOf = new Map(concerns.flatMap((c) => c.unitIds.map((id) => [id, c.rank] as const)));
  const calls = links
    .filter((l) => l.type === "calls" && byId.get(l.to)?.verdict === "behavioural" && byId.has(l.from))
    .sort((a, b) => (rankOf.get(a.to) ?? Infinity) - (rankOf.get(b.to) ?? Infinity));
  names("reach", "callers", calls.map((l) => byId.get(l.from)!));

  for (const s of sentences) {
    if (s.numbers.length && s.class !== "noise") facts.push({ group: "evidence", key: "numbers", value: s.numbers, sources: [s.id] });
  }
  return facts;
}
