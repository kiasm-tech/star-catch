import { MAX_UNIT_CODE_CHARS, type UnitKind } from "@kiasm-tech/star-catch-contracts";
import type { Unit } from "../schema.js";

/** A positioned part of a file: an SQL statement, a Markdown section. */
export interface Section {
  name: string;
  unitKind: Extract<UnitKind, "schemaEntity" | "docSection">;
  /** Normalised: equal values with different text are `notAChange`. */
  value: string;
  text: string;
  /** 1-based, inclusive. */
  lines: [number, number];
}

const clip = (text: string | undefined) => text?.slice(0, MAX_UNIT_CODE_CHARS);

/** Duplicate names in a file get ` (2)`, ` (3)`, as declarations do. */
export function numbered<T extends { name: string }>(items: T[]): T[] {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const count = (counts.get(item.name) ?? 0) + 1;
    counts.set(item.name, count);
    return count === 1 ? item : { ...item, name: `${item.name} (${count})` };
  });
}

/** 1-based line of a string index. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

type Fields = Omit<Unit, "id" | "name" | "unitKind" | "verdict" | "changeType" | "span"> ;

/** Units from sections paired by name: added, removed, changed, or reformatted (`notAChange`). */
export function compareSections(path: string, base: Section[], head: Section[], fields: Fields): Unit[] {
  const unit = (s: Section, verdict: Unit["verdict"], changeType: Unit["changeType"], extra: Partial<Unit>): Unit => ({
    ...fields,
    id: `${path}#${s.name}`,
    name: s.name,
    unitKind: s.unitKind,
    verdict,
    changeType,
    span: {},
    ...extra,
  });
  const before = new Map(base.map((s) => [s.name, s]));
  const after = new Map(head.map((s) => [s.name, s]));
  const units: Unit[] = [];
  for (const s of head) {
    const old = before.get(s.name);
    if (old && old.text === s.text) continue;
    const span = { ...(old && { base: old.lines }), head: s.lines };
    const extra = { before: clip(old?.text), after: clip(s.text), span };
    if (!old) units.push(unit(s, "behavioural", "added", extra));
    else units.push(unit(s, old.value === s.value ? "notAChange" : "behavioural", "bodyChanged", extra));
  }
  for (const s of base) {
    if (!after.has(s.name)) units.push(unit(s, "behavioural", "removed", { before: clip(s.text), span: { base: s.lines } }));
  }
  return units;
}
