import type { EntryPointType } from "@kiasm-tech/star-catch-contracts";
import type { AnalyzeInput, ChangeSet, Unit } from "./schema.js";

type EntryPoint = ChangeSet["entryPoints"][number];

const simpleName = (name: string) => name.replace(/ \(\d+\)$/, "").split(/ > |\./).at(-1)!;

const NEXT_PAGE = /(^|\/)app\/(.+\/)?page\.(tsx|jsx|ts|js)$|(^|\/)pages\/(?!api\/).+\.(tsx|jsx|ts|js)$/;
const NEXT_ROUTE = /(^|\/)app\/(.+\/)?route\.(ts|js)$/;
const NEXT_API = /(^|\/)pages\/api\/.+\.(ts|js)$/;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Decorator and annotation rules over the lines that lead a unit's code. */
const ANNOTATIONS: [RegExp, EntryPointType][] = [
  [/^@(app|router|bp|blueprint|api)\.(get|post|put|patch|delete|route|api_route)\b/, "apiRoute"],
  [/^@(Get|Post|Put|Patch|Delete|Request)Mapping\b/, "apiRoute"],
  [/^@(Scheduled|shared_task)\b|^@\w+\.task\b/, "job"],
  [/^@(click|\w+)\.(command|group)\b/, "command"],
];

/** `app.get("/orders", auth, listOrders)`: everything after the path may be a handler. */
const ROUTE_REGISTRATION = /\b(?:app|router|server|api|routes?)\.(?:get|post|put|patch|delete|all)\(\s*["'`][^"'`]*["'`]\s*,([^)]*)\)/g;

/** The decorators or annotations a unit's code starts with, one per item. */
function leadingAnnotations(code: string): string[] {
  const annotations: string[] = [];
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    // Java allows `@Override public String toString()` on one line.
    const inline = trimmed.match(/^(@\w+(?:\.\w+)*(?:\([^)]*\))?\s*)+/)?.[0];
    if (!inline) break;
    annotations.push(...inline.split(/\s+(?=@)/).map((a) => a.trim()).filter(Boolean));
    if (inline.trim() !== trimmed) break;
  }
  return annotations;
}

/** Names passed as handlers to route registrations anywhere in the PR's files. */
function registeredHandlers(files: AnalyzeInput["files"]): Set<string> {
  const handlers = new Set<string>();
  for (const file of files) {
    if (file.head === undefined || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path)) continue;
    for (const match of file.head.matchAll(ROUTE_REGISTRATION)) {
      for (const argument of match[1].split(",")) {
        const name = argument.trim().match(/^([A-Za-z_$][\w$]*)(?:\.bind\(.*)?$/)?.[1];
        if (name) handlers.add(name);
      }
    }
  }
  return handlers;
}

function entryPointOf(unit: Unit, handlers: Set<string>): EntryPointType | undefined {
  const code = unit.after ?? unit.before ?? "";
  if (unit.unitKind === "file") return /^if __name__ == ["']__main__["']\s*:/m.test(code) ? "command" : undefined;
  if (unit.unitKind !== "declaration") return undefined;
  const isDefaultExport = /^export\s+default\b/.test(code);
  if (NEXT_API.test(unit.file) && isDefaultExport) return "apiRoute";
  if (NEXT_PAGE.test(unit.file) && isDefaultExport) return "page";
  if (NEXT_ROUTE.test(unit.file) && HTTP_METHODS.has(unit.name) && /^export\b/.test(code)) return "apiRoute";
  for (const annotation of leadingAnnotations(code)) {
    const rule = ANNOTATIONS.find(([pattern]) => pattern.test(annotation));
    if (rule) return rule[1];
  }
  if (handlers.has(simpleName(unit.name)) && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(unit.file)) return "apiRoute";
  return undefined;
}

/** Entry points by framework rules (changes.md §5.8), one per unit at most. */
export function entryPointsOf(units: Unit[], files: AnalyzeInput["files"]): EntryPoint[] {
  const handlers = registeredHandlers(files);
  return units.flatMap((unit) => {
    if (unit.verdict === "notAChange") return [];
    const type = entryPointOf(unit, handlers);
    return type ? [{ unitId: unit.id, type }] : [];
  });
}
