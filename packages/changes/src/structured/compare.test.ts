import { describe, expect, it } from "vitest";
import { languageOf } from "../languages/registry.js";
import { triage } from "../triage.js";
import { compareStructured } from "./compare.js";

/** Units as `name kind verdict changeType`, for a modified file. */
function changes(path: string, base: string, head: string): string[] {
  const triaged = triage({ path, head });
  const fileClass = "fileClass" in triaged ? triaged.fileClass : "config";
  const result = compareStructured({
    file: { path, status: "modified", base, head },
    language: languageOf(path).language,
    fileClass,
    component: "root",
  });
  if ("error" in result) return [`error: ${result.error}`];
  return result.units.map((u) => `${u.name} ${u.unitKind} ${u.verdict} ${u.changeType}`);
}

describe("config files", () => {
  it("compares JSON keys at the top level and one level down", () => {
    const base = '{ "debug": false, "server": { "port": 80, "tls": { "on": true } }, "old": 1 }';
    const head = '{ "debug": true, "server": { "port": 80, "tls": { "on": false }, "host": "x" }, "new": [1] }';
    expect(changes("config/app.json", base, head)).toEqual([
      "debug configKey behavioural bodyChanged",
      "server.tls configKey behavioural bodyChanged",
      "server.host configKey behavioural added",
      "new configKey behavioural added",
      "old configKey behavioural removed",
    ]);
  });

  it("reads JSONC and calls a reformat, a comment or a key reorder notAChange", () => {
    const base = '{\n  "a": 1, // one\n  "b": [1, 2],\n}\n';
    const head = '{ "b": [1,2], "a": 1 }\n';
    expect(changes("tsconfig.json", base, head)).toEqual(["tsconfig.json file notAChange bodyChanged"]);
  });

  it("gives a root that isn't an object one file unit", () => {
    expect(changes("data/list.json", "[1, 2]", "[1, 2, 3]")).toEqual(["list.json file behavioural bodyChanged"]);
  });

  it("prefixes the keys of a multi-document YAML file", () => {
    const base = "kind: Service\nspec:\n  port: 80\n---\nkind: Deployment\nreplicas: 1\n";
    const head = "kind: Service\nspec:\n  port: 8080\n---\nkind: Deployment\nreplicas: 1 # scaled later\n";
    expect(changes("k8s/app.yaml", base, head)).toEqual(["[0].spec.port configKey behavioural bodyChanged"]);
  });

  it("reads TOML tables", () => {
    const base = 'title = "a"\n[server]\nport = 80\n';
    const head = 'title = "a"\n[server]\nport = 81\n[cache]\nttl = 5\n';
    expect(changes("ruff.toml", base, head)).toEqual([
      "server.port configKey behavioural bodyChanged",
      "cache.ttl configKey behavioural added",
    ]);
  });

  it("reports a file it can't parse", () => {
    expect(changes("config/app.json", '{ "a": 1 }', '{ "a": ')).toEqual([expect.stringMatching(/^error: JSON: /)]);
    expect(changes("k8s/app.yaml", "a: 1\n", "a: [\n")).toEqual([expect.stringMatching(/^error: YAML: /)]);
  });
});

