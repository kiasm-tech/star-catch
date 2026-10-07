import { RESPONSE_JSON_SCHEMA } from "@star-catch/changes";
import { memoryMeter } from "@star-catch/pipeline";
import { describe, expect, it } from "vitest";
import { MockLlm } from "./llm.mock.js";
import { OpenAiLlm } from "./llm.openai.js";
import { AnthropicLlm } from "./llm.real.js";

const request = { system: "Pick labels.", user: '[{"type":"unit","id":"a"}]', schema: RESPONSE_JSON_SCHEMA };
const answer = { units: [], sentences: [] };

/** Records each request body and answers with the given response. */
function fakeFetch(respond: () => Response) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return respond();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** Claude's streamed message, as server-sent events. */
function anthropicStream(text: string, stopReason = "end_turn") {
  const events = [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "m", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ];
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return () => new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function openAiResponse(output: unknown[], incomplete: string | null = null) {
  const body = {
    id: "resp_1",
    object: "response",
    created_at: 0,
    status: incomplete ? "incomplete" : "completed",
    model: "m",
    output,
    incomplete_details: incomplete ? { reason: incomplete } : null,
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  };
  return () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("AnthropicLlm", () => {
  it("tells the meter the call's tokens", async () => {
    const meter = memoryMeter();
    await new AnthropicLlm({ apiKey: "k", model: "claude-haiku-4-5", fetch: fakeFetch(anthropicStream(JSON.stringify(answer))).fetch, meter, step: "classify" }).completeJson(request);
    expect(meter.take()).toEqual([{ step: "classify", model: "claude-haiku-4-5", calls: 1, input: 10, output: 5 }]);
  });

  it("asks for structured output, with no forced tool or temperature, and parses the answer", async () => {
    const { fetch, calls } = fakeFetch(anthropicStream(JSON.stringify(answer)));
    const llm = new AnthropicLlm({ apiKey: "k", model: "claude-haiku-4-5", fetch });
    expect(await llm.completeJson(request)).toEqual(answer);
    const [{ url, body }] = calls;
    expect(url).toMatch(/\/v1\/messages$/);
    expect(body).toMatchObject({
      model: "claude-haiku-4-5",
      max_tokens: 16_000,
      system: "Pick labels.",
      messages: [{ role: "user", content: request.user }],
      output_config: { format: { type: "json_schema", schema: RESPONSE_JSON_SCHEMA } },
      stream: true,
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tool_choice");
  });

  it.each([["max_tokens", /cut off/], ["refusal", /refused/]])("fails on a %s stop", async (reason, error) => {
    const { fetch } = fakeFetch(anthropicStream("{", reason));
    await expect(new AnthropicLlm({ apiKey: "k", model: "m", fetch }).completeJson(request)).rejects.toThrow(error);
  });
});

describe("OpenAiLlm", () => {
  const call = { type: "function_call", id: "fc_1", call_id: "call_1", name: "label", arguments: JSON.stringify(answer), status: "completed" };

  it("forces a strict function call on the configured endpoint and parses its arguments", async () => {
    const { fetch, calls } = fakeFetch(openAiResponse([call]));
    const llm = new OpenAiLlm({ apiKey: "k", baseURL: "https://acme.openai.azure.com/openai/v1", model: "gpt-5.3", fetch });
    expect(await llm.completeJson(request)).toEqual(answer);
    const [{ url, body }] = calls;
    expect(url).toBe("https://acme.openai.azure.com/openai/v1/responses");
    expect(body).toMatchObject({
      model: "gpt-5.3",
      instructions: "Pick labels.",
      input: request.user,
      tools: [{ type: "function", name: "label", strict: true, parameters: RESPONSE_JSON_SCHEMA }],
      tool_choice: { type: "function", name: "label" },
    });
  });

  it("tells the meter each call's tokens, a cut-off one too", async () => {
    const meter = memoryMeter();
    await new OpenAiLlm({ apiKey: "k", model: "luna", fetch: fakeFetch(openAiResponse([call])).fetch, meter, step: "write" }).completeJson(request);
    await expect(new OpenAiLlm({ apiKey: "k", model: "luna", fetch: fakeFetch(openAiResponse([call], "max_output_tokens")).fetch, meter, step: "write" }).completeJson(request)).rejects.toThrow();
    expect(meter.take()).toEqual([{ step: "write", model: "luna", calls: 2, input: 20, output: 10 }]);
  });

  it("fails when the answer is cut off or missing", async () => {
    const cut = fakeFetch(openAiResponse([call], "max_output_tokens"));
    await expect(new OpenAiLlm({ apiKey: "k", model: "m", fetch: cut.fetch }).completeJson(request)).rejects.toThrow(/cut off/);
    const none = fakeFetch(openAiResponse([{ type: "message", id: "m1", role: "assistant", status: "completed", content: [] }]));
    await expect(new OpenAiLlm({ apiKey: "k", model: "m", fetch: none.fetch }).completeJson(request)).rejects.toThrow(/no labels/);
  });
});

describe("MockLlm", () => {
  it("answers every item the same way, leaving decided kinds alone", async () => {
    const llm = new MockLlm();
    const user = JSON.stringify([
      { type: "unit", id: "a" },
      { type: "unit", id: "b", decided: { kind: "test" } },
      { type: "sentence", id: "d:0" },
    ]);
    expect(await llm.completeJson({ ...request, user })).toMatchObject({
      units: [{ id: "a", kind: "logic" }, { id: "b", kind: null }],
      sentences: [{ id: "d:0", class: "noise" }],
    });
    expect(llm.requests).toHaveLength(1);
  });
});

describe("RESPONSE_JSON_SCHEMA", () => {
  it("uses only what structured-output modes support", () => {
    const keys = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (typeof node === "object" && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          keys.add(key);
          walk(value);
        }
      }
    };
    walk(RESPONSE_JSON_SCHEMA);
    for (const unsupported of ["$schema", "minimum", "maximum"]) expect(keys.has(unsupported)).toBe(false);
    expect(keys.has("additionalProperties")).toBe(true);
  });
});
