import { REFACTORINGS, type Refactoring } from "@kiasm-tech/star-catch-contracts";
import type { ChangeSet, Unit } from "../schema.js";
import type { Body } from "./bodies.js";
import type { UnitTokens } from "./compare.js";
import { diffTokens } from "./diff.js";
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
 * Renames, moves and their callers, extracts and inlines, then local renames (changes.md §3.5, §5.5),
 * in that order. Only exact matches count: anything unproven stays behavioural.
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

  // 3. Extract and inline: a new function's body replaces statements of a changed one, or the reverse.
  const open = (c: Candidate) => !replaced.has(c.unit);
  for (const kind of ["extract", "inline"] as const) {
    const side = kind === "extract" ? "added" : "removed";
    for (const fn of candidates) {
      if (!open(fn) || fn.unit.unitKind !== "declaration" || fn.unit.changeType !== side) continue;
      const body = kind === "extract" ? fn.tokens?.headBody : fn.tokens?.baseBody;
      if (!body) continue;
      const simple = nameParts(fn.unit.name).simple;
      const sources = candidates.filter((s) => {
        if (s === fn || s.family !== fn.family || !changed(s) || !s.tokens!.baseBody || !s.tokens!.headBody) return false;
        const diff = statementDiff(s.tokens!.baseBody, s.tokens!.headBody);
        if (!diff) return false;
        return replaces(kind === "extract" ? diff : { removed: diff.added, added: diff.removed }, body, simple);
      });
      if (sources.length === 0) continue;
      replaced.set(fn.unit, { ...fn.unit, verdict: "structural", refactorings: [kind] });
      for (const s of sources) replaced.set(s.unit, { ...s.unit, verdict: "structural", refactorings: [kind] });
      const names = sources.map((s) => s.unit.name).join(", ");
      const description = kind === "extract" ? `${fn.unit.name} extracted from ${names}` : `${fn.unit.name} inlined into ${names}`;
      refactorings.push({ type: kind, description, unitIds: [fn.unit.id, ...sources.map((s) => s.unit.id)] });
    }
  }

  // 4. Local renames: the only edits swap names the unit binds itself (parameters, locals), one to one.
  for (const c of candidates) {
    if (!changed(c)) continue;
    const swaps = localRenames(c.tokens!.base!, c.tokens!.head!);
    const bound = (from: string, to: string) => c.tokens!.baseBindings?.has(from) && c.tokens!.headBindings?.has(to);
    if (!swaps || ![...swaps].every(([from, to]) => bound(from, to))) continue;
    replaced.set(c.unit, { ...c.unit, verdict: "structural", refactorings: ["rename"] });
    const list = [...swaps].map(([from, to]) => `${from} renamed to ${to}`).join(", ");
    refactorings.push({ type: "rename", description: `${list} in ${c.unit.name}`, unitIds: [c.unit.id] });
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

const statementKey = (statement: string[]) => statement.join("\0");

/** The statements a changed body lost and gained, from a diff over whole statements. */
function statementDiff(base: Body, head: Body): { removed: string[][]; added: string[][] } | null {
  const diff = diffTokens(base.statements.map(statementKey), head.statements.map(statementKey));
  if (!diff) return null;
  return { removed: diff.deleted.map((i) => base.statements[i]), added: diff.inserted.map((i) => head.statements[i]) };
}

/**
 * Whether `fn` was extracted from the changed body (changes.md §3.5): (1) its statements, but for a
 * trailing `return`, are among the removed ones; (2) every added statement calls it; (3) every other
 * removed statement equals an added one once the call is replaced by what `fn` returns. Inline is
 * the same with removed and added swapped.
 */
function replaces(changed: { removed: string[][]; added: string[][] }, fn: Body, name: string): boolean {
  if (changed.removed.length === 0 || changed.added.length === 0) return false;
  const own = fn.returned ? fn.statements.slice(0, -1) : fn.statements;
  const leftovers = [...changed.removed];
  for (const statement of own) {
    const at = leftovers.findIndex((s) => statementKey(s) === statementKey(statement));
    if (at < 0) return false;
    leftovers.splice(at, 1);
  }
  if (!changed.added.every((s) => callAt(s, name, 0) !== null)) return false;
  if (leftovers.length === 0) return true;
  if (!fn.returned) return false;
  const expanded = new Set(changed.added.map((s) => statementKey(replaceCalls(s, name, fn.returned!))));
  return leftovers.every((s) => expanded.has(statementKey(s)));
}

const RECEIVERS = new Set(["this", "self"]);

/** The span of the next call to `name` from `from`, `this.` / `self.` included; null without one. */
function callAt(tokens: string[], name: string, from: number): { start: number; end: number } | null {
  for (let i = from; i < tokens.length - 1; i++) {
    if (tokens[i] !== name || tokens[i + 1] !== "(") continue;
    const qualified = i >= 2 && QUALIFIER_SEPARATORS.has(tokens[i - 1]) && RECEIVERS.has(tokens[i - 2]);
    let depth = 0;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j] === "(") depth++;
      else if (tokens[j] === ")" && --depth === 0) return { start: qualified ? i - 2 : i, end: j + 1 };
    }
    return null;
  }
  return null;
}

/** Every call to `name` replaced by `returned`. */
function replaceCalls(tokens: string[], name: string, returned: string[]): string[] {
  const out: string[] = [];
  let at = 0;
  for (let call = callAt(tokens, name, 0); call; call = callAt(tokens, name, at)) {
    out.push(...tokens.slice(at, call.start), ...returned);
    at = call.end;
  }
  return [...out, ...tokens.slice(at)];
}

/**
 * The identifier swaps when they are the only edits and map one to one; null otherwise. Identifiers
 * that stay the same count as mappings too, so `a + b` → `a + a` merges two names and isn't a rename.
 */
function localRenames(base: Token[], head: Token[]): Map<string, string> | null {
  if (base.length !== head.length) return null;
  const forward = new Map<string, string>();
  const backward = new Map<string, string>();
  for (let i = 0; i < base.length; i++) {
    const from = base[i];
    const to = head[i];
    if (!isIdentifier(from) || !isIdentifier(to)) {
      if (from.text !== to.text) return null;
      continue;
    }
    if ((forward.get(from.text) ?? to.text) !== to.text || (backward.get(to.text) ?? from.text) !== from.text) return null;
    forward.set(from.text, to.text);
    backward.set(to.text, from.text);
  }
  const swaps = new Map([...forward].filter(([from, to]) => from !== to));
  return swaps.size > 0 ? swaps : null;
}
