/** `export const persist = persistImpl as Persist`: the bare identifier on the right, nothing else. */
const ALIAS = /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*([A-Za-z_$][\w$]*)\s*(?:as\b[^\n;]*)?;?\s*$/gm;
/** `export { a, b as c }`, but not a re-export of another module's names. */
const LIST = /^export\s*\{([^}]*)\}\s*;?\s*$/gm;
const DEFAULT = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm;

/** The names an ECMAScript file exports its own declarations under, by declaration name. */
export function exportNames(text: string): Map<string, string[]> {
  const names = new Map<string, string[]>();
  const add = (target: string, name: string) => names.set(target, [...(names.get(target) ?? []), name]);
  for (const [, name, target] of text.matchAll(ALIAS)) add(target!, name!);
  for (const [, list] of text.matchAll(LIST)) {
    for (const item of list!.split(",")) {
      const [target, name] = item.trim().split(/\s+as\s+/);
      if (target) add(target, name ?? target);
    }
  }
  for (const [, target] of text.matchAll(DEFAULT)) add(target!, "default");
  return names;
}
