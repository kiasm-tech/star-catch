import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { parseAllDocuments } from "yaml";
import { keyEntries, type Entry } from "./entries.js";

export function parseJson(text: string): unknown {
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) throw new Error(`JSON: ${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset}`);
  return value;
}

/** Every document of a YAML file; throws on a syntax error. */
export function parseYaml(text: string): unknown[] {
  return parseAllDocuments(text).map((document) => {
    if (document.errors.length > 0) throw new Error(`YAML: ${document.errors[0].message}`);
    return document.toJS();
  });
}

export const parseTomlFile = (text: string): unknown => parseToml(text);

/** A config file's entries; a multi-document YAML file prefixes each key with `[i].`. */
export function configEntries(language: string, text: string, fileName: string): Entry[] {
  if (language === "json") return keyEntries(parseJson(text), fileName);
  if (language === "toml") return keyEntries(parseTomlFile(text), fileName);
  const documents = parseYaml(text);
  if (documents.length <= 1) return keyEntries(documents[0] ?? null, fileName);
  return documents.flatMap((document, i) => keyEntries(document, fileName, `[${i}].`));
}
