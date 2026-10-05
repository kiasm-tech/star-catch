/** Labels for visuals: names people can read, text short enough for a box. */

const CONVENTIONAL = /^\w+(\([^)]*\))?!?:\s*/;

/** `fix(limits): rate limits count per organisation` → `Rate limits count per organisation`. */
export function plainTitle(title: string): string {
  const text = title.replace(CONVENTIONAL, "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `persistImpl` → `persist`, `BillingPage` → `billing page`, `Cart._subtotal` → `subtotal`, `limiter.test.ts` → `limiter`. */
export function humanize(name: string): string {
  const last = name.split(" > ").at(-1)!.split(".").filter((part) => !/^(ts|tsx|js|jsx|py|java|test|spec)$/.test(part)).at(-1) ?? name;
  const words = last
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .map((w) => (/^[A-Z0-9]+$/.test(w) && w.length > 1 ? w : w.toLowerCase()))
    .filter((w) => w && w !== "impl");
  return words.join(" ") || last;
}

/** A test case's own title: `allowRequest > counts two keys…` → `counts two keys…`. */
export const testTitle = (name: string) => name.split(" > ").at(-1)!;

/** At most `max` characters, cut at a clause or a word; code spans lose their backticks. */
export function clip(text: string, max = 80): string {
  const plain = text.replace(/`/g, "").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  const clause = plain.slice(0, max + 1).match(/^(.{20,}?)[,;:—](?:\s|$)/)?.[1];
  if (clause) return clause;
  return `${plain.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}
