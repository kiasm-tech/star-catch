import { describe, expect, it } from "vitest";
import { IMPLEMENTED_VISUALS, VisualSchema } from "./visuals.js";
import { VISUAL_TYPES } from "./script.js";

const box = { x: 0, y: 0, w: 100, h: 40 };
const nodes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `component:c${i}`, label: `c${i}`, box, changed: i === 0 }));

describe("VisualSchema", () => {
  it("accepts a component map of seven components and rejects eight", () => {
    expect(VisualSchema.safeParse({ type: "componentMap", data: { nodes: nodes(7), edges: [] } }).success).toBe(true);
    const eight = VisualSchema.safeParse({ type: "componentMap", data: { nodes: nodes(8), edges: [] } });
    expect(eight.success).toBe(false);
    expect(eight.error?.issues[0]?.message).toBe("at most 7 components");
  });

  it("lists up to four changed files under a component", () => {
    const withFiles = (n: number) => ({ type: "componentMap", data: { nodes: [{ ...nodes(1)[0], files: Array.from({ length: n }, (_, i) => `src/c0/f${i}.ts`) }], edges: [] } });
    expect(VisualSchema.safeParse(withFiles(4)).success).toBe(true);
    expect(VisualSchema.safeParse(withFiles(5)).success).toBe(false);
    expect(VisualSchema.safeParse({ type: "componentMap", data: { nodes: nodes(1), edges: [] } }).success).toBe(true);
  });

  it("opens a single component into at most seven changes", () => {
    const change = { file: "src/cart/totals.ts", name: "item total", change: "renamed" };
    const opened = (n: number) => ({ type: "componentMap", data: { nodes: [{ ...nodes(1)[0], changes: Array.from({ length: n }, () => change) }], edges: [] } });
    expect(VisualSchema.safeParse(opened(7)).success).toBe(true);
    expect(VisualSchema.safeParse(opened(8)).success).toBe(false);
    expect(VisualSchema.safeParse({ ...opened(1), data: { ...opened(1).data, nodes: [{ ...nodes(1)[0], changes: [{ ...change, change: "edited" }] }] } }).success).toBe(false);
  });

  it("counts messages and outcomes together in a system sequence diagram", () => {
    const participants = [
      { id: "actor", label: "API client", x: 150, role: "actor" },
      { id: "system", label: "shop", x: 500, role: "system" },
    ];
    const messages = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, from: "actor", to: "system", label: `call ${i}` }));
    const outcome = (i: number) => ({ id: `o${i}`, label: "429 Too many requests", kind: "refused" });
    const ssd = (outcomes: number) => ({ type: "systemSequenceDiagram", data: { participants, messages, outcomes: Array.from({ length: outcomes }, (_, i) => outcome(i)) } });
    expect(VisualSchema.safeParse(ssd(2)).success).toBe(true);
    expect(VisualSchema.safeParse(ssd(3)).success).toBe(false);
  });

  it("names only visual types from the catalogue", () => {
    expect(IMPLEMENTED_VISUALS.every((type) => (VISUAL_TYPES as readonly string[]).includes(type))).toBe(true);
    expect(IMPLEMENTED_VISUALS).toHaveLength(18);
  });
});
