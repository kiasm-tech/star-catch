import { createHash } from "node:crypto";
import { INTENTS, KINDS, SENTENCE_CLASSES, VISIBILITIES } from "@kiasm-tech/star-catch-contracts";
import { z } from "zod";

/** One line and one example per label: the model picks, it never describes (changes.md §6.3). */
const DEFINITIONS = {
  kind: {
    logic: "computation or control flow that decides behaviour — e.g. a discount rule",
    interface: "a type, signature or contract other code depends on — e.g. an exported request type",
    data: "how data is stored or shaped — e.g. a schema, migration or model",
    configuration: "settings read at runtime — e.g. a feature flag",
    dependency: "a third-party package or its version — e.g. bumping zod",
    ui: "what a user sees or touches — e.g. a page component",
    test: "code that checks other code — e.g. a test case",
    documentation: "prose for readers — e.g. a README section",
    buildCi: "building, packaging or CI — e.g. a workflow step",
  },
  intent: {
    feature: "adds something users or callers can do — e.g. a new endpoint",
    fix: "corrects wrong behaviour — e.g. an off-by-one",
    refactor: "restructures without changing behaviour — e.g. extracting a helper",
    performance: "makes it faster or cheaper — e.g. caching a lookup",
    security: "closes a hole or hardens — e.g. escaping input",
    maintenance: "upkeep with no user-facing effect — e.g. renaming a log field",
  },
  visibility: {
    user: "people using the product notice it — e.g. a changed label or price",
    apiConsumer: "callers of a public API or library notice it — e.g. a new parameter",
    operator: "people running the system notice it — e.g. a new env variable or job",
    internal: "nobody outside the code notices — e.g. a private helper",
  },
  class: {
    problem: "what was wrong or missing — e.g. 'checkout fails for guests'",
    rationale: "why the change is made this way — e.g. 'so retries stay idempotent'",
    behaviour: "what the code does now — e.g. 'totals now round up'",
    instruction: "what someone must do — e.g. 'run the migration first'",
    noise: "none of the above — e.g. 'thanks!' or a checklist item",
  },
} satisfies Record<string, Record<string, string>>;

const list = (labels: Record<string, string>) => Object.entries(labels).map(([label, line]) => `- ${label}: ${line}`).join("\n");

export const SYSTEM_PROMPT = `You label changes in a pull request. For every item you receive, pick labels from the closed sets below. Pick, never describe: answer only with the labels and a confidence from 0 to 1 per answer.

Units (code, config, schema or docs that changed):
kind — only when the item's "decided" has no kind; otherwise null:
${list(DEFINITIONS.kind)}
intent:
${list(DEFINITIONS.intent)}
visibility:
${list(DEFINITIONS.visibility)}
breaking — true when existing callers, users or data would break.
securitySensitive — true when it touches authentication, authorisation, secrets, crypto or untrusted input.
Keep anything already in "decided".

Sentences (from the description, linked issues and commit subjects):
class:
${list(DEFINITIONS.class)}

Answer for every item, using its id.`;

const confidence = z.number().min(0).max(1);

/** What the model must return, every field required (OpenAI's strict mode and Anthropic tools both accept it). */
export const ResponseSchema = z.object({
  units: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(KINDS).nullable(),
      intent: z.enum(INTENTS),
      visibility: z.enum(VISIBILITIES),
      breaking: z.boolean(),
      securitySensitive: z.boolean(),
      confidence: z.object({ kind: confidence.nullable(), intent: confidence, visibility: confidence, risks: confidence }),
    }),
  ),
  sentences: z.array(z.object({ id: z.string(), class: z.enum(SENTENCE_CLASSES), confidence })),
});

/** Structured-output modes support a subset of JSON Schema; the zod schema still checks the ranges. */
function forStructuredOutputs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forStructuredOutputs);
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !["$schema", "minimum", "maximum"].includes(key))
      .map(([key, value]) => [key, forStructuredOutputs(value)]),
  );
}

/** The JSON schema the adapter forces. */
export const RESPONSE_JSON_SCHEMA = forStructuredOutputs(z.toJSONSchema(ResponseSchema)) as Record<string, unknown>;

/** Changes with the prompt or the schema, so labels cached under an older prompt are not reused. */
export const PROMPT_ID = `prompt-${createHash("sha256").update(SYSTEM_PROMPT).update(JSON.stringify(RESPONSE_JSON_SCHEMA)).digest("hex").slice(0, 12)}`;
