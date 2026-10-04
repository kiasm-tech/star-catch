import type { Llm, LlmRequest } from "@star-catch/pipeline";

interface Item {
  type: "unit" | "sentence";
  id: string;
  decided?: { kind?: string };
}

/** Answers every item the same way, offline: the model's path without the model. */
export class MockLlm implements Llm {
  readonly requests: LlmRequest[] = [];

  async completeJson(request: LlmRequest): Promise<unknown> {
    this.requests.push(request);
    const items = JSON.parse(request.user) as Item[];
    return {
      units: items
        .filter((i) => i.type === "unit")
        .map((i) => ({
          id: i.id,
          kind: i.decided?.kind ? null : "logic",
          intent: "maintenance",
          visibility: "internal",
          breaking: false,
          securitySensitive: false,
          confidence: { kind: i.decided?.kind ? null : 0.5, intent: 0.5, visibility: 0.5, risks: 0.5 },
        })),
      sentences: items.filter((i) => i.type === "sentence").map((i) => ({ id: i.id, class: "noise", confidence: 0.5 })),
    };
  }
}