describe("manifests", () => {
  it("package.json: one unit per dependency, the rest as one file unit", () => {
    const base = JSON.stringify({ name: "shop", scripts: { test: "vitest" }, dependencies: { zod: "^3.0.0", react: "19.0.0" }, devDependencies: { vitest: "^3" } });
    const head = JSON.stringify({ name: "shop", scripts: { test: "vitest run" }, dependencies: { zod: "^4.0.0", react: "19.0.0", hono: "^4" }, devDependencies: {} });
    expect(changes("package.json", base, head)).toEqual([
      "dependencies.zod dependency behavioural bodyChanged",
      "dependencies.hono dependency behavioural added",
      "package.json file behavioural bodyChanged",
      "devDependencies.vitest dependency behavioural removed",
    ]);
  });

  it("requirements.txt: names compare normalised; comments and spacing don't count", () => {
    const base = "Django>=4.2  # web\nrequests==2.31\n-r base.txt\n";
    const head = "django >= 4.2\nrequests==2.32\npydantic_core==2\n-r base.txt\n";
    expect(changes("requirements.txt", base, head)).toEqual([
      "dependencies.requests dependency behavioural bodyChanged",
      "dependencies.pydantic-core dependency behavioural added",
    ]);
  });

  it("pyproject.toml: PEP 621 lists and Poetry tables", () => {
    const base = '[project]\nname = "shop"\ndependencies = ["requests>=2"]\n[project.optional-dependencies]\ndev = ["pytest"]\n[tool.poetry.group.docs.dependencies]\nmkdocs = "^1"\n';
    const head = '[project]\nname = "shop"\ndependencies = ["requests>=2.31", "httpx"]\n[project.optional-dependencies]\ndev = ["pytest"]\n[tool.poetry.group.docs.dependencies]\nmkdocs = "^1.6"\n';
    expect(changes("pyproject.toml", base, head)).toEqual([
      "project.dependencies.requests dependency behavioural bodyChanged",
      "project.dependencies.httpx dependency behavioural added",
      "tool.poetry.group.docs.dependencies.mkdocs dependency behavioural bodyChanged",
    ]);
  });

  it("Cargo.toml: dependency tables", () => {
    const base = '[package]\nname = "shop"\n[dependencies]\nserde = "1"\n[dev-dependencies]\ninsta = "1"\n';
    const head = '[package]\nname = "shop"\n[dependencies]\nserde = { version = "1", features = ["derive"] }\n[dev-dependencies]\ninsta = "1"\n';
    expect(changes("Cargo.toml", base, head)).toEqual(["dependencies.serde dependency behavioural bodyChanged"]);
  });

  it("go.mod: single and block requires", () => {
    const base = "module acme/shop\n\ngo 1.22\n\nrequire github.com/a/b v1.0.0\n\nrequire (\n\tgithub.com/c/d v0.1.0 // indirect\n)\n";
    const head = "module acme/shop\n\ngo 1.23\n\nrequire github.com/a/b v1.1.0\n\nrequire (\n\tgithub.com/c/d v0.1.0 // indirect\n\tgithub.com/e/f v2.0.0\n)\n";
    expect(changes("go.mod", base, head)).toEqual([
      "require.github.com/a/b dependency behavioural bodyChanged",
      "require.github.com/e/f dependency behavioural added",
      "go.mod file behavioural bodyChanged",
    ]);
  });

  it("pom.xml: dependencies by group and artifact", () => {
    const pom = (version: string, extra = "") =>
      `<project><artifactId>shop</artifactId><dependencies><dependency><groupId>org.junit</groupId><artifactId>junit</artifactId><version>${version}</version><scope>test</scope></dependency>${extra}</dependencies></project>`;
    const extra = "<dependency><groupId>com.acme</groupId><artifactId>money</artifactId><version>1</version></dependency>";
    expect(changes("pom.xml", pom("5.10"), pom("5.11", extra))).toEqual([
      "dependencies.org.junit:junit dependency behavioural bodyChanged",
      "dependencies.com.acme:money dependency behavioural added",
    ]);
  });

  it("build.gradle: dependency lines in Groovy and Kotlin", () => {
    const base = 'plugins { id "java" }\ndependencies {\n  implementation "com.squareup:okhttp:4.12.0"\n}\n';
    const head = 'plugins { id "java" }\ndependencies {\n  implementation("com.squareup:okhttp:5.0.0")\n  testImplementation("org.junit:junit:5")\n}\n';
    expect(changes("app/build.gradle.kts", base, head)).toEqual([
      "implementation.com.squareup:okhttp dependency behavioural bodyChanged",
      "testImplementation.org.junit:junit dependency behavioural added",
    ]);
  });
});
