/**
 * What a declaration is made of, read from its source text: an object type's or class's fields,
 * a function's parameters and what it returns, a union's alternatives, an enum's values. Enough
 * to say which parts were added, removed or changed; not a parser.
 */
import { MAX_CONTRACT_MEMBERS, type ChangeUnit } from "@kiasm-tech/star-catch-contracts";
import { clip } from "./words.js";

export interface Member {
  name: string;
  /** Empty for a union alternative or an enum value, which are their own name. */
  type: string;
}

export interface MemberChange {
  name: string;
  before: string | null;
  after: string | null;
  change: "added" | "removed" | "changed";
}

const SCRIPT = new Set(["typescript", "tsx", "javascript", "jsx"]);

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** Splits at `separators` that sit outside brackets, quotes and generics. */
function splitTop(text: string, separators: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      current += c;
      if (c === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c) && text[i - 1] !== "=") depth = Math.max(0, depth - 1);
    if (depth === 0 && separators.includes(c)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map(squash).filter(Boolean);
}

/** The text between the bracket at `open` and its match. */
function inside(text: string, open: number): string | null {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const close = pairs[text[open]!];
  if (!close) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

/** The text before a default value: the first `=` outside brackets that isn't part of `=>`, `==`, `<=` or `>=`. */
function withoutDefault(text: string): string {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if ("([{<".includes(c)) depth++;
    else if (")]}".includes(c) || (c === ">" && text[i - 1] !== "=")) depth = Math.max(0, depth - 1);
    else if (c === "=" && depth === 0 && !"=>".includes(text[i + 1] ?? "") && !"=!<>".includes(text[i - 1] ?? "")) return text.slice(0, i).trim();
  }
  return text;
}

/** Where a function's body starts after its parameters: the first `{` (or `=>` for an arrow) outside the return type. */
function returnType(rest: string, arrow: boolean): string | null {
  const typed = /^\s*:\s*/.exec(rest);
  if (!typed) return null;
  const text = rest.slice(typed[0].length);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (arrow && c === "=" && text[i + 1] === ">" && depth === 0) {
      // `(): () => void => …`: the last top-level arrow starts the body.
      const later = text.slice(i + 2);
      if (!/^\s*\(?[^)]*\)?\s*=>/.test(later) && !/=>/.test(later.split("{")[0] ?? "")) return squash(text.slice(0, i));
    }
    if (!arrow && c === "{" && depth === 0 && i > 0 && !/(=>|[:|&,(<])\s*$/.test(text.slice(0, i))) return squash(text.slice(0, i));
    if ("([{<".includes(c)) depth++;
    else if (")]}".includes(c) || (c === ">" && text[i - 1] !== "=")) depth = Math.max(0, depth - 1);
  }
  return squash(text) || null;
}

