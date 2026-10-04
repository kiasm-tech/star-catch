/** Concerns (pr-analysis.md §4): changed units grouped by their links, ranked by importance. */
import type { ChangeUnit, Concern, EntryPoint, Link, Visibility } from "@kiasm-tech/star-catch-contracts";

const VISIBILITY_WEIGHT: Record<Visibility, number> = { user: 4, apiConsumer: 3, operator: 2, internal: 1 };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentions(text: string, name: string): boolean {
  const last = name.split(".").at(-1)!;
  return last.length >= 3 && new RegExp(`\\b${escape(last)}\\b`).test(text);
}

/**
 * Linked units form a concern (a test joins what it covers, a doc section what it names); a stray
 * joins the concern that shares its component, or forms one with the other strays there. Importance is the highest visibility times reach
 * (1 + entry points + callers); ties go to the larger concern, then to the earlier one.
 */
export function concernsOf(units: ChangeUnit[], links: Link[], entryPoints: EntryPoint[]): Concern[] {
  const changed = units.filter((u) => u.verdict !== "notAChange");
  const index = new Map(changed.map((u, i) => [u.id, i]));
  const parent = changed.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => {
    const [x, y] = [find(a), find(b)];
    if (x !== y) parent[Math.max(x, y)] = Math.min(x, y);
  };

  const linked = new Set<number>();
  for (const link of links) {
    const [a, b] = [index.get(link.from), index.get(link.to)];
    if (a === undefined || b === undefined) continue;
    join(a, b);
    linked.add(a).add(b);
  }
  changed.forEach((unit, i) => {
    if (linked.has(i) || unit.labels?.kind !== "documentation") return;
    const text = unit.after ?? unit.before ?? "";
    const named = changed.findIndex((o, j) => j !== i && o.labels?.kind !== "documentation" && mentions(text, o.name));
    if (named < 0) return;
    join(i, named);
    linked.add(i);
  });
  const byComponent = new Map<string, number>();
  changed.forEach((unit, i) => {
    if (linked.has(i) && !byComponent.has(unit.component)) byComponent.set(unit.component, i);
  });
  changed.forEach((unit, i) => {
    if (linked.has(i)) return;
    const other = byComponent.get(unit.component);
    if (other === undefined) byComponent.set(unit.component, i);
    else join(other, i);
  });

  const groups = new Map<number, number[]>();
  changed.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const entered = new Set(entryPoints.map((e) => e.unitId));
  const scored = [...groups.values()].map((members) => {
    const ids = new Set(members.map((i) => changed[i].id));
    const callers = new Set(links.filter((l) => l.type === "calls" && ids.has(l.to)).map((l) => l.from));
    const reach = 1 + [...ids].filter((id) => entered.has(id)).length + callers.size;
    const visibility = Math.max(...members.map((i) => VISIBILITY_WEIGHT[changed[i].labels?.visibility ?? "internal"]));
    return { members, importance: visibility * reach };
  });
  scored.sort((a, b) => b.importance - a.importance || b.members.length - a.members.length || a.members[0] - b.members[0]);
  return scored.map(({ members, importance }, i) => ({
    id: `concern-${i + 1}`,
    unitIds: members.map((m) => changed[m].id),
    importance,
    rank: i + 1,
  }));
}
