import { CatchVersionSchema } from "@kiasm-tech/star-catch-contracts";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifySignature } from "@star-catch/adapters";
import { FIXTURES_DIR, freshDatabase } from "@star-catch/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Io } from "./io.js";
import { run } from "./run.js";

let dir: string;
let out: string[];
let err: string[];
const io: Io = { out: (l) => void out.push(l), err: (l) => void err.push(l) };
const mockEnv = () => ({ STAR_CATCH_MOCK: "true", STAR_CATCH_FIXTURES_DIR: dir });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "cli-"));
  await cp(FIXTURES_DIR, dir, { recursive: true });
  out = [];
  err = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("cli fixtures", () => {
  it("passes on the repository's fixtures", async () => {
    expect(await run(["fixtures"], mockEnv(), io)).toBe(0);
    expect(out.at(-1)).toMatch(/^(\d+)\/\1 fixtures ok$/);
    expect(out.filter((l) => l.startsWith("ok    synthetic/"))).toHaveLength(15);
  });

  it("fails and names the fixture when a patch is wrong", async () => {
    const file = path.join(dir, "synthetic", "05-condition-change", "snapshot.json");
    const snapshot = JSON.parse(await readFile(file, "utf8"));
    snapshot.files[0].headContent += "// edited\n";
    await writeFile(file, JSON.stringify(snapshot));

    expect(await run(["fixtures"], mockEnv(), io)).toBe(1);
    expect(out).toContain("FAIL  synthetic/05-condition-change");
  });
});

describe("cli record", () => {
  it("records a pull request from the mock source exactly as it was recorded", async () => {
    const snapshotFile = path.join(dir, "snapshots", "pmndrs__zustand__3469.json");
    const webhookFile = path.join(dir, "webhooks", "pmndrs__zustand__3469.opened.json");
    const [snapshotBefore, webhookBefore] = await Promise.all([readFile(snapshotFile, "utf8"), readFile(webhookFile, "utf8")]);

    expect(await run(["record", "pmndrs/zustand", "3469"], mockEnv(), io)).toBe(0);
    expect(out).toEqual(["pmndrs__zustand__3469: 2 files, 4 commits"]);
    expect(await readFile(snapshotFile, "utf8")).toBe(snapshotBefore);
    expect(await readFile(webhookFile, "utf8")).toBe(webhookBefore);
  });

  it("asks for a token before calling GitHub", async () => {
    const env = { STAR_CATCH_MOCK: "false", STAR_CATCH_FIXTURES_DIR: dir };
    expect(await run(["record", "pmndrs/zustand", "1"], env, io)).toBe(2);
    expect(err[0]).toMatch(/GITHUB_TOKEN/);
  });

  it.each([[["record"]], [["record", "zustand", "1"]], [["record", "pmndrs/zustand", "x"]], [["nope"]], [[]]])(
    "rejects %j with a usage error",
    async (argv) => {
      expect(await run(argv, mockEnv(), io)).toBe(2);
      expect(err.length).toBeGreaterThan(0);
    },
  );
});

describe("cli migrate", () => {
  it("applies the migrations once", async () => {
    const database = await freshDatabase();
    try {
      const env = { ...mockEnv(), DATABASE_URL: database.url };
      expect(await run(["migrate"], env, io)).toBe(0);
      expect(await run(["migrate"], env, io)).toBe(0);
      expect(out).toEqual(["applied  0001_star_catch.sql", "applied  0002_delivery_handled.sql", "up to date"]);
    } finally {
      await database.drop();
    }
  });

  it("asks for DATABASE_URL", async () => {
    expect(await run(["migrate"], mockEnv(), io)).toBe(2);
    expect(err[0]).toMatch(/DATABASE_URL/);
  });
});

