import { describe, expect, it } from "vitest";
import { contractShape, memberChanges, membersOf } from "./members.js";

describe("membersOf", () => {
  it("reads an interface's fields and methods", () => {
    expect(membersOf("export interface Shift {\n  day: Weekday;\n  opens?: string; // HH:MM\n  closes: string;\n  label(locale: string): string;\n}", "typescript")).toEqual([
      { name: "day", type: "Weekday" },
      { name: "opens?", type: "string" },
      { name: "closes", type: "string" },
      { name: "label()", type: "string" },
    ]);
  });

  it("reads an object type with nested types whole", () => {
    expect(membersOf("type Reply = { status: number; body: { message: string } }", "typescript")).toEqual([
      { name: "status", type: "number" },
      { name: "body", type: "{ message: string }" },
    ]);
  });

  it("reads a function's parameters and what it returns", () => {
    expect(membersOf("export async function subscribe(email: string, opts: Map<string, number> = new Map()): Promise<Reply> {\n  return x;\n}", "typescript")).toEqual([
      { name: "email", type: "string" },
      { name: "opts", type: "Map<string, number>" },
      { name: "returns", type: "Promise<Reply>" },
    ]);
    expect(membersOf("export const toLocal = (at: Date, zone: string): LocalTime => ({})", "typescript")).toEqual([
      { name: "at", type: "Date" },
      { name: "zone", type: "string" },
      { name: "returns", type: "LocalTime" },
    ]);
  });

  it("keeps function types whole, in parameters, defaults and what comes back", () => {
    expect(membersOf("export function mount(el: HTMLElement, clock: () => Date = () => new Date()): () => void {\n  return () => {};\n}", "typescript")).toEqual([
      { name: "el", type: "HTMLElement" },
      { name: "clock", type: "() => Date" },
      { name: "returns", type: "() => void" },
    ]);
    expect(membersOf("export const total = (items: Item[], tax = 0.2): number => items.length * tax", "typescript")).toEqual([
      { name: "items", type: "Item[]" },
      { name: "tax", type: "" },
      { name: "returns", type: "number" },
    ]);
  });

  it("reads a union's alternatives and an enum's values", () => {
    expect(membersOf('export type Weekday = "mon" | "tue" | "wed";', "typescript")).toEqual([
      { name: '"mon"', type: "" },
      { name: '"tue"', type: "" },
      { name: '"wed"', type: "" },
    ]);
    expect(membersOf("export enum Status { Pending = 'p', Confirmed }", "typescript")).toEqual([
      { name: "Pending", type: "" },
      { name: "Confirmed", type: "" },
    ]);
  });

  it("reads Python functions and dataclass fields", () => {
    expect(membersOf("def ship(order: Order, express: bool = False) -> Quote:\n    pass", "python")).toEqual([
      { name: "order", type: "Order" },
      { name: "express", type: "bool" },
      { name: "returns", type: "Quote" },
    ]);
    expect(membersOf("class Order:\n    total: int\n    note: str = ''\n", "python")).toEqual([
      { name: "total", type: "int" },
      { name: "note", type: "str" },
    ]);
  });

  it("gives up on what it can't read", () => {
    expect(membersOf("export default 42;", "typescript")).toBeNull();
    expect(membersOf("public class A {}", "java")).toBeNull();
    expect(membersOf(undefined, "typescript")).toBeNull();
  });
});

describe("memberChanges", () => {
  it("lists added, changed and removed members, unchanged ones left out", () => {
    const before = [{ name: "next", type: "Date" }, { name: "open", type: "boolean" }, { name: "note", type: "string" }];
    const after = [{ name: "next", type: "LocalTime" }, { name: "open", type: "boolean" }, { name: "zone", type: "string" }];
    expect(memberChanges(before, after)).toEqual([
      { name: "next", before: "Date", after: "LocalTime", change: "changed" },
      { name: "zone", before: null, after: "string", change: "added" },
      { name: "note", before: "string", after: null, change: "removed" },
    ]);
  });

  it("treats everything in a new declaration as added", () => {
    expect(memberChanges(null, [{ name: '"mon"', type: "" }])).toEqual([{ name: '"mon"', before: null, after: '"mon"', change: "added" }]);
  });
});

describe("contractShape", () => {
  const unit = (before: string | undefined, after: string | undefined) => ({ id: "src/a.ts#Status", language: "typescript", before, after });

  it("lists what changed inside a changed type", () => {
    expect(contractShape(unit("interface Status { open: boolean; next: Date }", "interface Status { open: boolean; next: LocalTime; zone: string }"))).toEqual({
      change: "changed",
      members: [
        { id: "member:src/a.ts#Status:next", name: "next", before: "Date", after: "LocalTime", change: "changed" },
        { id: "member:src/a.ts#Status:zone", name: "zone", before: null, after: "string", change: "added" },
      ],
    });
  });

  it("lists a new type's members as added, past six counted", () => {
    const fields = Array.from({ length: 8 }, (_, i) => `f${i}: string`).join("; ");
    const shape = contractShape(unit(undefined, `interface Wide { ${fields} }`));
    expect(shape).toMatchObject({ change: "added", more: 2 });
    expect("members" in shape && shape.members).toHaveLength(6);
  });

  it("says only how the declaration changed when its shape can't be read", () => {
    expect(contractShape(unit("export default 1;", "export default 2;"))).toEqual({ change: "changed" });
  });
});
