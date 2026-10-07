import { describe, expect, it } from "vitest";
import { declarationsOf } from "./declarations.js";
import { membersOf } from "./members.js";
import { parse, parserFor, type CodeLanguage } from "./parse.js";

const later = { deadline: Number.POSITIVE_INFINITY };

/** Each declaration's qualified name and the members read from it. */
async function shapes(language: CodeLanguage, text: string) {
  const tree = parse(await parserFor(language), text, later)!;
  try {
    return Object.fromEntries((await declarationsOf(tree, language)).map((d) => [d.qualifiedName, membersOf(d.node)]));
  } finally {
    tree.delete();
  }
}

describe("membersOf", () => {
  it("reads TypeScript interfaces, object types, unions and enums", async () => {
    const found = await shapes(
      "typescript",
      `export interface Shift { day: Weekday; opens?: string; label(locale: string): string; }
type Reply = { status: number; body: { message: string } };
export type Weekday = "mon" | "tue" | "wed";
enum Status { Pending = "p", Confirmed }
export const LIMIT = 5;`,
    );
    expect(found.Shift).toEqual([
      { name: "day", type: "Weekday" },
      { name: "opens?", type: "string" },
      { name: "label()", type: "string" },
    ]);
    expect(found.Reply).toEqual([
      { name: "status", type: "number" },
      { name: "body", type: "{ message: string }" },
    ]);
    expect(found.Weekday).toEqual([
      { name: '"mon"', type: "" },
      { name: '"tue"', type: "" },
      { name: '"wed"', type: "" },
    ]);
    expect(found.Status).toEqual([
      { name: "Pending", type: "" },
      { name: "Confirmed", type: "" },
    ]);
    expect(found.LIMIT).toBeNull();
  });

  it("reads TypeScript functions with function types, defaults and rest parameters whole", async () => {
    const found = await shapes(
      "typescript",
      `export function mount(el: HTMLElement, clock: () => Date = () => new Date(), ...rest: string[]): () => void { return () => {}; }
export const total = (items: Item[], tax = 0.2): number => items.length * tax;`,
    );
    expect(found.mount).toEqual([
      { name: "el", type: "HTMLElement" },
      { name: "clock", type: "() => Date" },
      { name: "...rest", type: "string[]" },
      { name: "returns", type: "() => void" },
    ]);
    expect(found.total).toEqual([
      { name: "items", type: "Item[]" },
      { name: "tax", type: "" },
      { name: "returns", type: "number" },
    ]);
  });

  it("lists a class's public fields and methods, not its constructor or private ones", async () => {
    const found = await shapes(
      "typescript",
      `export class Cart { private secret = 1; #hidden = 2; items: Item[] = []; constructor(a: string) {} total(tax: number): number { return 0; } }`,
    );
    expect(found.Cart).toEqual([
      { name: "items", type: "Item[]" },
      { name: "total()", type: "number" },
    ]);
  });

  it("reads JavaScript parameters, untyped", async () => {
    const found = await shapes("javascript", `export function ship(order, { express } = {}, ...rest) { return 1; }`);
    expect(found.ship).toEqual([
      { name: "order", type: "" },
      { name: "options", type: "" },
      { name: "...rest", type: "" },
    ]);
  });

  it("reads Python functions and annotated class fields", async () => {
    const found = await shapes(
      "python",
      `def ship(order: Order, express: bool = False, *args, **kw) -> Quote:
    pass

@dataclass
class Order:
    total: int
    note: str = ''
    _cache: dict = {}
    def price(self, tax: float) -> int:
        return 1
`,
    );
    expect(found.ship).toEqual([
      { name: "order", type: "Order" },
      { name: "express", type: "bool" },
      { name: "*args", type: "" },
      { name: "**kw", type: "" },
      { name: "returns", type: "Quote" },
    ]);
    expect(found.Order).toEqual([
      { name: "total", type: "int" },
      { name: "note", type: "str" },
      { name: "price()", type: "int" },
    ]);
  });

  it("reads Java classes, methods, records, interfaces and enums", async () => {
    const found = await shapes(
      "java",
      `public class Order { private int total; public String note = ""; public Quote ship(Order o, boolean express) { return null; } }
enum Status { PENDING, CONFIRMED }
record Point(int x, int y) {}
interface Api { Reply get(String id); }`,
    );
    expect(found.Order).toEqual([
      { name: "note", type: "String" },
      { name: "ship()", type: "Quote" },
    ]);
    expect(found["Order.ship"]).toEqual([
      { name: "o", type: "Order" },
      { name: "express", type: "boolean" },
      { name: "returns", type: "Quote" },
    ]);
    expect(found.Status).toEqual([
      { name: "PENDING", type: "" },
      { name: "CONFIRMED", type: "" },
    ]);
    expect(found.Point).toEqual([
      { name: "x", type: "int" },
      { name: "y", type: "int" },
    ]);
    expect(found.Api).toEqual([{ name: "get()", type: "Reply" }]);
  });
});
