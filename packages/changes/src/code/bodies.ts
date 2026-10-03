import { Query, type Node } from "web-tree-sitter";
import { SPECS } from "../languages/specs.js";
import type { Declaration } from "./declarations.js";
import { loadLanguage, type CodeLanguage } from "./parse.js";
import { othersIn, tokensIn, type Token } from "./tokens.js";

/** A body's top-level statements as token texts, and what its trailing `return` returns. */
export interface Body {
  statements: string[][];
  /** The expression of a final `return x`; null without one. */
  returned: string[] | null;
}

const BLOCKS = new Set(["statement_block", "block", "constructor_body"]);

/** The statements of a function's body; undefined when its body isn't a block (a class, an arrow). */
export function bodyOf(node: Node, tokens: Token[]): Body | undefined {
  const block = node.childForFieldName("body");
  if (!block || !BLOCKS.has(block.type)) return undefined;
  const statements = block.namedChildren
    .filter((s): s is Node => s !== null && !s.type.includes("comment"))
    .map((s) => ({ node: s, texts: tokensIn(tokens, s.startIndex, s.endIndex).map((t) => t.text) }))
    .filter((s) => s.texts.length > 0);
  const last = statements.at(-1);
  let returned: string[] | null = null;
  if (last?.node.type === "return_statement") {
    const expression = last.texts.slice(1, last.texts.at(-1) === ";" ? -1 : undefined);
    returned = expression.length > 0 ? expression : null;
  }
  return { statements: statements.map((s) => s.texts), returned };
}

const queries = new Map<CodeLanguage, Promise<Query>>();

export function bindingsQuery(language: CodeLanguage): Promise<Query> {
  let query = queries.get(language);
  if (!query) {
    query = loadLanguage(language).then((loaded) => new Query(loaded, SPECS[language].bindings));
    queries.set(language, query);
  }
  return query;
}

/** Names the declaration binds itself (parameters, locals), not those of declarations nested in it. */
export function bindingsOf(query: Query, declaration: Declaration, declarations: Declaration[]): Set<string> {
  const nested = othersIn(declaration, declarations);
  const names = new Set<string>();
  for (const { node } of query.captures(declaration.node)) {
    if (!nested.some((r) => r.start <= node.startIndex && node.endIndex <= r.end)) names.add(node.text);
  }
  return names;
}
