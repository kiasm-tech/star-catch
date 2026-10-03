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

describe("extract", () => {
  const before = `export function receipt(o: Order) {
  const lines = o.items.map(String);
  const subtotal = o.items.reduce(add, 0);
  const tax = subtotal * 0.2;
  lines.push(\`Total: \${subtotal + tax}\`);
  return lines;
}
`;
  const total = (body = "  const subtotal = o.items.reduce(add, 0);\n  const tax = subtotal * 0.2;\n  return subtotal + tax;\n") =>
    `export function total(o: Order) {\n${body}}\n`;
  const after = (push = "lines.push(`Total: ${total(o)}`);") =>
    `export function receipt(o: Order) {\n  const lines = o.items.map(String);\n  ${push}\n  return lines;\n}\n`;

  it("pairs a helper with the function its statements came from", async () => {
    expect(await summary(modified("src/r.ts", before, total() + after()))).toEqual({
      units: ["total structural added [extract]", "receipt structural bodyChanged [extract]"],
      refactorings: ["extract: total extracted from receipt → total, receipt"],
    });
  });

  it("follows the call through this. and self.", async () => {
    const base = "class Cart:\n    def total(self):\n        s = sum(self.items)\n        return round(s, 2)\n";
    const head = "class Cart:\n    def total(self):\n        s = self._sum()\n        return round(s, 2)\n\n    def _sum(self):\n        return sum(self.items)\n";
    expect((await summary(modified("shop/cart.py", base, head))).units).toEqual([
      "Cart.total structural bodyChanged [extract]",
      "Cart._sum structural added [extract]",
    ]);
  });

  it.each([
    ["the helper's body wasn't removed from it", total("  const subtotal = o.items.reduce(add, 1);\n  const tax = subtotal * 0.2;\n  return subtotal + tax;\n"), after()],
    ["an added statement doesn't call the helper", total(), after("lines.push(`Total: ${total(o)}`);\n  lines.push(\"thanks\");")],
    ["a leftover doesn't match once the call is replaced", total(), after("lines.push(`Sum: ${total(o)}`);")],
  ])("doesn't pair a near miss: %s", async (_case, helper, receipt) => {
    expect((await summary(modified("src/r.ts", before, helper + receipt))).units).toEqual([
      "total behavioural added",
      "receipt behavioural bodyChanged",
    ]);
  });

  it("doesn't call a new function plus a new call to it an extract", async () => {
    const base = "export function run() {\n  a();\n}\n";
    const head = "export function log() {\n  return 1;\n}\nexport function run() {\n  a();\n  log();\n}\n";
    expect((await summary(modified("src/r.ts", base, head))).units).toEqual(["log behavioural added", "run behavioural bodyChanged"]);
  });
});

describe("inline", () => {
  it("pairs a removed helper with the function it was inlined into", async () => {
    const base = "def total(o):\n    t = _tax(o)\n    return o.net + t\n\ndef _tax(o):\n    rate = o.rate\n    return o.net * rate\n";
    const head = "def total(o):\n    rate = o.rate\n    t = o.net * rate\n    return o.net + t\n";
    expect(await summary(modified("shop/tax.py", base, head))).toEqual({
      units: ["total structural bodyChanged [inline]", "_tax structural removed [inline]"],
      refactorings: ["inline: _tax inlined into total → _tax, total"],
    });
  });
});

describe("local renames", () => {
  it("call a parameter or local renamed throughout structural", async () => {
    const base = "export function area(w: number, h: number) {\n  const a = w * h;\n  return a;\n}\n";
    const head = "export function area(width: number, h: number) {\n  const size = width * h;\n  return size;\n}\n";
    expect(await summary(modified("src/a.ts", base, head))).toEqual({
      units: ["area structural signatureChanged [rename]"],
      refactorings: ["rename: w renamed to width, a renamed to size in area → area"],
    });
  });

  it("leave a swapped call behavioural: it isn't a name the unit binds", async () => {
    const base = "export function pick(x: number[]) {\n  return min(x);\n}\n";
    const head = "export function pick(x: number[]) {\n  return max(x);\n}\n";
    expect((await summary(modified("src/a.ts", base, head))).units).toEqual(["pick behavioural bodyChanged"]);
  });

  it("leave a rename that isn't one to one behavioural", async () => {
    const base = "def f(a, b):\n    return a + b\n";
    const head = "def f(a, b):\n    return a + a\n";
    expect((await summary(modified("src/a.py", base, head))).units).toEqual(["f behavioural bodyChanged"]);
  });
});
