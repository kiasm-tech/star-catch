/** A hosted model as the writer: one structured call per section, rules in the prompt, checks after. */
import { z } from "zod";
import type { Llm } from "../ports/llm.js";
import type { ScriptWriter, WriteRequest } from "../ports/script-writer.js";

export const WRITER_PROMPT = `You write the narration for one section of a short video that explains a pull request, and the same text becomes the article. You get the section, what its picture shows, and the facts. Write only from them.

Rules:
- Write plain spoken sentences, no lists, no markdown, no headings.
- Stay under the word limit.
- Every sentence lists its sources: ids from the facts' "sources", sentence ids, or "pr:title". A sentence you can't source, don't write.
- Numbers: only ones that appear in "evidence" facts or in the picture's element labels. Never compute or round a number.
- Before the words that talk about an element of the picture, put <mark name="ELEMENT_ID"/> with one of the listed element ids, so the picture reveals it as it's spoken. Mark every element once.
- Technical cut: explain components, interactions and data; never name functions, files, lines or code identifiers, and never write code.
- Business cut: explain what changes for people and products, in everyday words; no component names, no code words, no acronyms.
- If an instruction from the developer is given, follow it within these rules.`;

const AnswerSchema = z.object({
  sentences: z.array(z.object({ text: z.string().min(1), sources: z.array(z.string()) })),
});

export const WRITER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, sources: { type: "array", items: { type: "string" } } },
        required: ["text", "sources"],
        additionalProperties: false,
      },
    },
  },
  required: ["sentences"],
  additionalProperties: false,
};

/** FNV-1a, enough to tell prompt versions apart in cache keys; the core has no crypto. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export const WRITER_PROMPT_ID = `writer-${fingerprint(WRITER_PROMPT + JSON.stringify(WRITER_SCHEMA))}`;

function payload(request: WriteRequest): string {
  return JSON.stringify({
    cut: request.cut,
    section: request.section.heading,
    wordLimit: request.wordLimit,
    ...(request.instruction && { instruction: request.instruction }),
    prTitle: request.pr.title,
    picture: { type: request.visual.type, elements: request.elements },
    facts: request.facts.map((f) => ({ group: f.group, key: f.key, value: f.value, sources: f.sources })),
    sentences: request.sentences.map((s) => ({ id: s.id, class: s.class, text: s.text })),
  });
}

/** Its id names the model and the prompt version; an unusable answer throws, so the section is flagged. */
export function modelWriter(llm: Llm, model: string): ScriptWriter {
  return {
    id: `model:${model}@${WRITER_PROMPT_ID}`,
    async write(request, signal) {
      const raw = await llm.completeJson({ system: WRITER_PROMPT, user: payload(request), schema: WRITER_SCHEMA }, signal);
      const parsed = AnswerSchema.safeParse(raw);
      if (!parsed.success) throw new Error("the model's answer didn't match the schema");
      return parsed.data.sentences;
    },
  };
}
