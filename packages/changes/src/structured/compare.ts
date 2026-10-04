import { MAX_UNIT_CODE_CHARS } from "@kiasm-tech/star-catch-contracts";
import type { AnalyzeInput, FileClass, Unit } from "../schema.js";
import { configEntries } from "./config.js";
import type { Entry } from "./entries.js";
import { manifestEntries } from "./manifests.js";
import { markdownSections } from "./markdown.js";
import { compareSections, type Section } from "./sections.js";
import { sqlSections } from "./sql.js";

const CONFIG_LANGUAGES = new Set(["json", "yaml", "toml"]);
const SECTIONED: Record<string, (text: string) => Section[]> = { sql: sqlSections, markdown: markdownSections };
const MANIFEST_LANGUAGES = new Set(["json", "toml", "xml", "gradle", "gomod", "requirements"]);

export function readsStructured(language: string, fileClass: FileClass): boolean {
  return (
    CONFIG_LANGUAGES.has(language) ||
    Object.hasOwn(SECTIONED, language) ||
    (fileClass === "manifest" && MANIFEST_LANGUAGES.has(language))
  );
}

export interface StructuredFile {
  file: AnalyzeInput["files"][number];
  language: string;
  fileClass: FileClass;
  component: string;
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const clip = (text: string | undefined) => text?.slice(0, MAX_UNIT_CODE_CHARS);

function entriesOf({ language, fileClass, file }: StructuredFile, text: string): Entry[] {
  const fileName = basename(file.path);
  return (fileClass === "manifest" ? manifestEntries(fileName, text) : null) ?? configEntries(language, text, fileName);
}

/**
 * The units of a config file or manifest (changes.md §5.6): entries paired by name. When no entry
 * changed but the text did (formatting, comments, key order), one `notAChange` file unit says so.
 */
export function compareStructured(structured: StructuredFile): { units: Unit[] } | { error: string } {
  const { file, language, fileClass, component } = structured;
  const needsBase = file.status !== "added";
  const needsHead = file.status !== "removed";
  if ((needsBase && file.base === undefined) || (needsHead && file.head === undefined)) {
    return { error: "content missing from the snapshot" };
  }
  const sectioned = SECTIONED[language];
  if (sectioned) {
    const fields = { file: file.path, language, refactorings: [], component, fileClass, references: [] };
    return {
      units: compareSections(file.path, needsBase ? sectioned(file.base!) : [], needsHead ? sectioned(file.head!) : [], fields),
    };
  }
  let base: Entry[] = [];
  let head: Entry[] = [];
  try {
    if (needsBase) base = entriesOf(structured, file.base!);
    if (needsHead) head = entriesOf(structured, file.head!);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const unit = (entry: Pick<Entry, "name" | "unitKind">, fields: Pick<Unit, "verdict" | "changeType"> & Partial<Unit>): Unit => ({
    id: `${file.path}#${entry.name}`,
    file: file.path,
    name: entry.name,
    unitKind: entry.unitKind,
    language,
    refactorings: [],
    component,
    fileClass,
    span: {},
    references: [],
    ...fields,
  });

  const before = new Map(base.map((e) => [e.name, e]));
  const after = new Map(head.map((e) => [e.name, e]));
  const units: Unit[] = [];
  for (const entry of head) {
    const old = before.get(entry.name);
    if (old?.value === entry.value) continue;
    const changeType = old ? "bodyChanged" : "added";
    units.push(unit(entry, { verdict: "behavioural", changeType, before: clip(old?.value), after: clip(entry.value) }));
  }
  for (const entry of base) {
    if (!after.has(entry.name)) units.push(unit(entry, { verdict: "behavioural", changeType: "removed", before: clip(entry.value) }));
  }
  if (units.length === 0 && needsBase && needsHead && file.base !== file.head) {
    const whole = { name: basename(file.path), unitKind: "file" as const };
    units.push(unit(whole, { verdict: "notAChange", changeType: "bodyChanged", before: clip(file.base), after: clip(file.head) }));
  }
  return { units };
}
