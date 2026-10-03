import { describe, expect, it } from "vitest";
import { compareCode, type CompareResult } from "./compare.js";
import type { CodeLanguage } from "./parse.js";

const later = { deadline: Number.POSITIVE_INFINITY };
const PATHS: Record<CodeLanguage, string> = {
  typescript: "src/a.ts",
  tsx: "src/a.tsx",
  javascript: "src/a.js",
  python: "src/a.py",
  java: "src/A.java",
};

async function compare(language: CodeLanguage, base: string, head: string): Promise<Extract<CompareResult, { units: unknown }>> {
  const result = await compareCode(
    { file: { path: PATHS[language], status: "modified", base, head }, language, fileClass: "source", component: "src" },
    later,
  );
  if ("error" in result) throw new Error(result.error);
  return result;
}

/** The change type of the one changed unit. */
async function changeType(language: CodeLanguage, base: string, head: string): Promise<string> {
  const { units } = await compare(language, base, head);
  expect(units).toHaveLength(1);
  return (units[0] as { changeType: string }).changeType;
}

describe("change types", () => {
  it.each<[CodeLanguage, string, string]>([
    ["typescript", "function f(q: number) {\n  if (q >= 10) return 1;\n  return 0;\n}\n", "function f(q: number) {\n  if (q >= 5) return 1;\n  return 0;\n}\n"],
    ["javascript", "function f(q) {\n  while (q > 0 && ok) q--;\n}\n", "function f(q) {\n  while (q > 1 && ok) q--;\n}\n"],
    ["python", "def f(q):\n    if q >= 50:\n        return 0\n    return 1\n", "def f(q):\n    if q >= 40:\n        return 0\n    return 1\n"],
    ["java", "class A {\n  int f(int q) {\n    return q > 1 ? 1 : 0;\n  }\n}\n", "class A {\n  int f(int q) {\n    return q > 2 ? 1 : 0;\n  }\n}\n"],
  ])("%s: a threshold change is a condition change", async (language, base, head) => {
    expect(await changeType(language, base, head)).toBe("conditionChanged");
  });

  it.each<[string, CodeLanguage, string, string]>([
    ["a ternary's condition", "typescript", "const f = () => (a ? 1 : 2);\n", "const f = () => (!a ? 1 : 2);\n"],
    ["a case value", "typescript", "function f(k: string) {\n  switch (k) {\n    case \"a\": return 1;\n  }\n}\n", "function f(k: string) {\n  switch (k) {\n    case \"b\": return 1;\n  }\n}\n"],
    ["a Java case value", "java", "class A {\n  int f(int k) {\n    switch (k) { case 1: return 1; }\n    return 0;\n  }\n}\n", "class A {\n  int f(int k) {\n    switch (k) { case 2: return 1; }\n    return 0;\n  }\n}\n"],
    ["Python's a-if-cond-else-b", "python", "def f(x):\n    return 1 if x else 2\n", "def f(x):\n    return 1 if not x else 2\n"],
    ["a Python boolean", "python", "def f(a, b):\n    while a and b:\n        pass\n", "def f(a, b):\n    while a or b:\n        pass\n"],
  ])("finds %s", async (_case, language, base, head) => {
    expect(await changeType(language, base, head)).toBe("conditionChanged");
  });

  it.each<[string, CodeLanguage, string, string]>([
    ["a parameter", "typescript", "function f(a: number) {\n  return a;\n}\n", "function f(a: number, b = 0) {\n  return a;\n}\n"],
    ["a return type", "typescript", "function f(): number {\n  return 1;\n}\n", "function f(): string {\n  return 1;\n}\n"],
    ["a decorator", "typescript", "class A {\n  @Get(\"/a\") run() {}\n}\n", "class A {\n  @Get(\"/b\") run() {}\n}\n"],
    ["a variable's type", "typescript", "export const limit: number = 5;\n", "export const limit: bigint = 5;\n"],
    ["a Python parameter", "python", "def f(a):\n    return a\n", "def f(a, b=0):\n    return a\n"],
    ["a Java modifier", "java", "class A {\n  public int f() { return 1; }\n}\n", "class A {\n  private int f() { return 1; }\n}\n"],
    ["a signature and a body together", "typescript", "function f(a: number) {\n  return a;\n}\n", "function f(a: string) {\n  return a + 1;\n}\n"],
  ])("calls %s a signature change", async (_case, language, base, head) => {
    expect(await changeType(language, base, head)).toBe("signatureChanged");
  });

  it.each<[string, CodeLanguage, string, string]>([
    ["a statement", "typescript", "function f() {\n  a();\n}\n", "function f() {\n  b();\n}\n"],
    ["a variable's value", "typescript", "export const limit = 5;\n", "export const limit = 6;\n"],
    ["a Python field's value", "python", "class A:\n    rate = 0.1\n", "class A:\n    rate = 0.2\n"],
    ["a condition and a statement together", "typescript", "function f(q: number) {\n  if (q > 1) a();\n}\n", "function f(q: number) {\n  if (q > 2) b();\n}\n"],
    ["arithmetic that isn't a comparison", "typescript", "function f(q: number) {\n  return q * 2;\n}\n", "function f(q: number) {\n  return q * 3;\n}\n"],
  ])("calls %s a body change", async (_case, language, base, head) => {
    expect(await changeType(language, base, head)).toBe("bodyChanged");
  });
});

describe("test cases", () => {
  it("are named by their title, so a new title is a different test until rename detection pairs them", async () => {
    const { units } = await compare("typescript", "it(\"adds\", () => {\n  add();\n});\n", "it(\"adds two\", () => {\n  add();\n});\n");
    expect(units).toMatchObject([
      { name: "adds", changeType: "removed" },
      { name: "adds two", changeType: "added" },
    ]);
  });

  it("change in their body", async () => {
    expect(await changeType("typescript", "it(\"adds\", () => {\n  add(1);\n});\n", "it(\"adds\", () => {\n  add(2);\n});\n")).toBe("bodyChanged");
  });
});

describe("parse errors", () => {
  it("make a changed declaration they touch a body change and the file degraded", async () => {
    const result = await compare(
      "typescript",
      "function f(q: number) {\n  if (q > 1) return 1;\n  return 0;\n}\n",
      "function f(q: number) {\n  if (q > 2) return 1 +;\n  return 0;\n}\n",
    );
    expect(result.units).toMatchObject([{ name: "f", changeType: "bodyChanged" }]);
    expect(result.degraded).toBe(true);
  });

  it("elsewhere don't degrade the file", async () => {
    const broken = "function g() {\n  return (;\n}\n";
    const result = await compare(
      "typescript",
      `${broken}function f(q: number) {\n  if (q > 1) return 1;\n}\n`,
      `${broken}function f(q: number) {\n  if (q > 2) return 1;\n}\n`,
    );
    expect(result.units).toMatchObject([{ name: "f", changeType: "conditionChanged" }]);
    expect(result.degraded).toBe(false);
  });
});
