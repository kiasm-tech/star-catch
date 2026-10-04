import { ContextExpectationSchema, type Context } from "@kiasm-tech/star-catch-contracts";
import { buildContext, type Classifier } from "@star-catch/pipeline";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";

export const evalClassifyUsage = "eval-classify [--yes] [<fixture> …]          compare the classifier with the fixtures' labels";

const AXES = ["kind", "intent", "visibility", "risks"] as const;

/**
 * Labels the synthetic fixtures and compares them with the labels their expectations pin. A hosted
 * model is called only with --yes; without it, this says how much would be sent and stops.
 */
export async function evalClassify(args: string[], services: Services, io: Io): Promise<number> {
  const yes = args.includes("--yes");
  const names = args.filter((a) => a !== "--yes");
  if (names.some((n) => n.startsWith("-"))) throw new UsageError(`Usage: ${evalClassifyUsage}`);
  const all = await services.fixtures.syntheticFixtures();
  const unknown = names.filter((n) => !all.some((f) => f.name === n));
  if (unknown.length > 0) throw new UsageError(`No synthetic fixture named ${unknown.join(", ")}`);
  const fixtures = names.length > 0 ? all.filter((f) => names.includes(f.name)) : all;
  const { classifier, labelCache, paid } = services.classification();

  const pending: unknown[] = [];
  const counting: Classifier = { id: classifier.id, classify: async (items) => (pending.push(...items), []) };
  for (const f of fixtures) await buildContext(f.snapshot, { classifier: counting, labelCache });
  const chars = pending.reduce<number>((sum, item) => sum + JSON.stringify(item).length, 0);
  io.err(`${pending.length} items to label in ${fixtures.length} fixtures (${chars} characters) by ${classifier.id}`);
  if (paid && pending.length > 0 && !yes) {
    io.err("Nothing was sent. Rerun with --yes to call the model.");
    return 0;
  }

  const tally = new Map<string, { agree: number; total: number }>();
  const count = (axis: string, agree: boolean) => {
    const t = tally.get(axis) ?? { agree: 0, total: 0 };
    tally.set(axis, { agree: t.agree + Number(agree), total: t.total + 1 });
  };
  for (const f of fixtures) {
    const expected = ContextExpectationSchema.parse(f.expected);
    const context: Context = await buildContext(f.snapshot, { classifier, labelCache });
    const lines: string[] = [];
    for (const want of expected.units ?? []) {
      const got = context.units.find((u) => u.id === want.id);
      for (const axis of AXES) {
        const expectedValue = want.labels?.[axis];
        if (expectedValue === undefined) continue;
        const actual = got?.labels?.[axis];
        const same = axis === "risks" ? JSON.stringify([...(actual as string[] | undefined ?? [])].sort()) === JSON.stringify([...(expectedValue as string[])].sort()) : actual === expectedValue;
        count(axis, same);
        if (!same) lines.push(`  ✗ ${want.id} ${axis}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual ?? null)}`);
      }
    }
    for (const want of expected.sentences ?? []) {
      if (want.class === undefined) continue;
      const actual = context.sentences.find((s) => s.id === want.id)?.class;
      count("class", actual === want.class);
      if (actual !== want.class) lines.push(`  ✗ ${want.id} class: expected ${want.class}, got ${actual ?? "nothing"}`);
    }
    for (const unit of context.units) {
      if (unit.verdict === "behavioural" && unit.labels) lines.push(`  · ${unit.id}: ${unit.labels.intent}, ${unit.labels.visibility}`);
    }
    if (lines.length > 0) io.out([`${f.name}`, ...lines].join("\n"));
  }

  const totals = [...tally.values()].reduce((a, t) => ({ agree: a.agree + t.agree, total: a.total + t.total }), { agree: 0, total: 0 });
  io.out([...tally].map(([axis, t]) => `${axis} ${t.agree}/${t.total}`).join(" · "));
  io.out(`${totals.agree}/${totals.total} agree`);
  return 0;
}
