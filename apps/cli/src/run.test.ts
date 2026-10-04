import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    expect(out.filter((l) => l.startsWith("ok    synthetic/"))).toHaveLength(13);
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
