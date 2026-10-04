import { XMLParser } from "fast-xml-parser";
import { parseJson, parseTomlFile } from "./config.js";
import { canonical, isPlainObject, keyEntries, type Entry } from "./entries.js";

const dependency = (name: string, value: unknown): Entry => ({ name, unitKind: "dependency", value: canonical(value) });
const rest = (fileName: string, value: unknown): Entry => ({ name: fileName, unitKind: "file", value: canonical(value) });

/** Python package names compare normalised (PEP 503): `Foo_Bar` is `foo-bar`. */
const pythonName = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");
const REQUIREMENT_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;

/** A requirement's normalised name, and the requirement with that name and without spaces. */
function requirement(spec: string): { name: string; value: string } | null {
  const match = REQUIREMENT_NAME.exec(spec);
  if (!match) return null;
  const name = pythonName(match[1]);
  return { name, value: name + spec.slice(match[0].length).replace(/\s+/g, "") };
}

/** The value at a dotted path, removed from `root` (a copy) once read. */
function take(root: Record<string, unknown>, path: string[]): unknown {
  let node: unknown = root;
  for (const key of path.slice(0, -1)) node = isPlainObject(node) ? node[key] : undefined;
  if (!isPlainObject(node)) return undefined;
  const value = node[path.at(-1)!];
  delete node[path.at(-1)!];
  return value;
}

/** Tables of name → spec (`dependencies.zod`) and the rest of the file. */
function tables(root: unknown, fileName: string, sections: string[][]): Entry[] {
  if (!isPlainObject(root)) return keyEntries(root, fileName);
  const copy = structuredClone(root);
  const entries = sections.flatMap((path) => {
    const table = take(copy, path);
    return isPlainObject(table) ? Object.entries(table).map(([name, spec]) => dependency(`${path.join(".")}.${name}`, spec)) : [];
  });
  return [...entries, rest(fileName, copy)];
}

function packageJson(text: string, fileName: string): Entry[] {
  return tables(parseJson(text), fileName, [["dependencies"], ["devDependencies"], ["peerDependencies"], ["optionalDependencies"]]);
}

function cargoToml(text: string, fileName: string): Entry[] {
  return tables(parseTomlFile(text), fileName, [["dependencies"], ["dev-dependencies"], ["build-dependencies"], ["workspace", "dependencies"]]);
}

/** PEP 621 lists of requirement strings, and Poetry's tables. */
function pyprojectToml(text: string, fileName: string): Entry[] {
  const root = parseTomlFile(text);
  if (!isPlainObject(root)) return keyEntries(root, fileName);
  const copy = structuredClone(root);
  const list = (section: string, specs: unknown): Entry[] =>
    Array.isArray(specs)
      ? specs.flatMap((spec) => {
          const parsed = typeof spec === "string" ? requirement(spec) : null;
          return parsed ? [dependency(`${section}.${parsed.name}`, parsed.value)] : [];
        })
      : [];
  const entries = list("project.dependencies", take(copy, ["project", "dependencies"]));
  const optional = take(copy, ["project", "optional-dependencies"]);
  if (isPlainObject(optional)) {
    for (const [group, specs] of Object.entries(optional)) entries.push(...list(`project.optional-dependencies.${group}`, specs));
  }
  const poetry: string[][] = [["tool", "poetry", "dependencies"], ["tool", "poetry", "dev-dependencies"]];
  const groups = (copy.tool as { poetry?: { group?: Record<string, unknown> } } | undefined)?.poetry?.group;
  if (isPlainObject(groups)) for (const group of Object.keys(groups)) poetry.push(["tool", "poetry", "group", group, "dependencies"]);
  for (const path of poetry) {
    const table = take(copy, path);
    if (isPlainObject(table)) {
      for (const [name, spec] of Object.entries(table)) entries.push(dependency(`${path.join(".")}.${pythonName(name)}`, spec));
    }
  }
  return [...entries, rest(fileName, copy)];
}

/** Line rules: comments and blank lines drop out; options (`-r`, `--index-url`) are the rest. */
function requirementsTxt(text: string, fileName: string): Entry[] {
  const entries: Entry[] = [];
  const other: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (line === "") continue;
    const parsed = line.startsWith("-") ? null : requirement(line);
    if (parsed) entries.push(dependency(`dependencies.${parsed.name}`, parsed.value));
    else other.push(line);
  }
  return [...entries, rest(fileName, other)];
}

/** `require` lines, single or in a block; `// indirect` stays part of the value. */
function goMod(text: string, fileName: string): Entry[] {
  const entries: Entry[] = [];
  const other: string[] = [];
  let inRequire = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    if (/^require\s*\($/.test(line)) {
      inRequire = true;
      continue;
    }
    if (inRequire && line === ")") {
      inRequire = false;
      continue;
    }
    const spec = inRequire ? line : /^require\s+(.+)$/.exec(line)?.[1];
    const [module, ...version] = spec?.split(/\s+/) ?? [];
    if (module) entries.push(dependency(`require.${module}`, version.join(" ")));
    else other.push(line.replace(/\s+/g, " "));
  }
  return [...entries, rest(fileName, other)];
}

function pomXml(text: string, fileName: string): Entry[] {
  const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => name === "dependency" });
  const root = parser.parse(text) as { project?: Record<string, unknown> };
  const project = structuredClone(root.project ?? {});
  const entries: Entry[] = [];
  for (const path of [["dependencies"], ["dependencyManagement", "dependencies"]]) {
    const list = (take(project, path) as { dependency?: Record<string, unknown>[] } | undefined)?.dependency ?? [];
    for (const { groupId, artifactId, ...spec } of list) {
      entries.push(dependency(`${path.join(".")}.${String(groupId)}:${String(artifactId)}`, spec));
    }
  }
  return [...entries, rest(fileName, project)];
}

const GRADLE_DEPENDENCY =
  /^\s*(implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|annotationProcessor|kapt|ksp)\s*\(?\s*["']([^"':]+):([^"':]+)(?::([^"']+))?["']/;

function buildGradle(text: string, fileName: string): Entry[] {
  const entries: Entry[] = [];
  const other: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) continue;
    const match = GRADLE_DEPENDENCY.exec(line);
    if (match) entries.push(dependency(`${match[1]}.${match[2]}:${match[3]}`, match[4] ?? ""));
    else other.push(line.replace(/\s+/g, " "));
  }
  return [...entries, rest(fileName, other)];
}

const READERS: [RegExp, (text: string, fileName: string) => Entry[]][] = [
  [/^package\.json$/, packageJson],
  [/^Cargo\.toml$/, cargoToml],
  [/^pyproject\.toml$/, pyprojectToml],
  [/^requirements[^/]*\.txt$/, requirementsTxt],
  [/^go\.mod$/, goMod],
  [/^pom\.xml$/, pomXml],
  [/^build\.gradle(\.kts)?$/, buildGradle],
];

/** A manifest's dependencies and the rest of it; null when the file isn't a manifest we read. */
export function manifestEntries(fileName: string, text: string): Entry[] | null {
  const reader = READERS.find(([pattern]) => pattern.test(fileName))?.[1];
  return reader ? reader(text, fileName) : null;
}
