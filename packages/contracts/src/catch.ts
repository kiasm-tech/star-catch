/** One catch as Crux shows it: the PR it explains and both cuts' scripts. */
import { z } from "zod";
import { ScriptSchema } from "./update-script.js";

export const CATCH_PR_STATES = ["open", "merged", "closed"] as const;

export const CatchVersionSchema = z.object({
  /** `${owner}__${repo}__${number}`. */
  catchId: z.string().regex(/^[^_/\s]+(?:_[^_/\s]+)*__[^/\s]+__[1-9]\d*$/),
  /** Page chrome: the scripts never depend on any of it. */
  pr: z.object({
    fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    number: z.number().int().positive(),
    title: z.string(),
    author: z.string().nullable(),
    url: z.string(),
    state: z.enum(CATCH_PR_STATES),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  /** Null when the gates rule the cut out. */
  technical: ScriptSchema.nullable(),
  business: ScriptSchema.nullable(),
  generatedBy: z.object({ classifier: z.string(), writer: z.string() }),
});

export type CatchVersion = z.infer<typeof CatchVersionSchema>;

/** `pmndrs/zustand` + 3555 → `pmndrs__zustand__3555`. */
export const catchIdOf = (fullName: string, number: number) => `${fullName.replace("/", "__")}__${number}`;
