import { createHash } from "node:crypto";
import type { Tree } from "web-tree-sitter";
import type { LanguageSpec } from "../languages/spec.js";
import type { Declaration } from "./declarations.js";

/** A leaf of the syntax tree; whitespace never is one (changes.md §3.2). */
export interface Token {
  text: string;
  /** The leaf's node type: `identifier`, `property_identifier`, `number`, … */
  type: string;
  /** JS string indexes. */
  start: number;
  end: number;
}

const isComment = (type: string) => type.includes("comment");

/**
 * Every token of a file in source order, without comments and docstrings. Walks with a cursor:
 * large files have tens of thousands of nodes, and building a Node for each is slow.
 */
export function tokensOf(tree: Tree, source: string, spec: Pick<LanguageSpec, "isDocstring">): Token[] {
  const tokens: Token[] = [];
  const cursor = tree.walk();
  try {
    let entering = true;
    for (;;) {
      if (entering) {
        const type = cursor.nodeType;
        const skip =
          isComment(type) || (type === "expression_statement" && spec.isDocstring?.(cursor.currentNode) === true);
        if (!skip) {
          if (cursor.gotoFirstChild()) continue;
          // A missing node, inserted by error recovery, has no text.
          if (cursor.endIndex > cursor.startIndex) {
            const { startIndex: start, endIndex: end } = cursor;
            tokens.push({ text: source.slice(start, end), type, start, end });
          }
        }
      }
      if (cursor.gotoNextSibling()) {
        entering = true;
        continue;
      }
      if (!cursor.gotoParent()) return tokens;
      entering = false;
    }
  } finally {
    cursor.delete();
  }
}

type Range = { start: number; end: number };

/**
 * What isn't a declaration's own: the declarations nested in it (each is its own unit) and
 * siblings declared in the same statement (`const a = 1, b = 2`). Sorted, non-overlapping.
 */
function othersIn(declaration: Declaration, declarations: Declaration[]): Range[] {
  const others: Range[] = [];
  for (const other of declarations) {
    if (other === declaration) continue;
    const nested =
      declaration.scope.start <= other.scope.start &&
      other.scope.end <= declaration.scope.end &&
      !(other.scope.start === declaration.scope.start && other.scope.end === declaration.scope.end);
    if (nested) others.push({ start: other.start, end: other.end });
    else if (other.node.id === declaration.node.id) others.push(other.scope);
  }
  others.sort((a, b) => a.start - b.start);
  return others.filter((r, i) => !others.slice(0, i).some((o) => o.start <= r.start && r.end <= o.end));
}

/**
 * The text between tokens, formatting and comments included. A gap that holds one of `skipped`
 * (a nested declaration) becomes a marker, so adding a member doesn't change its container's text.
 */
function textOf(source: string, tokens: Token[], skipped: Range[]): string {
  let text = "";
  tokens.forEach((token, i) => {
    const next = tokens[i + 1];
    text += token.text;
    if (!next) return;
    const holds = skipped.some((r) => token.end <= r.start && r.end <= next.start);
    text += holds ? "\0" : source.slice(token.end, next.start);
  });
  return text;
}

/** A declaration's own text: what `ownTokens` covers, formatting and comments included. */
export function ownText(source: string, tokens: Token[], declaration: Declaration, declarations: Declaration[]): string {
  return textOf(source, ownTokens(tokens, declaration, declarations), othersIn(declaration, declarations));
}

/** A declaration's own tokens: those in its span, minus `othersIn`. */
export function ownTokens(tokens: Token[], declaration: Declaration, declarations: Declaration[]): Token[] {
  const others = othersIn(declaration, declarations);
  const own: Token[] = [];
  for (let i = firstAtOrAfter(tokens, declaration.start); i < tokens.length && tokens[i].end <= declaration.end; i++) {
    const token = tokens[i];
    if (!others.some((r) => r.start <= token.start && token.end <= r.end)) own.push(token);
  }
  return own;
}

/** Tokens outside every declaration: imports and top-level statements, the file's residue (§5.4). */
export function residueTokens(tokens: Token[], declarations: Declaration[]): Token[] {
  return tokens.filter((t) => !declarations.some((d) => d.start <= t.start && t.end <= d.end));
}

/** The residue's text, formatting and comments included; declarations become markers. */
export function residueText(source: string, tokens: Token[], declarations: Declaration[]): string {
  return textOf(source, residueTokens(tokens, declarations), declarations);
}

/** sha1 of the token texts joined with \0. */
export function hashTokens(tokens: Token[]): string {
  const hash = createHash("sha1");
  tokens.forEach((token, i) => hash.update(i === 0 ? token.text : `\0${token.text}`));
  return hash.digest("hex");
}

function firstAtOrAfter(tokens: Token[], index: number): number {
  let low = 0;
  let high = tokens.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (tokens[mid].start < index) low = mid + 1;
    else high = mid;
  }
  return low;
}
