import OpenAI from "openai";
import type { Llm, LlmRequest } from "@star-catch/pipeline";

export interface OpenAiOptions {
  apiKey: string;
  /** Azure AI Foundry's OpenAI-compatible endpoint; OpenAI's own when absent. */
  baseURL?: string;
  model: string;
  maxTokens?: number;
  fetch?: typeof fetch;
}

const TOOL = "label";

/** An OpenAI-compatible endpoint through the Responses API, with a strict forced function call (as Crux does). */
export class OpenAiLlm implements Llm {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAiOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL && { baseURL: options.baseURL }),
      ...(options.fetch && { fetch: options.fetch }),
    });
  }

  async completeJson({ system, user, schema }: LlmRequest, signal?: AbortSignal): Promise<unknown> {
    const response = await this.client.responses.create(
      {
        model: this.options.model,
        max_output_tokens: this.options.maxTokens ?? 16_000,
        instructions: system,
        input: user,
        tools: [{ type: "function", name: TOOL, description: "Record the labels for every item.", strict: true, parameters: schema }],
        tool_choice: { type: "function", name: TOOL },
      },
      { signal },
    );
    if (response.incomplete_details?.reason === "max_output_tokens") {
      throw new Error(`Classifier answer cut off at ${this.options.maxTokens ?? 16_000} tokens`);
    }
    const call = response.output.find((item) => item.type === "function_call");
    if (!call || call.type !== "function_call") throw new Error("The model returned no labels");
    return JSON.parse(call.arguments);
  }
}
