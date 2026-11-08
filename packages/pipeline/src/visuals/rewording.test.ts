import type { Visual } from "@kiasm-tech/star-catch-contracts";
import { describe, expect, it } from "vitest";
import { rewordingProblems } from "./rewording.js";

const checklist: Visual = { type: "checklist", data: { items: [{ id: "a", label: "Run the migration" }], more: 0 } };
const map: Visual = {
  type: "componentMap",
  data: { nodes: [{ id: "api", label: "API", box: { x: 0, y: 0, w: 10, h: 10 }, changed: true, files: ["src/api.ts"] }], edges: [] },
};
const decision: Visual = { type: "decisionDiagram", data: { subject: { id: "s", label: "Discount" }, before: null, after: { id: "n", condition: "quantity ≥ 5" } } };

describe("rewordingProblems", () => {
  it("accepts the same picture with its prose reworded", () => {
    expect(rewordingProblems(checklist, { type: "checklist", data: { items: [{ id: "a", label: "Migrate first" }], more: 0 } })).toEqual([]);
    expect(rewordingProblems(decision, { ...decision, data: { ...decision.data, subject: { id: "s", label: "Bulk price" }, after: { id: "n", condition: "five or more" } } })).toEqual([]);
  });

  it("refuses anything but prose changing", () => {
    expect(rewordingProblems(checklist, { type: "checklist", data: { items: [{ id: "b", label: "Run the migration" }], more: 1 } })).toEqual([
      "data.items[0].id can't change: only label, text, title, condition, risk, mitigation can be reworded",
      "data.more can't change: only label, text, title, condition, risk, mitigation can be reworded",
    ]);
    const moved = structuredClone(map);
    if (moved.type !== "componentMap") throw new Error();
    moved.data.nodes[0]!.box.x = 5;
    moved.data.nodes[0]!.files = ["src/other.ts"];
    expect(rewordingProblems(map, moved)).toEqual([
      expect.stringMatching(/^data\.nodes\[0\]\.box\.x can't change/),
      expect.stringMatching(/^data\.nodes\[0\]\.files\[0\] can't change/),
    ]);
  });

  it("refuses items or fields added or removed, a null filled in, and another kind of picture", () => {
    expect(rewordingProblems(checklist, { type: "checklist", data: { items: [], more: 0 } })).toEqual(["data.items can't gain or lose items"]);
    expect(rewordingProblems(decision, { ...decision, data: { ...decision.data, before: { id: "o", condition: "quantity ≥ 10" } } })).toEqual(["data.before can't change: only label, text, title, condition, risk, mitigation can be reworded"]);
    expect(rewordingProblems(map, { ...map, data: { ...map.data, nodes: map.data.nodes.map((n) => ({ ...n, focus: true })) } } as Visual)).toEqual(["data.nodes[0].focus can't be added or removed"]);
    expect(rewordingProblems(checklist, decision)).toEqual(["the picture is a checklist and stays one"]);
  });
});
