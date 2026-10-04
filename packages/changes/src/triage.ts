import { BINARY_EXTENSION_PATTERN, LOCKFILE_PATTERN, type Excluded } from "@kiasm-tech/star-catch-contracts";
import type { AnalyzeInput, FileClass } from "./schema.js";

export type Triage = { fileClass: FileClass } | { excluded: Excluded["reason"] };

const VENDORED = /(^|\/)(vendor|third_party|node_modules)\//;
const GENERATED_PATH = /(\.min\.js|\.pb\.go|_pb2\.py)$|\.generated\.[^/]+$|(^|\/)(__generated__|dist|build)\//;
const GENERATED_HEADER = /@generated|DO NOT EDIT/;
const TEST = /\.(test|spec)\.[^/]+$|(^|\/)(__tests__|tests)\/|(^|\/)test_[^/]*\.py$|_test\.(py|go)$|(^|\/)src\/test\//;
const SCHEMA = /(^|\/)(migrations|migration|migrate)\/|\.sql$|(^|\/)schema\.prisma$/;
const MANIFEST =
  /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|pom\.xml|build\.gradle(\.kts)?|go\.mod|Cargo\.toml)$/;
const BUILD_CI = /(^|\/)\.github\/workflows\/|(^|\/)(Dockerfile|docker-compose)[^/]*$|(^|\/)(Makefile|\.gitlab-ci\.yml)$/;
const CONFIG = /\.(json|jsonc|ya?ml|toml)$|(^|\/)\.env\.example$/;
const DOCS = /\.mdx?$|(^|\/)docs\//;

const BINARY_SNIFF_CHARS = 8_192;
const HEADER_LINES = 5;

const firstLines = (text: string, count: number) => text.split("\n", count).join("\n");

/**
 * The file's class, or why it leaves the analysis (changes.md §5.1); the first matching rule wins.
 * A file without content keeps the class of its path: the snapshot also leaves out the contents of
 * text files (past its caps), so missing content alone doesn't make a file binary.
 */
export function triage(file: Pick<AnalyzeInput["files"][number], "path" | "base" | "head">): Triage {
  const { path } = file;
  const content = file.head ?? file.base;
  if (LOCKFILE_PATTERN.test(path)) return { excluded: "lockfile" };
  if (VENDORED.test(path)) return { excluded: "vendored" };
  if (GENERATED_PATH.test(path)) return { excluded: "generated" };
  if (BINARY_EXTENSION_PATTERN.test(path) || content?.slice(0, BINARY_SNIFF_CHARS).includes("\0")) {
    return { excluded: "binary" };
  }
  if (content !== undefined && GENERATED_HEADER.test(firstLines(content, HEADER_LINES))) return { excluded: "generated" };
  if (TEST.test(path)) return { fileClass: "test" };
  if (SCHEMA.test(path)) return { fileClass: "schema" };
  if (MANIFEST.test(path)) return { fileClass: "manifest" };
  // Before config: workflows and compose files are YAML.
  if (BUILD_CI.test(path)) return { fileClass: "buildCi" };
  if (CONFIG.test(path)) return { fileClass: "config" };
  if (DOCS.test(path)) return { fileClass: "docs" };
  return { fileClass: "source" };
}
