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
const ROUTE_REGISTRATION = /\b(?:app|router|server|api|routes?)\.(get|post|put|patch|delete|all)\(\s*["'`]([^"'`]*)["'`]\s*,([^)]*)\)/g;
/** `@router.get("/orders")`, `@app.route("/")`: the method, when it's in the name, and the path. */
const DECORATOR_ROUTE = /^@\w+\.(get|post|put|patch|delete|route|api_route)\(\s*["']([^"']*)["']/;
const MAPPING_ROUTE = /^@(Get|Post|Put|Patch|Delete|Request)Mapping\b(?:\(\s*(?:(?:value|path)\s*=\s*)?["']([^"']*)["'])?/;
const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete"]);

type Route = NonNullable<EntryPoint["route"]>;

const route = (method: string | undefined, path: string | undefined): Route | undefined =>
  method || path ? { ...(method && { method: method.toUpperCase() }), ...(path !== undefined && { path }) } : undefined;

/** `app/(shop)/api/orders/route.ts` → `/api/orders`; route groups and parallel slots don't show in URLs. */
function appRouterPath(file: string): string {
  const dir = file.match(/(?:^|\/)app\/(.*?)(?:route|page)\.\w+$/)?.[1] ?? "";
  return `/${dir.split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@")).join("/")}`;
}

/** `pages/api/orders.ts` → `/api/orders`, `pages/index.tsx` → `/`. */
function pagesRouterPath(file: string): string {
  const path = file.match(/(?:^|\/)pages\/(.+)\.\w+$/)?.[1] ?? "";
  return `/${path.replace(/(^|\/)index$/, "")}`;
}

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

/** Names passed as handlers to route registrations anywhere in the PR's files, with their route. */
function registeredHandlers(files: AnalyzeInput["files"]): Map<string, Route | undefined> {
  const handlers = new Map<string, Route | undefined>();
  for (const file of files) {
    if (file.head === undefined || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path)) continue;
    for (const [, method, path, args] of file.head.matchAll(ROUTE_REGISTRATION)) {
      for (const argument of args!.split(",")) {
        const name = argument.trim().match(/^([A-Za-z_$][\w$]*)(?:\.bind\(.*)?$/)?.[1];
        if (name && !handlers.has(name)) handlers.set(name, route(method === "all" ? undefined : method, path));
      }
    }
  }
  return handlers;
}

type Found = { type: EntryPointType; route?: Route };

const found = (type: EntryPointType, r?: Route): Found => (r ? { type, route: r } : { type });

function annotationRoute(annotation: string): Route | undefined {
  const decorator = annotation.match(DECORATOR_ROUTE);
  if (decorator) return route(HTTP_VERBS.has(decorator[1]!) ? decorator[1] : undefined, decorator[2]);
  const mapping = annotation.match(MAPPING_ROUTE);
  if (mapping) return route(mapping[1] === "Request" ? undefined : mapping[1], mapping[2]);
  return undefined;
}

function entryPointOf(unit: Unit, handlers: Map<string, Route | undefined>): Found | undefined {
  const code = unit.after ?? unit.before ?? "";
  if (unit.unitKind === "file") return /^if __name__ == ["']__main__["']\s*:/m.test(code) ? found("command") : undefined;
  if (unit.unitKind !== "declaration") return undefined;
  const isDefaultExport = /^export\s+default\b/.test(code);
  if (NEXT_API.test(unit.file) && isDefaultExport) return found("apiRoute", route(undefined, pagesRouterPath(unit.file)));
  if (NEXT_PAGE.test(unit.file) && isDefaultExport) {
    const path = /(?:^|\/)pages\//.test(unit.file) ? pagesRouterPath(unit.file) : appRouterPath(unit.file);
    return found("page", route(undefined, path));
  }
  if (NEXT_ROUTE.test(unit.file) && HTTP_METHODS.has(unit.name) && /^export\b/.test(code)) {
    return found("apiRoute", route(unit.name, appRouterPath(unit.file)));
  }
  for (const annotation of leadingAnnotations(code)) {
    const rule = ANNOTATIONS.find(([pattern]) => pattern.test(annotation));
    if (rule) return found(rule[1], annotationRoute(annotation));
  }
  const name = simpleName(unit.name);
  if (handlers.has(name) && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(unit.file)) return found("apiRoute", handlers.get(name));
  return undefined;
}

/** Entry points by framework rules (changes.md §5.8), one per unit at most. */
export function entryPointsOf(units: Unit[], files: AnalyzeInput["files"]): EntryPoint[] {
  const handlers = registeredHandlers(files);
  return units.flatMap((unit) => {
    if (unit.verdict === "notAChange") return [];
    const entry = entryPointOf(unit, handlers);
    return entry ? [{ unitId: unit.id, ...entry }] : [];
  });
}
