import { Query, type Node, type Tree } from "web-tree-sitter";
import { javascript } from "../languages/javascript/language.js";
import type { DeclarationCategory, LanguageSpec } from "../languages/spec.js";
import { typescript } from "../languages/typescript/language.js";
import { loadLanguage, type CodeLanguage } from "./parse.js";

const SPECS: Partial<Record<CodeLanguage, LanguageSpec>> = { typescript, tsx: typescript, javascript };

export interface Declaration {
  /** As written; a test's title. */
  name: string;
  /** Joined with its enclosing declarations (`Cart.total`, `persist > rehydrates`); unique in its file. */
  qualifiedName: string;
  category: DeclarationCategory;
  /** Valid only while its tree lives. */
  node: Node;
  /** The span with its wrappers and decorators, in JS string indexes. */
  start: number;
  end: number;
  /** 1-based, inclusive. */
  lines: [number, number];
}

export const hasDeclarations = (language: CodeLanguage): boolean => SPECS[language] !== undefined;

const queries = new Map<CodeLanguage, Promise<Query>>();

function queryFor(language: CodeLanguage, spec: LanguageSpec): Promise<Query> {
  let query = queries.get(language);
  if (!query) {
    query = loadLanguage(language).then((loaded) => new Query(loaded, spec.definitions));
    queries.set(language, query);
  }
  return query;
}

interface Found {
  name: string;
  category: DeclarationCategory;
  node: Node;
  outer: Node;
  start: Node;
  /** What nested declarations must lie in: the declarator for `const a = …, b = …`. */
  scope: Node;
}

/** The wrapper-including node, and the first node of the span (a leading decorator, if any). */
function spanOf(node: Node, spec: LanguageSpec): { outer: Node; start: Node } {
  let outer = node;
  while (outer.parent && spec.wrappers.includes(outer.parent.type)) outer = outer.parent;
  let start = outer;
  for (let prev = outer.previousNamedSibling; prev && spec.leading.includes(prev.type); prev = prev.previousNamedSibling) {
    start = prev;
  }
  return { outer, start };
}

/** Every declaration of a parsed file, in source order (changes.md §5.3). */
export async function declarationsOf(tree: Tree, language: CodeLanguage): Promise<Declaration[]> {
  const spec = SPECS[language];
  if (!spec) throw new Error(`No declaration rules for ${language}`);
  const query = await queryFor(language, spec);

  const found: Found[] = [];
  const seen = new Set<string>();
  for (const match of query.matches(tree.rootNode)) {
    const definition = match.captures.find((c) => c.name.startsWith("definition."));
    const title = match.captures.find((c) => c.name === "name");
    if (!definition || !title) continue;
    const category = definition.name.slice("definition.".length) as DeclarationCategory;
    const name = category === "test" ? spec.testName(title.node) : title.node.text;
    const key = `${definition.node.id}:${name}`;
    if (name === null || name === "" || seen.has(key)) continue;
    seen.add(key);
    const declarator = title.node.parent?.type === "variable_declarator" ? title.node.parent : null;
    found.push({ name, category, node: definition.node, scope: declarator ?? definition.node, ...spanOf(definition.node, spec) });
  }
  // Outer ones first, so a declaration's container is already named when it is reached.
  found.sort((a, b) => a.start.startIndex - b.start.startIndex || b.outer.endIndex - a.outer.endIndex);

  const declarations: Declaration[] = [];
  const open: { declaration: Declaration; scope: Node }[] = [];
  const counts = new Map<string, number>();
  const contains = (outer: Node, inner: Node) =>
    outer.startIndex <= inner.startIndex && inner.endIndex <= outer.endIndex && outer.id !== inner.id;
  for (const f of found) {
    while (open.length > 0 && !contains(open[open.length - 1].scope, f.scope)) open.pop();
    const parent = open.at(-1)?.declaration;
    const separator = parent?.category === "test" && f.category === "test" ? " > " : ".";
    const base = parent ? `${parent.qualifiedName}${separator}${f.name}` : f.name;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    const declaration: Declaration = {
      name: f.name,
      qualifiedName: count === 1 ? base : `${base} (${count})`,
      category: f.category,
      node: f.node,
      start: f.start.startIndex,
      end: f.outer.endIndex,
      lines: [f.start.startPosition.row + 1, f.outer.endPosition.row + 1],
    };
    declarations.push(declaration);
    open.push({ declaration, scope: f.scope });
  }
  return declarations;
}
