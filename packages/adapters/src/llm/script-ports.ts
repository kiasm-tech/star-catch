/** The classifier and writer the env names: offline in mock mode, else hosted models. */
import { mockClassifier, modelClassifier, modelWriter, templateWriter, type Llm, type ScriptPorts, type UsageMeter } from "@star-catch/pipeline";
import { isMock } from "../config.js";
import { OpenAiLlm } from "./llm.openai.js";
import { AnthropicLlm } from "./llm.real.js";

type Env = Record<string, string | undefined>;

/** A hosted model by the keys that are set: Anthropic first, then an OpenAI-compatible endpoint. */
export function llmFor(env: Env, model: string, meter: UsageMeter, step: string): Llm {
  if (env.ANTHROPIC_API_KEY) return new AnthropicLlm({ apiKey: env.ANTHROPIC_API_KEY, model, meter, step });
  if (env.OPENAI_API_KEY) return new OpenAiLlm({ apiKey: env.OPENAI_API_KEY, model, meter, step, ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }) });
  throw new Error(`Set ANTHROPIC_API_KEY, or OPENAI_API_KEY (and OPENAI_BASE_URL), to call ${model}`);
}

export function scriptPorts(env: Env, meter: UsageMeter): ScriptPorts {
  if (isMock("llm", env)) return { classifier: mockClassifier, writer: templateWriter };
  const classifierModel = env.STAR_CATCH_CLASSIFIER_MODEL;
  const writerModel = env.STAR_CATCH_WRITER_MODEL ?? classifierModel;
  if (!classifierModel || !writerModel) throw new Error("Missing env vars: STAR_CATCH_CLASSIFIER_MODEL (and STAR_CATCH_WRITER_MODEL to write with another model)");
  return {
    classifier: modelClassifier(llmFor(env, classifierModel, meter, "classify"), classifierModel),
    writer: modelWriter(llmFor(env, writerModel, meter, "write"), writerModel),
  };
}
