/** Which sections each cut has, within its length cap (spec-update-structure.md §3, §5–§7, §9). */
import { CHAPTERS, type Context, type Cut, type SectionPlan } from "@kiasm-tech/star-catch-contracts";
import { FactIndex } from "./facts-index.js";
import { gatesOf } from "./gates.js";
import { DRAFT_RULES, SECTION_RULES, type Include, type SectionRule } from "./sections.js";

export const WORDS_PER_MINUTE = 150;
/** The video's cap per cut, in seconds (§9). */
export const CAP_SECONDS: Record<Cut, number> = { technical: 300, business: 120 };

const FILL_ORDER: Include[] = ["always", "whenRelevant", "ifRoom"];
const words = (seconds: number) => Math.max(1, Math.round((seconds * WORDS_PER_MINUTE) / 60));

export interface Fit {
  readMore: boolean;
  wordLimit: number;
}

/**
 * Fills the cap in §9's order — always, then when relevant, then if room, each in table order —
 * and stops at the first section that doesn't fit: it and everything after go to Read more. Always
 * sections never move; if they alone overflow, every word limit shrinks to fit.
 */
export function fitToCap(rules: SectionRule[], capSeconds: number): Map<SectionRule, Fit> {
  const ordered = FILL_ORDER.flatMap((include) => rules.filter((r) => r.include === include));
  const always = ordered.filter((r) => r.include === "always").reduce((sum, r) => sum + r.estSeconds, 0);
  const shrink = Math.min(1, capSeconds / Math.max(always, 1));
  const fits = new Map<SectionRule, Fit>();
  let used = 0;
  let full = false;
  for (const rule of ordered) {
    const readMore = rule.include !== "always" && (full || used + rule.estSeconds > capSeconds);
    if (readMore) full = true;
    else used += rule.estSeconds;
    fits.set(rule, { readMore, wordLimit: words(rule.estSeconds * (readMore ? 1 : shrink)) });
  }
  return fits;
}

export interface SelectOptions {
  /** The PR is still open: the technical article gets its draft-only appendices. */
  open: boolean;
}

export function selectSections(context: Context, cut: Cut, { open }: SelectOptions): SectionPlan {
  const gate = gatesOf(context, cut);
  const rules = SECTION_RULES.filter((r) => r.cut === cut);
  if (gate.outcome === "none") {
    return { cut, gate, chapters: [], skipped: rules.map((r) => ({ sectionId: r.id, reason: "gate" })), draft: [] };
  }
  const facts = new FactIndex(context);
  const chosen = rules.filter((r) => r.precondition?.(facts) ?? true);
  // An article has no length cap: only the video does.
  const fits = gate.outcome === "full" ? fitToCap(chosen, CAP_SECONDS[cut]) : undefined;
  const chapters = CHAPTERS.map((id) => ({
    id,
    sections: chosen
      .filter((r) => r.chapter === id)
      .map((r) => ({
        id: r.id,
        chapter: r.chapter,
        visual: r.visual,
        readMore: fits?.get(r)?.readMore ?? false,
        wordLimit: fits?.get(r)?.wordLimit ?? words(r.estSeconds),
      })),
  })).filter((c) => c.sections.length > 0);
  return {
    cut,
    gate,
    chapters,
    skipped: rules.filter((r) => !chosen.includes(r)).map((r) => ({ sectionId: r.id, reason: "precondition" })),
    draft: open
      ? DRAFT_RULES.filter((r) => r.cut === cut).map((r) => ({ id: r.id, visual: r.visual, wordLimit: words(r.estSeconds) }))
      : [],
  };
}
