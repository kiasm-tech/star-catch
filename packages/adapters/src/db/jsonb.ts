/** JSON text for a jsonb column. jsonb rejects \u0000, so NUL characters are dropped. */
export function toJsonb(value: unknown): string {
  // An escaped backslash before "u0000" is literal text, not a NUL: keep it.
  return JSON.stringify(value).replace(/(?<!\\)((?:\\\\)*)\\u0000/g, "$1");
}