/** `name?: type = default`, `...rest: T[]`, `readonly x: T`, `method(a): R` → a member. */
function memberOf(part: string, python: boolean): Member | null {
  const text = withoutDefault(part.replace(/^(export|public|private|protected|readonly|static|declare|async)\s+/g, "").replace(/^(readonly|static)\s+/, ""));
  const method = /^([\w$#]+)\??\s*(\([^)]*\))\s*(?::\s*(.+))?$/.exec(text);
  if (method && !python) return { name: `${method[1]}()`, type: squash(method[3] ?? "") };
  const field = python ? /^\*{0,2}([\w]+)\s*(?::\s*(.+))?$/.exec(text) : /^(?:\.\.\.)?([\w$#"']+\??)\s*(?::\s*(.+))?$/.exec(text);
  if (!field) return null;
  const name = field[1]!.replace(/["']/g, "");
  if (["self", "cls"].includes(name)) return null;
  return { name, type: squash(field[2] ?? "") };
}

function scriptMembers(code: string): Member[] | null {
  const text = squash(stripComments(code));
  // Functions: parameters, then what comes back.
  const fn = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*[\w$]*\s*(?:<[^(]*>)?\s*\(/.exec(text) ?? /^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*(?::[^=]+)?=\s*(?:async\s+)?\(/.exec(text);
  if (fn) {
    const open = fn.index + fn[0].length - 1;
    const params = inside(text, open);
    if (params === null) return null;
    const returns = returnType(text.slice(open + params.length + 2), !/\bfunction\b/.test(fn[0]));
    const members = splitTop(params, ",").flatMap((p) => memberOf(p.replace(/^\{.*\}$/, "options"), false) ?? []);
    return returns ? [...members, { name: "returns", type: returns }] : members;
  }
  // Enums: their values.
  const en = /^(?:export\s+)?(?:const\s+)?enum\s+[\w$]+\s*\{/.exec(text);
  if (en) return splitTop(inside(text, en.index + en[0].length - 1) ?? "", ",").map((v) => ({ name: v.split("=")[0]!.trim(), type: "" }));
  // Object types, interfaces and classes: their fields and methods.
  const obj = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:interface|class|type)\s+[\w$]+[^{=]*(?:=\s*)?\{/.exec(text);
  if (obj) {
    const body = inside(text, obj.index + obj[0].length - 1);
    if (body === null) return null;
    // A method's body goes; a field's object type stays.
    const signature = (p: string) => (/^(?:[\w]+\s+)*[\w$#]+\??\s*\([^)]*\)[^{]*\{/.test(p) ? p.replace(/\{.*$/, "").trim() : p);
    return splitTop(body, ";,").flatMap((p) => (/^constructor\b/.test(p) ? [] : (memberOf(signature(p), false) ?? [])));
  }
  // Unions: their alternatives.
  const union = /^(?:export\s+)?type\s+[\w$]+\s*(?:<[^=]*>)?\s*=\s*(.+?);?$/.exec(text);
  if (union && union[1]!.includes("|")) return splitTop(union[1]!.replace(/^\|/, ""), "|").map((alt) => ({ name: alt.replace(/;$/, ""), type: "" }));
  return null;
}

function pythonMembers(code: string): Member[] | null {
  const text = code.replace(/#.*$/gm, "");
  const fn = /^\s*(?:async\s+)?def\s+\w+\s*\(/m.exec(text);
  if (fn) {
    const open = fn.index + fn[0].length - 1;
    const params = inside(text, open);
    if (params === null) return null;
    const returns = /^\s*->\s*([^:]+):/.exec(text.slice(open + params.length + 2))?.[1];
    const members = splitTop(params, ",").flatMap((p) => memberOf(p, true) ?? []);
    return returns ? [...members, { name: "returns", type: squash(returns) }] : members;
  }
  const cls = /^\s*class\s+\w+[^:]*:\s*\n/m.exec(text);
  if (cls) {
    const fields = text
      .slice(cls.index + cls[0].length)
      .split("\n")
      .map((line) => /^\s{2,8}(\w+)\s*:\s*([^=]+?)\s*(?:=.*)?$/.exec(line))
      .flatMap((m) => (m ? [{ name: m[1]!, type: squash(m[2]!) }] : []));
    return fields.length > 0 ? fields : null;
  }
  return null;
}

/** The members of one declaration, or null when its shape can't be read. */
export function membersOf(code: string | undefined, language: string): Member[] | null {
  if (!code) return null;
  if (SCRIPT.has(language)) return scriptMembers(code);
  if (language === "python") return pythonMembers(code);
  return null;
}

/** Which members were added, removed or changed type, in the new order, removed ones last. */
export function memberChanges(before: Member[] | null, after: Member[] | null): MemberChange[] {
  const old = new Map((before ?? []).map((m) => [m.name, m.type]));
  const now = new Map((after ?? []).map((m) => [m.name, m.type]));
  const show = (m: Member) => m.type || m.name;
  return [
    ...(after ?? []).flatMap((m): MemberChange[] => {
      if (!old.has(m.name)) return [{ name: m.name, before: null, after: show(m), change: "added" }];
      const was = old.get(m.name)!;
      return was === m.type ? [] : [{ name: m.name, before: was || m.name, after: show(m), change: "changed" }];
    }),
    ...(before ?? []).filter((m) => !now.has(m.name)).map((m): MemberChange => ({ name: m.name, before: show(m), after: null, change: "removed" })),
  ];
}

/** A contract item's change and, when its shape can be read, what changed inside it. */
export function contractShape(u: Pick<ChangeUnit, "id" | "before" | "after" | "language">) {
  const change: "added" | "removed" | "changed" = u.before == null ? "added" : u.after == null ? "removed" : "changed";
  const before = membersOf(u.before, u.language);
  const after = membersOf(u.after, u.language);
  if ((u.before != null && !before) || (u.after != null && !after)) return { change };
  const changes = memberChanges(before, after);
  const members = changes.slice(0, MAX_CONTRACT_MEMBERS).map((m) => ({
    id: `member:${u.id}:${m.name}`,
    name: clip(m.name, 80),
    before: m.before && clip(m.before, 160),
    after: m.after && clip(m.after, 160),
    change: m.change,
  }));
  return { change, members, ...(changes.length > members.length && { more: changes.length - members.length }) };
}
