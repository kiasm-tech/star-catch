import type { CodeLanguage } from "../code/parse.js";
import { java } from "./java/language.js";
import { javascript } from "./javascript/language.js";
import { python } from "./python/language.js";
import type { LanguageSpec } from "./spec.js";
import { typescript } from "./typescript/language.js";

/** The typescript spec serves both grammars, typescript and tsx. */
export const SPECS: Record<CodeLanguage, LanguageSpec> = { typescript, tsx: typescript, javascript, python, java };
