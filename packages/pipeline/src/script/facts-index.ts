import type { Context, Fact, FactGroup } from "@kiasm-tech/star-catch-contracts";

/** Units next to a number that make it a measurement of the system rather than of the business. */
const TECHNICAL_UNIT = /^(?:\s*(?:to|and|-|–)\s*[\d.,]+)?\s*(?:ms|µs|us|ns|s|secs?|seconds?|milliseconds?|kb|mb|gb|tb|kib|mib|gib|rps|qps|req\/s|requests\/s|ops\/s|% ?cpu|cpu)\b/i;

/** Lookups over a context's facts, for gates and section preconditions. */
export class FactIndex {
  constructor(readonly context: Context) {}

  list(group: FactGroup, key?: string): Fact[] {
    return this.context.facts.filter((f) => f.group === group && (key === undefined || f.key === key));
  }

  has(group: FactGroup, key?: string): boolean {
    return this.list(group, key).length > 0;
  }

  /** Flows of at least `steps` names, optionally only those starting at an entry point of `type`. */
  flows(steps: number, startType?: string): Fact[] {
    const types = new Map(this.context.entryPoints.map((e) => [e.unitId, e.type]));
    return this.list("interactions", "flow").filter(
      (f) => Array.isArray(f.value) && f.value.length >= steps && (startType === undefined || types.get(f.sources[0]) === startType),
    );
  }

  /** Evidence numbers that measure the business, not the system (`5 to 9 units` yes, `4.0 to 4.2 ms` no). */
  businessNumbers(): string[] {
    const text = new Map(this.context.sentences.map((s) => [s.id, s.text]));
    return this.list("evidence", "numbers").flatMap((fact) => {
      const sentence = text.get(fact.sources[0]) ?? "";
      const numbers = Array.isArray(fact.value) ? fact.value : [];
      return numbers.filter((n) => {
        const at = sentence.indexOf(n);
        return at >= 0 && !TECHNICAL_UNIT.test(sentence.slice(at + n.length));
      });
    });
  }
}
