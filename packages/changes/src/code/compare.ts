import { MAX_UNIT_CODE_CHARS, type ChangeType } from "@kiasm-tech/star-catch-contracts";
import type { Query, Tree } from "web-tree-sitter";
import type { LanguageSpec } from "../languages/spec.js";
import { SPECS } from "../languages/specs.js";
import { MAX_REFERENCES, type AnalyzeInput, type FileClass, type Unit } from "../schema.js";
import { bindingsOf, bindingsQuery, bodyOf, type Body } from "./bodies.js";
import { declarationsOf, type Declaration } from "./declarations.js";
import { diffTokens } from "./diff.js";
import { parse, parserFor, type CodeLanguage, type ParseBudget } from "./parse.js";
import { hashTokens, ownText, ownTokens, residueText, residueTokens, tokensOf, type Token } from "./tokens.js";

/** One side of a declaration. Its `declaration.node` is valid until `compareCode` deletes the tree. */
interface Side {
  declaration: Declaration;
  tokens: Token[];
  name: string;
  hash: string;
  ownText: string;
  /** The span's text, nested declarations included: what a reader sees. */
  code: string;
  /** Names of the declarations nested in it, one per line. */
  members: string;
  lines: [number, number];
  start: number;
  references: string[];
}

interface ReadFile {
  tree: Tree;
  tokens: Token[];
  found: Declaration[];
  declarations: Map<string, Side>;
  residue: { hash: string; text: string; empty: boolean; tokens: Token[] };
}

const isIdentifier = (token: Token) => token.type.endsWith("identifier");

/** Distinct identifiers in order of appearance, without the declaration's own name. */
function referencesOf(tokens: Token[], name: string): string[] {
  const seen = new Set<string>([name.split(/[.>]/).at(-1)!.trim()]);
  const references: string[] = [];
  for (const token of tokens) {
    if (!isIdentifier(token) || seen.has(token.text)) continue;
    seen.add(token.text);
    references.push(token.text);
    if (references.length === MAX_REFERENCES) break;
  }
  return references;
}

/** Null when parsing ran out of time. The caller deletes the tree. */
async function readSide(language: CodeLanguage, source: string, budget: ParseBudget): Promise<ReadFile | null> {
  const tree = parse(await parserFor(language), source, budget);
  if (!tree) return null;
  try {
    const tokens = tokensOf(tree, source, SPECS[language]);
    const found = await declarationsOf(tree, language);
    const declarations = new Map<string, Side>();
    for (const d of found) declarations.set(d.qualifiedName, sideOf(source, tokens, d, found));
    const residue = residueTokens(tokens, found);
    return {
      tree,
      tokens,
      found,
      declarations,
      residue: { hash: hashTokens(residue), text: residueText(source, tokens, found), empty: residue.length === 0, tokens: residue },
    };
  } catch (error) {
    tree.delete();
    throw error;
  }
}

function sideOf(source: string, tokens: Token[], d: Declaration, all: Declaration[]): Side {
  const own = ownTokens(tokens, d, all);
  const inside = (o: Declaration) =>
    o !== d && d.scope.start <= o.scope.start && o.scope.end <= d.scope.end && (o.scope.start !== d.scope.start || o.scope.end !== d.scope.end);
  return {
    members: all.filter(inside).map((o) => o.qualifiedName).join("\n"),
    declaration: d,
    tokens: own,
    name: d.qualifiedName,
    hash: hashTokens(own),
    ownText: ownText(source, tokens, d, all),
    code: source.slice(d.start, d.end),
    lines: d.lines,
    start: d.start,
    references: referencesOf(own, d.qualifiedName),
  };
}

export interface CodeFile {
  file: AnalyzeInput["files"][number];
  language: CodeLanguage;
  fileClass: FileClass;
  component: string;
}

/** What refactoring detection needs of a unit, on each side, read while the trees lived. */
export interface UnitTokens {
  base?: Token[];
  head?: Token[];
  baseBody?: Body;
  headBody?: Body;
  /** Names the declaration binds itself: parameters and locals. */
  baseBindings?: Set<string>;
  headBindings?: Set<string>;
}

/** `degraded` when a changed declaration overlaps a parse error. `tokens` is keyed by unit id. */
export type CompareResult = { units: Unit[]; degraded: boolean; tokens: Map<string, UnitTokens> } | { error: string };

const clip = (code: string | undefined) => code?.slice(0, MAX_UNIT_CODE_CHARS);
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The units of one code file (changes.md §5.4): declarations paired by qualified name, plus the
 * file's residue. Changed units are `bodyChanged` until change types are located.
 */
export async function compareCode({ file, language, fileClass, component }: CodeFile, budget: ParseBudget): Promise<CompareResult> {
  const needsBase = file.status !== "added";
  const needsHead = file.status !== "removed";
  if ((needsBase && file.base === undefined) || (needsHead && file.head === undefined)) {
    return { error: "content missing from the snapshot" };
  }
  const base = needsBase ? await readSide(language, file.base!, budget) : null;
  let head: ReadFile | null = null;
  try {
    head = needsHead ? await readSide(language, file.head!, budget) : null;
    if ((needsBase && !base) || (needsHead && !head)) return { error: "parsing took longer than its budget" };
    return unitsOf(file.path, { language, fileClass, component }, base, head, await bindingsQuery(language));
  } finally {
    base?.tree.delete();
    head?.tree.delete();
  }
}

