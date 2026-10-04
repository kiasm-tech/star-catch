import { describe, expect, it } from "vitest";
import type { AnalyzeInput, Unit } from "../schema.js";
import { compareCode } from "./compare.js";
import type { CodeLanguage } from "./parse.js";

type File = AnalyzeInput["files"][number];
const later = { deadline: Number.POSITIVE_INFINITY };

async function units(file: File, language: CodeLanguage = "typescript"): Promise<Unit[]> {
  const result = await compareCode({ file, language, fileClass: "source", component: "src" }, later);
  if ("error" in result) throw new Error(result.error);
  return result.units;
}

const modified = (base: string, head: string, path = "src/cart.ts"): File => ({ path, status: "modified", base, head });
const summary = (found: Unit[]) => found.map((u) => `${u.name} ${u.unitKind} ${u.verdict} ${u.changeType}`);

describe("compareCode", () => {
  it("reports nothing for an unchanged file", async () => {
    const source = 'import { a } from "a";\nexport function f() {\n  return a;\n}\n';
    expect(await units(modified(source, source))).toEqual([]);
  });

  it("calls an edit that keeps every token notAChange, and one that doesn't behavioural", async () => {
    const base = "export function f(a: number) {\n  return a + 1; // one\n}\nexport function g() {\n  return 1;\n}\n";
    const head = "export function f(a: number) {\n  return a + 1; // plus one\n}\nexport function g() {\n  return 2;\n}\n";
    expect(summary(await units(modified(base, head)))).toEqual([
      "f declaration notAChange bodyChanged",
      "g declaration behavioural bodyChanged",
    ]);
  });

  it("reports declarations on one side only as added and removed", async () => {
    const base = "export function kept() {}\nexport function gone() {}\n";
    const head = "export function kept() {}\nexport function fresh() {\n  return kept();\n}\n";
    const found = await units(modified(base, head));
    // Both start on line 2; ties go by id.
    expect(summary(found)).toEqual(["fresh declaration behavioural added", "gone declaration behavioural removed"]);
    expect(found[0]).toMatchObject({ span: { head: [2, 4] }, after: "export function fresh() {\n  return kept();\n}", references: ["kept"] });
    expect(found[1]).toMatchObject({ span: { base: [2, 2] }, before: "export function gone() {}", references: [] });
  });

  it("doesn't report a container whose only change is a member added or removed", async () => {
    expect(summary(await units(modified("export class Money {\n}\n", "export class Money {\n  cents() {}\n}\n")))).toEqual([
      "Money.cents declaration behavioural added",
    ]);
    expect(summary(await units(modified("class A {\n  a() {}\n  b() {}\n}\n", "class A {\n  a() {}\n}\n")))).toEqual([
      "A.b declaration behavioural removed",
    ]);
  });

  it("gives the residue its own file unit, notAChange when only reformatted", async () => {
    const body = "export function f() {}\n";
    expect(summary(await units(modified(`import {a} from "a";\n${body}`, `import { a } from "a";\n${body}`)))).toEqual([
      "cart.ts file notAChange bodyChanged",
    ]);
    expect(summary(await units(modified(`import { a } from "a";\n${body}`, `import { a, b } from "a";\n${body}`)))).toEqual([
      "cart.ts file behavioural bodyChanged",
    ]);
  });

  it("reads an added or removed file from its one side", async () => {
    const source = 'import { a } from "a";\nexport function f() {}\n';
    expect(summary(await units({ path: "src/new.ts", status: "added", head: source }))).toEqual([
      "new.ts file behavioural added",
      "f declaration behavioural added",
    ]);
    expect(summary(await units({ path: "src/old.ts", status: "removed", base: source }))).toEqual([
      "old.ts file behavioural removed",
      "f declaration behavioural removed",
    ]);
  });

  it("pairs a renamed file's declarations under the new path", async () => {
    const found = await units({
      path: "src/totals.ts",
      previousPath: "src/sum.ts",
      status: "renamed",
      base: "export function total() {\n  return 1;\n}\n",
      head: "export function total() {\n  return 2;\n}\n",
    });
    expect(found.map((u) => [u.id, u.verdict])).toEqual([["src/totals.ts#total", "behavioural"]]);
  });

  it("fills in what the context needs, within its limits", async () => {
    const long = `export function big() {\n${"  call();\n".repeat(400)}}\n`;
    const [unit] = await units(modified(long, long.replace("call();", "other();")));
    expect(unit).toMatchObject({ id: "src/cart.ts#big", file: "src/cart.ts", language: "typescript", component: "src", fileClass: "source" });
    expect(unit.before!.length).toBe(2_000);
    expect(unit.after!.length).toBe(2_000);
    expect(unit.references).toEqual(["other", "call"]);
  });

  it("reads Python and Java the same way", async () => {
    const py = await units(modified("def fee(x):\n    return x  # flat\n", "def fee(x):\n    return x * 2\n", "shop/fee.py"), "python");
    expect(summary(py)).toEqual(["fee declaration behavioural bodyChanged"]);
    const java = await units(
      modified("class A {\n  int f() { return 1; }\n}\n", "class A {\n  // doc\n  int f() { return 1; }\n}\n", "A.java"),
      "java",
    );
    expect(java).toEqual([]);
  });

  it("says why it couldn't compare a file", async () => {
    const missing = await compareCode(
      { file: { path: "src/a.ts", status: "modified", head: "x" }, language: "typescript", fileClass: "source", component: "src" },
      later,
    );
    expect(missing).toEqual({ error: "content missing from the snapshot" });
    let clock = 0;
    const big = Array.from({ length: 20_000 }, (_, i) => `export const v${i} = ${i};`).join("\n");
    const slow = await compareCode(
      { file: modified(big, big), language: "typescript", fileClass: "source", component: "src" },
      { deadline: 2, now: () => clock++ },
    );
    expect(slow).toEqual({ error: "parsing took longer than its budget" });
  });
});
