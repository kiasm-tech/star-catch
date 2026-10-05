/** A hosted model as the writer: one structured call per cut for the draft, one per section for repairs and fixes. */
import { z } from "zod";
import type { Llm } from "../ports/llm.js";
import type { CutRequest, CutWriting, ScriptWriter, SectionBrief, WriteRequest } from "../ports/script-writer.js";

const RULES = `Rules:
- Each section answers only its own "purpose". Never repeat what another section says; the reader hears them in order.
- Plain spoken sentences: no lists, no markdown, no headings. One idea per sentence.
- Stay under each section's word limit.
- Every sentence lists its sources: ids from the facts' "sources", sentence ids, or "pr:title". A sentence you can't source, don't write.
- Numbers: only ones that appear in "evidence" facts or in the picture's element labels. Never compute or round a number.
- Before the words that talk about an element of the picture, put <mark name="ELEMENT_ID"/> with one of that section's element ids, so the picture reveals it as it's spoken. Mark every element once.
- Technical cut: explain components, interactions and data. Never name functions, files, lines or code identifiers, never write code, even if the PR's text does.
- Business cut: what changes for people and products, in everyday words. No component names, no code, no tests, no acronyms, no internal mechanics.
- If the developer gave an instruction, follow it within these rules.`;

export const WRITER_PROMPT = `You write the narration for one section of a short video that explains a pull request; the same text becomes the article. You get the section's purpose, what its picture shows and the facts it is about. Write only from them.

${RULES}
- If "repair" is given, your last attempt broke these rules for the reasons listed: write the section again without those problems.`;

export const WRITER_CUT_PROMPT = `You write the narration for every section of a short video that explains a pull request; the same text becomes the article. The sections play in the order given and tell one story. For each, you get its purpose, what its picture shows and the facts it is about. Write only from them.

${RULES}
- The first section says what happened in one sentence; the last recaps in one or two sentences and adds nothing new.
- Each section's picture shows words ("words": each element id with its current text, quoted from the PR). Rewrite every one for this cut, as "labels": at most 8 words for a box or an arrow, one short sentence for a card. Business cut: what a customer or product owner would recognise, never code, files, functions or component names. Technical cut: parts and behaviour in words, no code syntax. Keep any number exactly as written. Return each id you were given, once.`;

const SentencesSchema = z.array(z.object({ text: z.string().min(1), sources: z.array(z.string()) }));
const SENTENCES = {
  type: "array",
  items: {
    type: "object",
    properties: { text: { type: "string" }, sources: { type: "array", items: { type: "string" } } },
    required: ["text", "sources"],
    additionalProperties: false,
  },
};

export const WRITER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { sentences: SENTENCES },
  required: ["sentences"],
  additionalProperties: false,
};

export const LABELS = {
  type: "array",
  items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false },
};

export const WRITER_CUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, sentences: SENTENCES, labels: LABELS }, required: ["id", "sentences", "labels"], additionalProperties: false },
    },
  },
  required: ["sections"],
  additionalProperties: false,
};

/** FNV-1a, enough to tell prompt versions apart in cache keys; the core has no crypto. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export const WRITER_PROMPT_ID = `writer-${fingerprint(WRITER_PROMPT + WRITER_CUT_PROMPT + JSON.stringify(WRITER_SCHEMA) + JSON.stringify(WRITER_CUT_SCHEMA))}`;

const section = (brief: SectionBrief) => ({
  id: brief.id,
  heading: brief.heading,
  purpose: brief.purpose,
  wordLimit: brief.wordLimit,
  picture: { type: brief.visual.type, elements: brief.elements, words: brief.labels.map((l) => ({ id: l.id, text: l.text })) },
  facts: brief.facts.map((f) => ({ group: f.group, key: f.key, value: f.value, sources: f.sources })),
});

const common = (request: WriteRequest | CutRequest) => ({
  cut: request.cut,
  prTitle: request.pr.title,
  ...(request.instruction && { instruction: request.instruction }),
  sentences: request.sentences.map((s) => ({ id: s.id, class: s.class, text: s.text })),
});

/** Its id names the model and the prompt version; an unusable answer throws, so the section is flagged. */
export function modelWriter(llm: Llm, model: string): ScriptWriter {
  return {
    id: `model:${model}@${WRITER_PROMPT_ID}`,
    async write(request, signal) {
      const user = JSON.stringify({ ...common(request), section: section(request), ...(request.repair && { repair: request.repair }) });
      const parsed = z.object({ sentences: SentencesSchema }).safeParse(await llm.completeJson({ system: WRITER_PROMPT, user, schema: WRITER_SCHEMA }, signal));
      if (!parsed.success) throw new Error("the model's answer didn't match the schema");
      return parsed.data.sentences;
    },
    async writeCut(request, signal) {
      const user = JSON.stringify({ ...common(request), sections: request.sections.map(section) });
      const raw = await llm.completeJson({ system: WRITER_CUT_PROMPT, user, schema: WRITER_CUT_SCHEMA }, signal);
      const asked = new Set(request.sections.map((s) => s.id));
      const answers = (typeof raw === "object" && raw !== null && Array.isArray((raw as { sections?: unknown }).sections) ? (raw as { sections: unknown[] }).sections : []);
      if (answers.length === 0) throw new Error("the model's answer didn't match the schema");
      const written: CutWriting = { sections: {}, labels: {} };
      // Each section on its own: one malformed answer costs that section, not the cut.
      for (const answer of answers) {
        const parsed = z.object({ id: z.string(), sentences: SentencesSchema, labels: z.array(z.object({ id: z.string(), label: z.string() })).optional() }).safeParse(answer);
        if (!parsed.success || !asked.has(parsed.data.id)) continue;
        written.sections[parsed.data.id] = parsed.data.sentences;
        written.labels![parsed.data.id] = Object.fromEntries((parsed.data.labels ?? []).map((l) => [l.id, l.label]));
      }
      return written;
    },
  };
}
