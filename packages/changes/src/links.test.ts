import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { untested } from "./links.js";
import type { AnalyzeInput, Unit } from "./schema.js";

type File = AnalyzeInput["files"][number];
const modified = (path: string, base: string, head: string): File => ({ path, status: "modified", base, head });
const added = (path: string, head: string): File => ({ path, status: "added", head });

async function links(...files: File[]) {
  return (await analyze({ files })).links.map((l) => `${l.from.split("#")[1]} ${l.type} ${l.to.split("#")[1]}`);
}

describe("linksOf", () => {
  it("links a unit to the changed declarations it names", async () => {
    const base = "export function total(a: number[]) {\n  return a.length;\n}\nexport class Cart {\n  sum() { return 1; }\n}\nexport function show() {\n  return 0;\n}\n";
    const head = "export function total(a: number[]) {\n  return a.length * 2;\n}\nexport class Cart {\n  sum() { return 2; }\n}\nexport function show() {\n  return total([]) + new Cart().sum();\n}\n";
    expect(await links(modified("src/a.ts", base, head))).toEqual(["show calls total", "show calls Cart.sum"]);
  });

  it("calls a test's link covers, by name", async () => {
    const page = modified("app/page.tsx", "export function Page() {\n  return <p>a</p>;\n}\n", "export function Page() {\n  return <p>b</p>;\n}\n");
    const test = modified(
      "app/page.test.tsx",
      'it("renders", () => {\n  render(<Page />);\n  check("a");\n});\n',
      'it("renders", () => {\n  render(<Page />);\n  check("b");\n});\n',
    );
    expect(await links(page, test)).toEqual(["renders covers Page"]);
  });

  it("never links into a test case named like the code it tests", async () => {
    const code = modified("src/limit.ts", "export function allow() {\n  return 1;\n}\n", "export function allow() {\n  return 2;\n}\n");
    const caller = modified("src/route.ts", "export function handle() {\n  return 1;\n}\n", "export function handle() {\n  return allow();\n}\n");
    const test = added("src/limit.test.ts", 'describe("allow", () => {\n  it("allows", () => {\n    allow();\n  });\n});\n');
    const found = await links(code, caller, test);
    expect(found.filter((l) => l.startsWith("handle "))).toEqual(["handle calls allow"]);
  });

  it("covers what a test file imports, even unnamed", async () => {
    const lib = modified("src/money/format.ts", "export function cents(n: number) {\n  return n;\n}\n", "export function cents(n: number) {\n  return n * 100;\n}\n");
    const test = added("tests/money.test.ts", 'import * as money from "../src/money/format";\nit("formats", () => {\n  expect(money.toString()).toBe("x");\n});\n');
    expect(await links(lib, test)).toEqual(["formats covers cents"]);
  });

  it.each<[string, File, File]>([
    [
      "Python",
      modified("shop/cart.py", "def total(x):\n    return x\n", "def total(x):\n    return x * 2\n"),
      added("tests/test_cart.py", "from shop import (\n    cart,\n    other as o,\n)\nimport os\n\ndef test_it():\n    assert cart\n"),
    ],
    [
      "Java",
      modified("src/main/java/com/acme/Money.java", "class Money {\n  int c() { return 1; }\n}\n", "class Money {\n  int c() { return 2; }\n}\n"),
      added("src/test/java/com/acme/MoneyTest.java", "import com.acme.Money;\nclass MoneyTest {\n  void it() {}\n}\n"),
    ],
  ])("follows %s imports", async (_language, lib, test) => {
    const found = await links(lib, test);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((l) => l.includes(" covers "))).toBe(true);
  });

  it("doesn't link tests to tests, or anything to a unit that didn't change", async () => {
    const tests = modified(
      "a.test.ts",
      'it("one", () => {\n  a();\n});\nit("two", () => {\n  b();\n});\n',
      'it("one", () => {\n  a(1);\n});\nit("two", () => {\n  b(1);\n});\n',
    );
    expect(await links(tests)).toEqual([]);
    const formatted = modified("src/a.ts", "export function f() {\n    return 1;\n}\nexport function g() {\n  return 1;\n}\n", "export function f() {\n  return 1;\n}\nexport function g() {\n  return f();\n}\n");
    expect(await links(formatted)).toEqual([]);
  });
});

describe("untested", () => {
  const unit = (id: string, verdict: Unit["verdict"] = "behavioural") => ({ id, verdict }) as Unit;
  const covered = [{ from: "t#a", to: "src#f", type: "covers" as const }];

  it("flags behavioural logic and UI no test covers", () => {
    expect(untested(unit("src#g"), "logic", covered)).toBe(true);
    expect(untested(unit("src#g"), "ui", covered)).toBe(true);
    expect(untested(unit("src#f"), "logic", covered)).toBe(false);
  });

  it("leaves other kinds and structural units alone", () => {
    expect(untested(unit("src#g"), "configuration", [])).toBe(false);
    expect(untested(unit("src#g", "structural"), "logic", [])).toBe(false);
  });
});