function unitsOf(
  path: string,
  { language, fileClass, component }: Omit<CodeFile, "file">,
  base: ReadFile | null,
  head: ReadFile | null,
  bindings: Query,
): CompareResult {
  const spec = SPECS[language];
  let degraded = false;
  const tokens = new Map<string, UnitTokens>();

  const unit = (name: string, fields: Partial<Unit> & Pick<Unit, "verdict" | "changeType" | "unitKind">): Unit => ({
    id: `${path}#${name}`,
    file: path,
    name,
    language,
    refactorings: [],
    component,
    fileClass,
    span: {},
    references: [],
    ...fields,
  });

  const units: Unit[] = [];
  const names = new Set([...(base?.declarations.keys() ?? []), ...(head?.declarations.keys() ?? [])]);
  for (const name of names) {
    const before = base?.declarations.get(name);
    const after = head?.declarations.get(name);
    if (before && after && before.hash === after.hash && before.ownText === after.ownText) continue;
    tokens.set(`${path}#${name}`, {
      base: before?.tokens,
      head: after?.tokens,
      baseBody: before && bodyOf(before.declaration.node, base!.tokens),
      headBody: after && bodyOf(after.declaration.node, head!.tokens),
      baseBindings: before && bindingsOf(bindings, before.declaration, base!.found),
      headBindings: after && bindingsOf(bindings, after.declaration, head!.found),
    });
    const shared = {
      unitKind: "declaration" as const,
      before: clip(before?.code),
      after: clip(after?.code),
      span: { ...(before && { base: before.lines }), ...(after && { head: after.lines }) },
      references: after?.references ?? [],
    };
    if (before && after && before.hash === after.hash) {
      // Adding or removing a member reshapes its container's text; that's not an edit of the container.
      if (before.members !== after.members) continue;
      units.push(unit(name, { ...shared, verdict: "notAChange", changeType: "bodyChanged" }));
    } else if (before && after) {
      const broken = before.declaration.node.hasError || after.declaration.node.hasError;
      degraded ||= broken;
      const changeType = broken ? "bodyChanged" : changeTypeOf(spec, base!.tree, before, head!.tree, after);
      units.push(unit(name, { ...shared, verdict: "behavioural", changeType }));
    } else {
      units.push(unit(name, { ...shared, verdict: "behavioural", changeType: after ? "added" : "removed" }));
    }
  }

  const residue = residueUnit(base?.residue, head?.residue);
  if (residue) {
    // Declarations show as markers in the residue's text; a blank line reads better.
    const text = (side: ReadFile | null) => (side && !side.residue.empty ? clip(side.residue.text.replaceAll("\0", "\n\n")) : undefined);
    units.push(unit(basename(path), { unitKind: "file", ...residue, before: text(base), after: text(head) }));
    tokens.set(`${path}#${basename(path)}`, { base: base?.residue.tokens, head: head?.residue.tokens });
  }

  const lineOf = (u: Unit) => u.span.head?.[0] ?? u.span.base?.[0] ?? 0;
  return { units: units.sort((a, b) => lineOf(a) - lineOf(b) || a.id.localeCompare(b.id)), degraded, tokens };
}

type Region = "signature" | "condition" | "body";

/** Where a changed token sits in its declaration. */
function regionOf(spec: LanguageSpec, tree: Tree, declaration: Declaration, token: Token): Region {
  if (token.start < declaration.bodyStart) return "signature";
  for (
    let node = tree.rootNode.descendantForIndex(token.start, token.end);
    node && node.id !== declaration.node.id && node.startIndex >= declaration.start;
    node = node.parent
  ) {
    if (node.parent?.childForFieldName("condition")?.id === node.id || spec.isCondition(node)) return "condition";
  }
  return "body";
}

/**
 * From the token diff (§3.4): any change before the body makes it a signature change; changes that
 * all sit in conditions make it a condition change; anything else is a body change.
 */
function changeTypeOf(spec: LanguageSpec, baseTree: Tree, before: Side, headTree: Tree, after: Side): ChangeType {
  const diff = diffTokens(
    before.tokens.map((t) => t.text),
    after.tokens.map((t) => t.text),
  );
  if (!diff) return "bodyChanged";
  const regions = [
    ...diff.deleted.map((i) => regionOf(spec, baseTree, before.declaration, before.tokens[i])),
    ...diff.inserted.map((i) => regionOf(spec, headTree, after.declaration, after.tokens[i])),
  ];
  if (regions.includes("signature")) return "signatureChanged";
  if (regions.length > 0 && regions.every((r) => r === "condition")) return "conditionChanged";
  return "bodyChanged";
}

type Residue = ReadFile["residue"];

function residueUnit(base: Residue | undefined, head: Residue | undefined): Pick<Unit, "verdict" | "changeType"> | null {
  const hasBase = base !== undefined && !base.empty;
  const hasHead = head !== undefined && !head.empty;
  if (!hasBase && !hasHead) return null;
  if (!hasBase) return { verdict: "behavioural", changeType: "added" };
  if (!hasHead) return { verdict: "behavioural", changeType: "removed" };
  if (base.hash !== head.hash) return { verdict: "behavioural", changeType: "bodyChanged" };
  return base.text === head.text ? null : { verdict: "notAChange", changeType: "bodyChanged" };
}
