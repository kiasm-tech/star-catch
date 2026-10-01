/** Lines a unified-diff patch adds and removes, hunk headers excluded. */
export function countPatchLines(patch: string): { additions: number; deletions: number } {
  const lines = patch.split("\n").filter((line) => !line.startsWith("@@"));
  return {
    additions: lines.filter((line) => line.startsWith("+")).length,
    deletions: lines.filter((line) => line.startsWith("-")).length,
  };
}

/** Applies a unified-diff patch to `base`; throws when a context or removed line doesn't match. */
export function applyPatch(base: string, patch: string): string {
  const baseLines = base === "" ? [] : base.replace(/\n$/, "").split("\n");
  const out: string[] = [];
  let at = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
    if (hunk) {
      const start = hunk[2] === "0" ? Number(hunk[1]) : Number(hunk[1]) - 1;
      out.push(...baseLines.slice(at, start));
      at = start;
    } else if (line.startsWith("+")) {
      out.push(line.slice(1));
    } else if (line.startsWith("-") || line.startsWith(" ")) {
      if (baseLines[at] !== line.slice(1)) {
        throw new Error(`patch does not match the base at line ${at + 1}`);
      }
      if (line.startsWith(" ")) out.push(line.slice(1));
      at++;
    } else {
      throw new Error(`unexpected patch line: ${line}`);
    }
  }
  out.push(...baseLines.slice(at));
  return out.length === 0 ? "" : `${out.join("\n")}\n`;
}
