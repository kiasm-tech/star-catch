import { createModelClassifier, mockClassifier, PROMPT_ID, type Classifier } from "@star-catch/changes";
import type { Llm } from "./ports/llm.js";

/** A hosted model as the classifier; its id names the model and the prompt, never the context. */
export function modelClassifier(llm: Llm, model: string): Classifier {
  return createModelClassifier({ id: `model:${model}@${PROMPT_ID}`, complete: (request, signal) => llm.completeJson(request, signal) });
}

export { mockClassifier };
