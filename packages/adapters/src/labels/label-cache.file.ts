import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { StoredLabelsSchema, type LabelCache, type StoredLabels } from "@star-catch/changes";

/** Labels in one JSON file (`.cache/labels.json` for the CLI); the worker uses Postgres. */
export class FileLabelCache implements LabelCache {
  private rows: Map<string, StoredLabels> | null = null;

  constructor(private readonly file: string) {}

  async get(inputHashes: string[]): Promise<Map<string, StoredLabels>> {
    const rows = await this.load();
    return new Map(inputHashes.filter((h) => rows.has(h)).map((h) => [h, rows.get(h)!]));
  }

  async put(entries: StoredLabels[]): Promise<void> {
    const rows = await this.load();
    for (const entry of entries) rows.set(entry.inputHash, entry);
    await mkdir(path.dirname(this.file), { recursive: true });
    // Written beside it, then renamed: a crash never leaves half a file.
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, rows: [...rows.values()] })}\n`);
    await rename(temporary, this.file);
  }

  /** Rows that no longer parse (an older label set) are skipped. */
  private async load(): Promise<Map<string, StoredLabels>> {
    if (this.rows) return this.rows;
    let raw: unknown = { rows: [] };
    try {
      raw = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const rows = Array.isArray((raw as { rows?: unknown }).rows) ? (raw as { rows: unknown[] }).rows : [];
    this.rows = new Map(rows.flatMap((row) => {
      const parsed = StoredLabelsSchema.safeParse(row);
      return parsed.success ? [[parsed.data.inputHash, parsed.data] as const] : [];
    }));
    return this.rows;
  }
}
