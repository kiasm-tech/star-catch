import type { ENGINES } from "../schema.js";

export type Engine = (typeof ENGINES)[number];

export interface FileLanguage {
  /** Lowercase, as the context's `language` field expects. */
  language: string;
  engine: Engine;
}

const code = (language: string): FileLanguage => ({ language, engine: "code" });
const structured = (language: string): FileLanguage => ({ language, engine: "structured" });

/** Checked before extensions: these names mean a manifest, whatever their extension says. */
const BY_NAME: [RegExp, FileLanguage][] = [
  [/(^|\/)pom\.xml$/, structured("xml")],
  [/(^|\/)build\.gradle(\.kts)?$/, structured("gradle")],
  [/(^|\/)go\.mod$/, structured("gomod")],
  [/(^|\/)requirements[^/]*\.txt$/, structured("requirements")],
];

const BY_EXTENSION: Record<string, FileLanguage> = {
  ".ts": code("typescript"),
  ".mts": code("typescript"),
  ".cts": code("typescript"),
  ".tsx": code("tsx"),
  ".js": code("javascript"),
  ".mjs": code("javascript"),
  ".cjs": code("javascript"),
  ".jsx": code("javascript"),
  ".py": code("python"),
  ".java": code("java"),
  ".json": structured("json"),
  ".jsonc": structured("json"),
  ".yaml": structured("yaml"),
  ".yml": structured("yaml"),
  ".toml": structured("toml"),
  ".sql": structured("sql"),
  ".md": structured("markdown"),
  ".mdx": structured("markdown"),
};

/** ".ts" for "src/a.ts"; "" for "Makefile" and dotfiles like ".gitignore". */
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Which engine reads a file; everything without one is compared line by line. */
export function languageOf(path: string): FileLanguage {
  const named = BY_NAME.find(([pattern]) => pattern.test(path));
  if (named) return named[1];
  const extension = extensionOf(path);
  const known = BY_EXTENSION[extension];
  if (known) return known;
  const language = extension.slice(1);
  return { language: /^[a-z0-9+#.-]+$/.test(language) ? language : "text", engine: "lines" };
}
