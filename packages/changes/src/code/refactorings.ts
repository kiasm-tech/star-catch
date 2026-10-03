import { REFACTORINGS, type Refactoring } from "@kiasm-tech/star-catch-contracts";
import type { ChangeSet, Unit } from "../schema.js";
import type { UnitTokens } from "./compare.js";
import type { Token } from "./tokens.js";

/** A unit with its own tokens, when it came from the code engine. */
export interface Candidate {
  unit: Unit;
  /** Refactorings are looked for within a family: TS, TSX and JS are one. */
  family: string;
  tokens?: UnitTokens;
}

export interface Explained {
  units: Unit[];
  refactorings: ChangeSet["refactorings"];
}

const FAMILIES: Record<string, string> = { typescript: "ecmascript", tsx: "ecmascript", javascript: "ecmascript" };
export const familyOf = (language: string): string => FAMILIES[language] ?? language;

/** `Cart.total (2)` → container `Cart`, simple name `total`; tests split on ` > `. */
function nameParts(name: string): { container: string; simple: string } {
  const plain = name.replace(/ \(\d+\)$/, "");
  const at = Math.max(plain.lastIndexOf(" > "), plain.lastIndexOf("."));
  if (at < 0) return { container: "", simple: plain };
  const separator = plain.startsWith(" > ", at) ? 3 : 1;
  return { container: plain.slice(0, at), simple: plain.slice(at + separator) };
}

const isIdentifier = (token: Token) => token.type.endsWith("identifier");
const QUALIFIER_SEPARATORS = new Set([".", "::"]);

/** The tokens with the unit's own name blanked: equal keys mean equal code up to the name. */
function keyOf(tokens: Token[], simple: string): string {
  return tokens.map((t) => (t.text === simple ? "\u0001" : t.text)).join("\0");
}

const sorted = (types: Iterable<Refactoring>) => REFACTORINGS.filter((r) => new Set(types).has(r));

/**
 * Renames, moves and their callers (changes.md §3.5, §5.5), in that order. Extract, inline and local
 * renames come later. Only exact matches count: anything unproven stays behavioural.
 */
export function explainRefactorings(candidates: Candidate[]): Explained {
  const replaced = new Map<Unit, Unit | null>();
  const refactorings: ChangeSet["refactorings"] = [];
  const renames = new Map<string, { to: string; entry: ChangeSet["refactorings"][number] }>();
  const moves = new Map<string, ChangeSet["refactorings"][number]>();

  // 1. Pair removed with added declarations of the same code, up to the name.
  const added = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.unit.unitKind !== "declaration" || c.unit.changeType !== "added" || !c.tokens?.head) continue;
    const key = `${c.family}\0${keyOf(c.tokens.head, nameParts(c.unit.name).simple)}`;
    added.set(key, [...(added.get(key) ?? []), c]);
  }
  for (const r of candidates) {
    if (r.unit.unitKind !== "declaration" || r.unit.changeType !== "removed" || !r.tokens?.base) continue;
    const from = nameParts(r.unit.name);
    const options = (added.get(`${r.family}\0${keyOf(r.tokens.base, from.simple)}`) ?? []).filter((a) => !replaced.has(a.unit));
    const sameFile = options.filter((a) => a.unit.file === r.unit.file);
    const a = sameFile.find((o) => nameParts(o.unit.name).container === from.container) ?? sameFile[0] ?? options[0];
    if (!a) continue;
    const to = nameParts(a.unit.name);
    const isRename = a.unit.file === r.unit.file && to.container === from.container;
    const types: Refactoring[] = [];
    if (to.simple !== from.simple) types.push("rename");
    if (!isRename) types.push("move");
    const merged: Unit = {
      ...a.unit,
      verdict: "structural",
      changeType: isRename ? "signatureChanged" : "moved",
      refactorings: sorted(types),
      before: r.unit.before,
      span: { base: r.unit.span.base, head: a.unit.span.head },
    };
    replaced.set(r.unit, null);
    replaced.set(a.unit, merged);
    if (to.simple !== from.simple && !renames.has(from.simple)) {
      const entry = { type: "rename" as const, description: `${from.simple} renamed to ${to.simple}`, unitIds: [merged.id] };
      refactorings.push(entry);
      renames.set(from.simple, { to: to.simple, entry });
    }
    if (!isRename) {
      const entry = {
        type: "move" as const,
        description: `${r.unit.name} moved to ${a.unit.name}${a.unit.file === r.unit.file ? "" : ` in ${a.unit.file}`}`,
        unitIds: [merged.id],
      };
      refactorings.push(entry);
      moves.set(to.simple, entry);
      moves.set(from.simple, entry);
    }
  }

  // 2. Callers and imports: equal once renamed names are substituted and qualifiers before moved names dropped.
  const changed = (c: Candidate) =>
    !replaced.has(c.unit) && c.unit.verdict === "behavioural" && c.tokens?.base !== undefined && c.tokens.head !== undefined;
  for (const c of candidates) {
    if (!changed(c)) continue;
    const used = { rename: new Set<string>(), move: new Set<string>() };
    const base = dropQualifiers(substitute(c.tokens!.base!, renames, used.rename), moves, used.move);
    const head = dropQualifiers(c.tokens!.head!, moves, used.move);
    if (base.length !== head.length || base.some((t, i) => t !== head[i])) continue;
    for (const name of used.rename) renames.get(name)!.entry.unitIds.push(c.unit.id);
    for (const name of used.move) addOnce(moves.get(name)!.unitIds, c.unit.id);
    const types: Refactoring[] = [...(used.rename.size > 0 ? ["rename" as const] : []), ...(used.move.size > 0 ? ["move" as const] : [])];
    replaced.set(c.unit, { ...c.unit, verdict: "structural", refactorings: sorted(types) });
  }

  const units = candidates.flatMap(({ unit }) => {
    const next = replaced.get(unit);
    return next === null ? [] : [next ?? unit];
  });
  return { units, refactorings };
}

function addOnce(ids: string[], id: string) {
  if (!ids.includes(id)) ids.push(id);
}

/** Token texts with renamed identifiers swapped for their new names. */
function substitute(tokens: Token[], renames: Map<string, { to: string }>, used: Set<string>): Token[] {
  return tokens.map((t) => {
    const rename = isIdentifier(t) ? renames.get(t.text) : undefined;
    if (!rename) return t;
    used.add(t.text);
    return { ...t, text: rename.to };
  });
}

/** Texts without `X.` / `X::` / `this.` / `self.` right before a moved name. */
function dropQualifiers(tokens: Token[], moves: Map<string, unknown>, used: Set<string>): string[] {
  const texts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 2];
    if (next && QUALIFIER_SEPARATORS.has(tokens[i + 1].text) && moves.has(next.text) && (isIdentifier(tokens[i]) || tokens[i].type === "this")) {
      used.add(next.text);
      i += 1;
      continue;
    }
    texts.push(tokens[i].text);
  }
  return texts;
}