describe("cli replay", () => {
  it("posts a recorded webhook with a signature the intake accepts", async () => {
    const received: { headers: Record<string, string | string[] | undefined>; valid: boolean }[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        received.push({ headers: req.headers, valid: verifySignature("dev", body, req.headers["x-hub-signature-256"] as string) });
        res.writeHead(202, { "content-type": "application/json" }).end('{"outcome":"queued"}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const file = path.join(dir, "webhooks", "pmndrs__zustand__3469.opened.json");
      const env = { ...mockEnv(), GITHUB_WEBHOOK_SECRET: "dev" };
      expect(await run(["replay", file, "--url", `http://127.0.0.1:${port}/github/webhook`], env, io)).toBe(0);
    } finally {
      server.close();
    }
    expect(out).toEqual(['202 {"outcome":"queued"}']);
    expect(received).toEqual([
      { valid: true, headers: expect.objectContaining({ "x-github-event": "pull_request", "x-github-delivery": expect.stringMatching(/^replay-/) }) },
    ]);
  });

  it("asks for the secret", async () => {
    expect(await run(["replay", "webhook.json"], mockEnv(), io)).toBe(2);
    expect(err[0]).toMatch(/GITHUB_WEBHOOK_SECRET/);
  });
});

describe("cli analyze", () => {
  it("prints a fixture's change set, and a line per unit to stderr", async () => {
    expect(await run(["analyze", path.join(dir, "synthetic", "09-ts-extract")], mockEnv(), io)).toBe(0);
    const changes = JSON.parse(out.join("\n"));
    expect(changes.refactorings).toEqual([expect.objectContaining({ type: "extract", description: "orderTotal extracted from receiptLines" })]);
    expect(err).toEqual([
      "structural  added            src/orders/receipt.ts#orderTotal [extract]",
      "structural  bodyChanged      src/orders/receipt.ts#receiptLines [extract]",
      expect.stringMatching(/^2 units in \d+ ms$/),
    ]);
  });

  it("reads a snapshot file too", async () => {
    expect(await run(["analyze", path.join(dir, "snapshots", "pmndrs__zustand__3469.json")], mockEnv(), io)).toBe(0);
    expect(JSON.parse(out.join("\n")).units.length).toBeGreaterThan(0);
  });

  it("fails on a path that doesn't exist and needs exactly one", async () => {
    expect(await run(["analyze", path.join(dir, "nope")], mockEnv(), io)).toBe(1);
    expect(await run(["analyze"], mockEnv(), io)).toBe(2);
  });
});

describe("cli context", () => {
  it("prints a fixture's context with the offline classifier", async () => {
    expect(await run(["context", path.join(dir, "synthetic", "08-ui-with-test")], mockEnv(), io)).toBe(0);
    const context = JSON.parse(out.join("\n"));
    expect(context.concerns).toHaveLength(1);
    expect(context.facts.map((f: { group: string; key: string }) => `${f.group}.${f.key}`)).toContain("users.screens");
    expect(err[0]).toMatch(/^concern-1 \(importance 8\): /);
    expect(err.at(-1)).toMatch(/^2 units, 4 sentences, 1 concerns, 6 facts in \d+ ms by mock@1$/);
  });

  it("asks for a model, then for a key, before classifying for real", async () => {
    const target = path.join(dir, "synthetic", "08-ui-with-test");
    expect(await run(["context", target], { STAR_CATCH_MOCK: "false", STAR_CATCH_FIXTURES_DIR: dir }, io)).toBe(2);
    expect(err.at(-1)).toMatch(/^Set STAR_CATCH_CLASSIFIER_MODEL/);
    expect(await run(["context", target], { STAR_CATCH_CLASSIFIER_MODEL: "claude-haiku-4-5", STAR_CATCH_FIXTURES_DIR: dir }, io)).toBe(2);
    expect(err.at(-1)).toMatch(/^Set ANTHROPIC_API_KEY, or OPENAI_API_KEY/);
  });
});

describe("cli eval-classify", () => {
  it("compares the offline classifier with every pinned label", async () => {
    expect(await run(["eval-classify"], mockEnv(), io)).toBe(0);
    expect(err[0]).toMatch(/^\d+ items to label in 15 fixtures \(\d+ characters\) by mock@1$/);
    expect(out.at(-1)).toMatch(/^(\d+)\/\1 agree$/);
  });

  it("names a label that disagrees", async () => {
    const file = path.join(dir, "synthetic", "08-ui-with-test", "expected.json");
    const expected = JSON.parse(await readFile(file, "utf8"));
    expected.sentences[0].class = "noise";
    await writeFile(file, JSON.stringify(expected));

    expect(await run(["eval-classify", "08-ui-with-test"], mockEnv(), io)).toBe(0);
    expect(out).toContainEqual(expect.stringContaining("✗ description:0 class: expected noise, got problem"));
    expect(out.at(-1)).toMatch(/^(\d+)\/(?!\1$)\d+ agree$/);
  });

  it("sends nothing to a paid model without --yes", async () => {
    const cache = path.join(dir, "labels.json");
    const env = { STAR_CATCH_MOCK: "false", STAR_CATCH_CLASSIFIER_MODEL: "claude-haiku-4-5", ANTHROPIC_API_KEY: "test", STAR_CATCH_LABEL_CACHE: cache, STAR_CATCH_FIXTURES_DIR: dir };
    expect(await run(["eval-classify", "05-condition-change"], env, io)).toBe(0);
    expect(err).toEqual([
      expect.stringMatching(/^4 items to label in 1 fixtures \(\d+ characters\) by model:claude-haiku-4-5@prompt-[0-9a-f]{12}$/),
      "Nothing was sent. Rerun with --yes to call the model.",
    ]);
    expect(out).toEqual([]);
    await expect(readFile(cache)).rejects.toThrow(/ENOENT/);
  });

  it("refuses a fixture that doesn't exist", async () => {
    expect(await run(["eval-classify", "99-nope"], mockEnv(), io)).toBe(2);
  });
});

describe("cli script", () => {
  it("prints both scripts of PR #921 with the template writer, sections and flags on stderr", async () => {
    expect(await run(["script", path.join(dir, "synthetic", "15-rate-limit-per-org")], mockEnv(), io)).toBe(0);
    const scripts = JSON.parse(out.join("\n"));
    expect(Object.keys(scripts)).toEqual(["technical", "business"]);
    expect(err[0]).toMatch(/^technical \(full, \d+ words\): title, problem, changeMap, structureChange, fromOutside, interaction, rule, reach, verification, risksRollout, wrap$/);
    expect(err.at(-1)).toMatch(/by mock@1 and template@1$/);
  });

  it("asks for a writer model before writing for real", async () => {
    const env = { STAR_CATCH_MOCK: "false", STAR_CATCH_MOCK_LLM: "false", STAR_CATCH_FIXTURES_DIR: dir };
    expect(await run(["script", path.join(dir, "synthetic", "05-condition-change")], env, io)).toBe(2);
    expect(err.at(-1)).toMatch(/^Set STAR_CATCH_CLASSIFIER_MODEL/);
  });
});

describe("cli catch", () => {
  it("exports every PR that gets an update, the same bytes twice, and skips the rest", async () => {
    const out = path.join(dir, "catches");
    expect(await run(["catch", "--all", "--out", out], mockEnv(), io)).toBe(0);
    const files = (await readdir(out)).sort();
    expect(files).toContain("acme__shop__921.json");
    expect(files).toContain("pmndrs__zustand__3555.json");
    expect(files.filter((f) => /acme__shop__10[124]\.json/.test(f))).toEqual([]);
    expect(err).toContainEqual("acme__shop__101: no update, skipped");
    const first = await readFile(path.join(out, "acme__shop__921.json"), "utf8");
    const parsed = CatchVersionSchema.parse(JSON.parse(first));
    expect(parsed.pr).toMatchObject({ fullName: "acme/shop", number: 921, state: "merged" });
    expect(parsed.generatedBy).toEqual({ classifier: "mock@1", writer: "template@1" });
    expect(await run(["catch", "--all", "--out", out], mockEnv(), io)).toBe(0);
    expect(await readFile(path.join(out, "acme__shop__921.json"), "utf8")).toBe(first);
  });

  it("prints one catch to stdout", async () => {
    expect(await run(["catch", path.join(dir, "synthetic", "08-ui-with-test")], mockEnv(), io)).toBe(0);
    expect(CatchVersionSchema.parse(JSON.parse(out.join("\n"))).catchId).toBe("acme__shop__108");
  });

  it("needs a target or --all with --out", async () => {
    expect(await run(["catch"], mockEnv(), io)).toBe(2);
    expect(await run(["catch", "--all"], mockEnv(), io)).toBe(2);
  });
});

