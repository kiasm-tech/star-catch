import { SYSTEM_PROMPT } from "@star-catch/changes";
import { loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { modelClassifier } from "./classifier.js";
import type { Llm, LlmRequest } from "./ports/llm.js";
import { buildContext } from "./usecases/build-context.js";

describe("modelClassifier", () => {
  it("names the model and the prompt, and asks the Llm once for a small pull request", async () => {
    const requests: LlmRequest[] = [];
    const llm: Llm = {
      completeJson: async (request) => {
        requests.push(request);
        const items = JSON.parse(request.user) as { type: string; id: string }[];
        return {
          units: [],
          sentences: items.filter((i) => i.type === "sentence").map((i) => ({ id: i.id, class: "behaviour", confidence: 0.9 })),
        };
      },
    };
    const classifier = modelClassifier(llm, "claude-haiku-4-5");
    expect(classifier.id).toMatch(/^model:claude-haiku-4-5@prompt-[0-9a-f]{12}$/);

    const context = await buildContext(loadSyntheticFixtures().find((f) => f.name === "05-condition-change")!.snapshot, { classifier });
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toBe(SYSTEM_PROMPT);
    expect(context.sentences.map((s) => s.class)).toEqual(["behaviour", "behaviour", "behaviour"]);
    expect(context.units[0].labels).toBeUndefined();
  });
});
