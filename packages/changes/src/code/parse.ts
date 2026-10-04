import { Language, Parser, type ParseOptions, type Tree } from "web-tree-sitter";
import { readGrammarFile } from "../languages/grammar-files.js";

/** The code languages `languageOf` names, and their vendored grammars. */
const GRAMMARS = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  java: "tree-sitter-java.wasm",
} as const;

export type CodeLanguage = keyof typeof GRAMMARS;

export const CODE_LANGUAGES = Object.keys(GRAMMARS) as CodeLanguage[];

export const isCodeLanguage = (language: string): language is CodeLanguage => Object.hasOwn(GRAMMARS, language);

let runtime: Promise<void> | undefined;
const languages = new Map<CodeLanguage, Promise<Language>>();
const parsers = new Map<CodeLanguage, Promise<Parser>>();

/** The WASM runtime starts once per process; each grammar loads once. */
export function loadLanguage(language: CodeLanguage): Promise<Language> {
  let loaded = languages.get(language);
  if (!loaded) {
    runtime ??= Parser.init();
    loaded = runtime.then(async () => Language.load(await readGrammarFile(GRAMMARS[language])));
    languages.set(language, loaded);
  }
  return loaded;
}

/** One parser per language, reused: parsing is synchronous, so calls never overlap. */
export function parserFor(language: CodeLanguage): Promise<Parser> {
  let parser = parsers.get(language);
  if (!parser) {
    parser = loadLanguage(language).then((loaded) => new Parser().setLanguage(loaded));
    parsers.set(language, parser);
  }
  return parser;
}

export interface ParseBudget {
  /** In `now()` time. */
  deadline: number;
  now?: () => number;
}

/**
 * Null when the deadline passes mid-parse; the caller then compares the file line by line.
 * The caller owns the tree and must `delete()` it: trees live in the WASM heap.
 */
export function parse(parser: Parser, text: string, { deadline, now = Date.now }: ParseBudget): Tree | null {
  // Returning true cancels the parse, although the d.ts types the callback as returning void.
  const progressCallback = (() => now() > deadline) as unknown as ParseOptions["progressCallback"];
  const tree = parser.parse(text, null, { progressCallback });
  // Otherwise the next parse would resume this one.
  if (!tree) parser.reset();
  return tree;
}
