import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  FixtureReader,
  FixtureWriter,
  Recording,
  StoredJson,
  SyntheticFixtureFiles,
} from "@star-catch/pipeline";

/** Fixtures on disk: snapshots/, webhooks/ and synthetic/<name>/{snapshot,expected,expected-sections}.json. */
export class FileFixtureStore implements FixtureReader, FixtureWriter {
  constructor(private readonly dir: string) {}

  recordedSnapshots(): Promise<StoredJson[]> {
    return this.readJsonFiles("snapshots");
  }

  recordedWebhooks(): Promise<StoredJson[]> {
    return this.readJsonFiles("webhooks");
  }

  async syntheticFixtures(): Promise<SyntheticFixtureFiles[]> {
    const root = path.join(this.dir, "synthetic");
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return Promise.all(
      names.map(async (name) => ({
        name,
        snapshot: await readJson(path.join(root, name, "snapshot.json")),
        expected: await readJson(path.join(root, name, "expected.json")),
        sections: await readJson(path.join(root, name, "expected-sections.json")).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        }),
      })),
    );
  }

  async saveRecording({ id, snapshot, webhook }: Recording): Promise<void> {
    await mkdir(path.join(this.dir, "snapshots"), { recursive: true });
    await mkdir(path.join(this.dir, "webhooks"), { recursive: true });
    await writeJson(path.join(this.dir, "snapshots", `${id}.json`), snapshot);
    await writeJson(path.join(this.dir, "webhooks", `${id}.opened.json`), webhook);
  }

  private async readJsonFiles(folder: string): Promise<StoredJson[]> {
    const root = path.join(this.dir, folder);
    const files = (await readdir(root).catch(() => [])).filter((f) => f.endsWith(".json")).sort();
    return Promise.all(files.map(async (name) => ({ name, data: await readJson(path.join(root, name)) })));
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}
