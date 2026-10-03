import { describe, expect, it } from "vitest";
import { analyze } from "../analyze.js";
import type { AnalyzeInput } from "../schema.js";

type File = AnalyzeInput["files"][number];
const modified = (path: string, base: string, head: string): File => ({ path, status: "modified", base, head });

async function summary(...files: File[]) {
  const changes = await analyze({ files });
  return {
    units: changes.units.map((u) => `${u.name} ${u.verdict} ${u.changeType}${u.refactorings.length > 0 ? ` [${u.refactorings.join(", ")}]` : ""}`),
    refactorings: changes.refactorings.map((r) => `${r.type}: ${r.description} → ${r.unitIds.map((id) => id.split("#")[1]).join(", ")}`),
  };
}

describe("renames", () => {
  it("pairs a renamed function with its callers", async () => {
    const base = "function total(a: number) {\n  return a * 2;\n}\nexport function sum() {\n  return total(1) + total(2);\n}\n";
    const head = "function doubled(a: number) {\n  return a * 2;\n}\nexport function sum() {\n  return doubled(1) + doubled(2);\n}\n";
    expect(await summary(modified("src/a.ts", base, head))).toEqual({
      units: ["doubled structural signatureChanged [rename]", "sum structural bodyChanged [rename]"],
      refactorings: ["rename: total renamed to doubled → doubled, sum"],
    });
  });

  it("follows a recursive call through the rename", async () => {
    const base = "function f(n: number): number {\n  return n <= 0 ? 0 : f(n - 1);\n}\n";
    const head = "function g(n: number): number {\n  return n <= 0 ? 0 : g(n - 1);\n}\n";
    expect((await summary(modified("src/a.ts", base, head))).units).toEqual(["g structural signatureChanged [rename]"]);
  });

  it("pairs a retitled test", async () => {
    const base = 'it("adds", () => {\n  expect(add(1, 1)).toBe(2);\n});\n';
    const head = 'it("adds two numbers", () => {\n  expect(add(1, 1)).toBe(2);\n});\n';
    expect((await summary(modified("src/a.test.ts", base, head))).units).toEqual([
      "adds two numbers structural signatureChanged [rename]",
    ]);
  });

  it("doesn't pair a near miss: the body changed too", async () => {
    const base = "function total(a: number) {\n  return a * 2;\n}\n";
    const head = "function doubled(a: number) {\n  return a * 3;\n}\n";
    expect((await summary(modified("src/a.ts", base, head))).units).toEqual([
      "doubled behavioural added",
      "total behavioural removed",
    ]);
  });

  it("leaves a caller behavioural when it changed besides the rename", async () => {
    const base = "function total() {\n  return 1;\n}\nexport function sum() {\n  return total();\n}\n";
    const head = "function one() {\n  return 1;\n}\nexport function sum() {\n  return one() + 1;\n}\n";
    expect((await summary(modified("src/a.ts", base, head))).units).toEqual([
      "one structural signatureChanged [rename]",
      "sum behavioural bodyChanged",
    ]);
  });

  it("doesn't take a string with the old name for a caller", async () => {
    const base = 'function total() {\n  return 1;\n}\nexport const label = "total";\n';
    const head = 'function one() {\n  return 1;\n}\nexport const label = "one";\n';
    expect((await summary(modified("src/a.ts", base, head))).units).toEqual([
      "one structural signatureChanged [rename]",
      "label behavioural bodyChanged",
    ]);
  });
});

describe("moves", () => {
  const order = (body: string) => `public class Orders {\n  public String receipt(long c) {\n    return ${body};\n  }\n${"FORMAT"}}\n`;
  const format = "  static String format(long cents) {\n    return String.valueOf(cents / 100);\n  }\n";

  it("pairs a method moved to another class, and its callers' new qualifier", async () => {
    const result = await summary(
      modified("src/Orders.java", order("format(c)").replace("FORMAT", format), order("Money.format(c)").replace("FORMAT", "")),
      modified("src/Money.java", "public class Money {\n}\n", `public class Money {\n${format}}\n`),
    );
    expect(result).toEqual({
      units: ["Orders.receipt structural bodyChanged [move]", "Money.format structural moved [move]"],
      refactorings: ["move: Orders.format moved to Money.format in src/Money.java → Money.format, Orders.receipt"],
    });
  });

  it("pairs a move that also renames", async () => {
    const result = await summary(
      modified("src/a.ts", "export function fmt(c: number) {\n  return c / 100;\n}\n", "export {};\n"),
      modified("src/b.ts", "export {};\n", "export {};\nexport function formatCents(c: number) {\n  return c / 100;\n}\n"),
    );
    expect(result.units).toContain("formatCents structural moved [rename, move]");
    expect(result.refactorings).toEqual([
      "rename: fmt renamed to formatCents → formatCents",
      "move: fmt moved to formatCents in src/b.ts → formatCents",
    ]);
  });

  it("drops this. and self. before a moved name", async () => {
    const base = "class A:\n    def run(self):\n        return self.helper()\n\n    def helper(self):\n        return 1\n";
    const head = "class A:\n    def run(self):\n        return helper()\n\n\ndef helper(self):\n    return 1\n";
    expect((await summary(modified("src/a.py", base, head))).units).toEqual([
      "A.run structural bodyChanged [move]",
      "helper structural moved [move]",
    ]);
  });

  it("moves within a language family, never across", async () => {
    const fn = "export function f(c) {\n  return c / 100;\n}\n";
    const across = await summary({ path: "src/a.ts", status: "removed", base: fn }, { path: "src/b.js", status: "added", head: fn });
    expect(across.units).toEqual(["f structural moved [move]"]);
    const foreign = await summary(
      { path: "src/a.ts", status: "removed", base: "export function f() {}\n" },
      { path: "src/b.py", status: "added", head: "def f():\n    pass\n" },
    );
    expect(foreign.units).toEqual(["f behavioural removed", "f behavioural added"]);
  });

  it("prefers a candidate in the same file and container", async () => {
    const twin = "  run() {\n    return 1;\n  }\n";
    const result = await summary(
      modified("src/a.ts", `class A {\n${twin}}\nclass B {\n}\n`, `class A {\n  go() {\n    return 1;\n  }\n}\nclass B {\n${twin}}\n`),
    );
    expect(result.units).toEqual(["A.go structural signatureChanged [rename]", "B.run behavioural added"]);
  });
});
