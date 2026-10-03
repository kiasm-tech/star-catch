import { MAX_UNIT_CODE_CHARS } from "@kiasm-tech/star-catch-contracts";
import type { AnalyzeInput, FileClass, Unit } from "./schema.js";

export interface FallbackFile {
  file: AnalyzeInput["files"][number];
  language: string;
  fileClass: FileClass;
  component: string;
}

const CHANGE_TYPES = { added: "added", removed: "removed", renamed: "moved", modified: "bodyChanged" } as const;

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The whole file as one behavioural unit, when no engine can read it (changes.md §5.7). The patch
 * goes in `after` (`before` for a removed file) so the classifier still sees what changed. Null for
 * a modified file whose content didn't change.
 */
export function fallbackUnit({ file, language, fileClass, component }: FallbackFile): Unit | null {
  if (file.status === "modified" && file.base !== undefined && file.base === file.head) return null;
  const shown = (file.patch ?? (file.status === "removed" ? file.base : file.head))?.slice(0, MAX_UNIT_CODE_CHARS);
  const name = basename(file.path);
  return {
    id: `${file.path}#${name}`,
    file: file.path,
    name,
    unitKind: "file",
    language,
    verdict: "behavioural",
    changeType: CHANGE_TYPES[file.status],
    refactorings: [],
    component,
    fileClass,
    span: {},
    references: [],
    ...(shown !== undefined && (file.status === "removed" ? { before: shown } : { after: shown })),
  };
}
