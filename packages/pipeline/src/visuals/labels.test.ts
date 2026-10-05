import { VisualSchema, type Visual } from "@kiasm-tech/star-catch-contracts";
import { describe, expect, it } from "vitest";
import { labelsOf, mapLabels } from "./labels.js";
import { deCode } from "./words.js";

const ssd: Visual = {
  type: "systemSequenceDiagram",
  data: {
    participants: [
      { id: "actor", label: "People using it", x: 280, role: "actor" },
      { id: "system", label: "zustand", x: 720, role: "system" },
    ],
    messages: [{ id: "message:use", from: "actor", to: "system", label: "ClearStorage() should invalidate concurrent async rehydration" }],
    outcomes: [{ id: "outcome:1", label: "rehydrate() already uses hydrationVersion", kind: "ok" }],
  },
};

const decision: Visual = {
  type: "decisionDiagram",
  data: { subject: { id: "rule:x", label: "bulk discount" }, before: { id: "condition:before", condition: "quantity >= 10" }, after: { id: "condition:after", condition: "quantity >= 5" } },
};

describe("the words a picture shows", () => {
  it("lists them by element, in reading order", () => {
    expect(labelsOf(ssd, "business").map((l) => [l.id, l.max])).toEqual([["message:use", 80], ["outcome:1", 80]]);
  });

  it("leaves the technical rule's code alone, and offers the business one", () => {
    expect(labelsOf(decision, "technical").map((l) => l.id)).toEqual(["rule:x"]);
    expect(labelsOf(decision, "business").map((l) => l.id)).toEqual(["rule:x", "condition:before", "condition:after"]);
  });

  it("offers the title only in the business cut", () => {
    const title: Visual = { type: "titleCard", data: { pr: { fullName: "a/b", number: 1 }, title: "ClearStorage() should invalidate", cut: "business" } };
    expect(labelsOf(title, "business")).toEqual([{ id: "title", text: "ClearStorage() should invalidate", max: 160 }]);
    expect(labelsOf(title, "technical")).toEqual([]);
  });

  it("replaces exactly those words and keeps the visual valid", () => {
    const plain = mapLabels(ssd, "business", (_id, text) => deCode(text));
    expect(VisualSchema.parse(plain)).toEqual(plain);
    const data = (plain as Extract<Visual, { type: "systemSequenceDiagram" }>).data;
    expect(data.messages[0]!.label).toBe("Clear storage should invalidate concurrent async rehydration");
    expect(data.outcomes[0]!.label).toBe("rehydrate already uses hydration version");
    expect(data.participants).toEqual((ssd as typeof plain & { type: "systemSequenceDiagram" }).data.participants);
  });

  it("maps every type it lists", () => {
    const relabelled = mapLabels(decision, "business", (id) => `new ${id}`);
    expect(labelsOf(relabelled, "business").map((l) => l.text)).toEqual(["new rule:x", "new condition:before", "new condition:after"]);
  });
});
