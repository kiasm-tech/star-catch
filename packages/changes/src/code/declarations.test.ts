import { loadRecordedSnapshots, loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { languageOf } from "../languages/registry.js";
import { declarationsOf } from "./declarations.js";
import { isCodeLanguage, parse, parserFor, type CodeLanguage } from "./parse.js";

const later = { deadline: Number.POSITIVE_INFINITY };

async function declarations(language: CodeLanguage, text: string) {
  const tree = parse(await parserFor(language), text, later)!;
  try {
    return (await declarationsOf(tree, language)).map(({ qualifiedName, category, start, end, lines }) => ({
      qualifiedName,
      category,
      text: text.slice(start, end),
      lines,
    }));
  } finally {
    tree.delete();
  }
}

const names = (found: { qualifiedName: string; category: string }[]) => found.map((d) => `${d.category} ${d.qualifiedName}`);

const TS = `import { z } from "zod";

export function total(items: number[]): number;
export function total(items: number[], tax: number): number;
export function total(items: number[], tax = 0) {
  function round(n: number) {
    return Math.round(n);
  }
  const local = 1;
  return round(items.reduce((a, b) => a + b, 0) * (1 + tax)) + local;
}

function* ids() {
  yield 1;
}

@Injectable()
export class Cart {
  #secret = 1;
  items: number[] = [];

  @Get()
  @Cache(60)
  total(): number {
    return total(this.items);
  }

  #hidden() {}
}

export abstract class Shape {
  abstract area(): number;
}

export interface Store {
  get(key: string): string;
}

export type Id = string;
export enum Color { Red, Green }

export const MAX = 10, MIN = 1;
let counter = 0;
var legacy = true;
export const handlers = {
  save() {
    return 1;
  },
};
`;

describe("declarationsOf: TypeScript", () => {
  it("finds every kind of declaration, qualified by its containers", async () => {
    expect(names(await declarations("typescript", TS))).toEqual([
      "callable total",
      "callable total (2)",
      "callable total (3)",
      "callable total (3).round",
      "callable ids",
      "type Cart",
      "variable Cart.#secret",
      "variable Cart.items",
      "callable Cart.total",
      "callable Cart.#hidden",
      "type Shape",
      "callable Shape.area",
      "type Store",
      "callable Store.get",
      "type Id",
      "type Color",
      "variable MAX",
      "variable MIN",
      "variable counter",
      "variable legacy",
      "variable handlers",
      "callable handlers.save",
    ]);
  });

  it("spans a declaration with its export keyword and decorators", async () => {
    const found = await declarations("typescript", TS);
    const byName = (name: string) => found.find((d) => d.qualifiedName === name)!;
    expect(byName("Cart").text).toMatch(/^@Injectable\(\)\nexport class Cart \{/);
    expect(byName("Cart.total").text).toMatch(/^@Get\(\)\n {2}@Cache\(60\)\n {2}total\(\): number \{/);
    expect(byName("Id").text).toBe("export type Id = string;");
    expect(byName("MAX").text).toBe("export const MAX = 10, MIN = 1;");
    expect(byName("Cart.total").lines).toEqual([22, 26]);
  });

  it("skips locals: only top-level variables are declarations", async () => {
    const found = names(await declarations("typescript", TS));
    expect(found.some((n) => n.includes("local"))).toBe(false);
  });
});

describe("declarationsOf: test cases", () => {
  const SUITE = `describe("persist", () => {
  it("rehydrates on mount", () => {});
  it.skip(\`skips \${"computed"} titles\`, () => {});
  test(\`keeps plain template titles\`, () => {});
  it.each([1, 2])("is not a single case %s", () => {});
  describe.only("nested", () => {
    it("runs", () => {
      function helper() {}
      helper();
    });
    it("runs", () => {});
  });
});
it('stands alone', () => {});
`;

  it("names each case by its title path and ignores titles that aren't literal", async () => {
    expect(names(await declarations("typescript", SUITE))).toEqual([
      "test persist",
      "test persist > rehydrates on mount",
      "test persist > keeps plain template titles",
      "test persist > nested",
      "test persist > nested > runs",
      "callable persist > nested > runs.helper",
      "test persist > nested > runs (2)",
      "test stands alone",
    ]);
  });
});

describe("declarationsOf: TSX and JavaScript", () => {
  it("reads components in TSX", async () => {
    const tsx = `export default function BillingPage({ plan }: { plan: string }) {\n  return <main><h1>{plan}</h1></main>;\n}\nexport const Badge = () => <span />;\n`;
    expect(names(await declarations("tsx", tsx))).toEqual(["callable BillingPage", "variable Badge"]);
  });

  it("reads JavaScript, including JSX and class fields", async () => {
    const js = `export class Widget {\n  size = 1;\n  #id = 2;\n  render() { return <div />; }\n}\nfunction helper() {}\nconst x = 1;\ntest("widget", () => {});\n`;
    expect(names(await declarations("javascript", js))).toEqual([
      "type Widget",
      "variable Widget.size",
      "variable Widget.#id",
      "callable Widget.render",
      "callable helper",
      "variable x",
      "test widget",
    ]);
  });
});

describe("declarationsOf: Python", () => {
  const PY = `"""Invoices."""
from dataclasses import dataclass

VAT: float = 0.21
LIMIT = 5
type Cents = int


@dataclass
class Invoice:
    """An invoice."""

    currency: str = "EUR"
    lines: list

    @property
    def total(self):
        def round2(n):
            return round(n, 2)

        subtotal = sum(self.lines)
        return round2(subtotal)

    def total(self, vat):
        return self.total * vat


@app.get("/invoices")
@cache
def list_invoices():
    return []


def test_totals():
    assert True
`;

  it("finds functions, classes, type aliases and module and class variables", async () => {
    expect(names(await declarations("python", PY))).toEqual([
      "variable VAT",
      "variable LIMIT",
      "type Cents",
      "type Invoice",
      "variable Invoice.currency",
      "variable Invoice.lines",
      "callable Invoice.total",
      "callable Invoice.total.round2",
      "callable Invoice.total (2)",
      "callable list_invoices",
      "callable test_totals",
    ]);
  });

  it("spans a declaration with its decorators", async () => {
    const found = await declarations("python", PY);
    expect(found.find((d) => d.qualifiedName === "Invoice")!.text).toMatch(/^@dataclass\nclass Invoice:/);
    expect(found.find((d) => d.qualifiedName === "list_invoices")!.text).toMatch(/^@app\.get\("\/invoices"\)\n@cache\ndef list_invoices/);
    expect(found.find((d) => d.qualifiedName === "Invoice.total")!.text).toMatch(/^@property\n {4}def total\(self\):/);
  });

  it("skips locals", async () => {
    expect(names(await declarations("python", PY)).some((n) => n.includes("subtotal"))).toBe(false);
  });
});

describe("declarationsOf: Java", () => {
  const JAVA = `package com.acme.shop;

import java.util.List;

/** Orders. */
public class OrderService {
    private static final long FREE = 5000, CAP = 9000;
    private final List<String> log = List.of();

    public OrderService() {}

    @Override
    public String toString() {
        return "orders";
    }

    public long total(long cents) {
        return cents;
    }

    public long total(long cents, long tax) {
        return cents + tax;
    }

    interface Rule {
        boolean applies(long cents);
    }

    enum Kind {
        PHYSICAL, DIGITAL;

        boolean shipped() {
            return this == PHYSICAL;
        }
    }
}

record Point(int x, int y) {
    Point {
    }
}

@interface Audited {
    String reason();
}
`;

  it("finds types, members, constructors and fields, qualified by their classes", async () => {
    expect(names(await declarations("java", JAVA))).toEqual([
      "type OrderService",
      "variable OrderService.FREE",
      "variable OrderService.CAP",
      "variable OrderService.log",
      "callable OrderService.OrderService",
      "callable OrderService.toString",
      "callable OrderService.total",
      "callable OrderService.total (2)",
      "type OrderService.Rule",
      "callable OrderService.Rule.applies",
      "type OrderService.Kind",
      "callable OrderService.Kind.shipped",
      "type Point",
      "callable Point.Point",
      "type Audited",
      "callable Audited.reason",
    ]);
  });

  it("keeps annotations in the span", async () => {
    const found = await declarations("java", JAVA);
    expect(found.find((d) => d.qualifiedName === "OrderService.toString")!.text).toMatch(/^@Override\n {4}public String toString/);
  });
});

describe("declarationsOf: the fixtures", () => {
  const files = [...loadSyntheticFixtures().map((f) => f.snapshot), ...loadRecordedSnapshots()].flatMap((snapshot) =>
    snapshot.files.flatMap((file) => {
      const { language } = languageOf(file.filename);
      if (!isCodeLanguage(language)) return [];
      return [file.baseContent, file.headContent].flatMap((text, side) =>
        text === undefined ? [] : [{ label: `${file.filename} ${side === 0 ? "base" : "head"}`, language, text }],
      );
    }),
  );

  it("has files in every code language to read", () => {
    expect(new Set(files.map((f) => f.language))).toEqual(new Set(["typescript", "tsx", "python", "java"]));
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.label, f] as const))("%s: names are unique and spans slice the source", async (_l, f) => {
    const found = await declarations(f.language, f.text);
    expect(new Set(found.map((d) => d.qualifiedName)).size).toBe(found.length);
    for (const d of found) expect(f.text.includes(d.text)).toBe(true);
  });

  it("finds every declaration unit the answer key names, under that name", async () => {
    const missing: string[] = [];
    let checked = 0;
    for (const { name, snapshot, expected } of loadSyntheticFixtures()) {
      for (const unit of expected.units ?? []) {
        if (unit.unitKind !== "declaration" || !unit.id) continue;
        const [path, qualifiedName] = unit.id.split("#");
        const file = snapshot.files.find((f) => f.filename === path)!;
        const { language } = languageOf(path);
        if (!isCodeLanguage(language)) continue;
        const sides = await Promise.all(
          [file.baseContent, file.headContent].map((text) => (text === undefined ? [] : declarations(language, text))),
        );
        checked++;
        if (!sides.flat().some((d) => d.qualifiedName === qualifiedName)) missing.push(`${name}: ${unit.id}`);
      }
    }
    expect(missing).toEqual([]);
    expect(checked).toBe(19);
  });

  it("splits the large recorded test files into test cases", async () => {
    const [persist] = loadRecordedSnapshots().flatMap((s) => s.files).filter((f) => f.filename === "tests/persistAsync.test.tsx");
    const tests = (await declarations("tsx", persist.headContent!)).filter((d) => d.category === "test");
    const suites = tests.filter((t) => !t.qualifiedName.includes(" > ")).map((t) => t.qualifiedName);
    expect(suites).toEqual(["persist middleware with async configuration", "persist clearStorage hydration generation"]);
    expect(tests.filter((t) => t.qualifiedName.includes(" > ")).length).toBeGreaterThan(20);
  });
});
