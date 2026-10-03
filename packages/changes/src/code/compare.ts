import { MAX_UNIT_CODE_CHARS } from "@kiasm-tech/star-catch-contracts";
import { SPECS } from "../languages/specs.js";
import { MAX_REFERENCES, type AnalyzeInput, type FileClass, type Unit } from "../schema.js";
import { declarationsOf, type Declaration } from "./declarations.js";
import { parse, parserFor, type CodeLanguage, type ParseBudget } from "./parse.js";
import { hashTokens, ownText, ownTokens, residueText, residueTokens, tokensOf, type Token } from "./tokens.js";

/** One side of a declaration, read while its tree was alive. */
interface Side {
  name: string;
  hash: string;
  ownText: string;
  /** The span's text, nested declarations included: what a reader sees. */
  code: string;
  lines: [number, number];
  start: number;
  references: string[];
}

interface ReadFile {
  declarations: Map<string, Side>;
  residue: { hash: string; text: string; empty: boolean };
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

/** Null when parsing ran out of time. */
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
      declarations,
      residue: { hash: hashTokens(residue), text: residueText(source, tokens, found), empty: residue.length === 0 },
    };
  } finally {
    tree.delete();
  }
}

function sideOf(source: string, tokens: Token[], d: Declaration, all: Declaration[]): Side {
  const own = ownTokens(tokens, d, all);
  return {
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

export type CompareResult = { units: Unit[] } | { error: string };

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
  const head = needsHead ? await readSide(language, file.head!, budget) : null;
  if ((needsBase && !base) || (needsHead && !head)) return { error: "parsing took longer than its budget" };

  const path = file.path;
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
    const shared = {
      unitKind: "declaration" as const,
      before: clip(before?.code),
      after: clip(after?.code),
      span: { ...(before && { base: before.lines }), ...(after && { head: after.lines }) },
      references: after?.references ?? [],
    };
    if (before && after) {
      const verdict = before.hash === after.hash ? "notAChange" : "behavioural";
      units.push(unit(name, { ...shared, verdict, changeType: "bodyChanged" }));
    } else {
      units.push(unit(name, { ...shared, verdict: "behavioural", changeType: after ? "added" : "removed" }));
    }
  }

  const residue = residueUnit(base?.residue, head?.residue);
  if (residue) units.push(unit(basename(path), { unitKind: "file", ...residue }));

  const lineOf = (u: Unit) => u.span.head?.[0] ?? u.span.base?.[0] ?? 0;
  return { units: units.sort((a, b) => lineOf(a) - lineOf(b) || a.id.localeCompare(b.id)) };
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
