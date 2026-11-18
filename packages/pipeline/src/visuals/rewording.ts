/** Whether a person's picture is the built one with only its prose reworded. */
import { VISUAL_TEXT_FIELDS, type Visual } from "@kiasm-tech/star-catch-contracts";

const TEXT = new Set<string>(VISUAL_TEXT_FIELDS);

/** Why `edited` isn't `built` reworded: anything but a string under a text field that differs. Empty when it is. */
export function rewordingProblems(built: Visual, edited: Visual): string[] {
  if (edited.type !== built.type) return [`the picture is a ${built.type} and stays one`];
  const problems: string[] = [];
  const walk = (a: unknown, b: unknown, path: string, key: string | null) => {
    if (typeof a === "string" && typeof b === "string" && key !== null && TEXT.has(key)) return;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) problems.push(`${path} can't gain or lose items`);
      else a.forEach((item, i) => walk(item, b[i], `${path}[${i}]`, key));
      return;
    }
    if (a !== null && typeof a === "object") {
      if (b === null || typeof b !== "object" || Array.isArray(b)) return void problems.push(`${path} can't change`);
      const before = a as Record<string, unknown>;
      const after = b as Record<string, unknown>;
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (!(k in before) || !(k in after)) problems.push(`${path}.${k} can't be added or removed`);
        else walk(before[k], after[k], `${path}.${k}`, k);
      }
      return;
    }
    if (a !== b) problems.push(`${path} can't change: only ${VISUAL_TEXT_FIELDS.join(", ")} can be reworded`);
  };
  walk(built.data, edited.data, "data", null);
  return problems;
}
