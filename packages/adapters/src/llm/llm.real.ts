import Anthropic from "@anthropic-ai/sdk";
import type { Llm, LlmRequest, UsageMeter } from "@star-catch/pipeline";

export interface AnthropicOptions {
  apiKey: string;
  /** From STAR_CATCH_CLASSIFIER_MODEL, e.g. claude-haiku-4-5. */
  model: string;
  maxTokens?: number;
  fetch?: typeof fetch;
  /** Told the tokens of every call, including ones whose answer is then rejected. */
  meter?: UsageMeter;
  /** What the calls are for, in the meter: `classify` or `write`. */
  step?: string;
}

/**
 * Claude through structured outputs (`output_config.format`). Not a forced tool: newer models
 * reject `tool_choice: tool`, and some reject `temperature`, so neither is sent. Identical inputs
 * stay identical through the label cache, not the sampling settings.
 */
export class AnthropicLlm implements Llm {
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey, ...(options.fetch && { fetch: options.fetch }) });
  }

  async completeJson({ system, user, schema }: LlmRequest, signal?: AbortSignal): Promise<unknown> {
    // Streamed: a long answer would otherwise run into the SDK's request timeout.
    const message = await this.client.messages
      .stream(
        {
          model: this.options.model,
          max_tokens: this.options.maxTokens ?? 16_000,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { format: { type: "json_schema", schema } },
        },
        { signal },
      )
      .finalMessage();
    const { usage } = message;
    this.options.meter?.record({
      step: this.options.step ?? "model",
      model: this.options.model,
      input: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      output: usage.output_tokens,
    });
    if (message.stop_reason === "max_tokens") throw new Error(`Classifier answer cut off at ${this.options.maxTokens ?? 16_000} tokens`);
    if (message.stop_reason === "refusal") throw new Error("The model refused to classify");
    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    return JSON.parse(text);
  }
}
