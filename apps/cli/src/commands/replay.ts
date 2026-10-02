import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sign } from "@star-catch/adapters";
import { UsageError, type Services } from "../compose.js";
import type { Io } from "../io.js";

export const replayUsage =
  "replay <webhook.json> [--event <name>] [--url <url>]  sign a recorded webhook and POST it to an intake";

const DEFAULT_URL = "http://localhost:8080/github/webhook";

function parse(args: string[]): { file: string; event: string; url: string } {
  const options: Record<string, string> = { event: "pull_request", url: DEFAULT_URL };
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const flag = /^--(event|url)$/.exec(args[i])?.[1];
    if (flag && args[i + 1]) options[flag] = args[++i];
    else if (!args[i].startsWith("--")) files.push(args[i]);
    else throw new UsageError(`Usage: ${replayUsage}`);
  }
  if (files.length !== 1) throw new UsageError(`Usage: ${replayUsage}`);
  return { file: files[0], event: options.event, url: options.url };
}

export async function replay(args: string[], services: Services, io: Io): Promise<number> {
  const { file, event, url } = parse(args);
  const secret = services.webhookSecret();
  const body = await readFile(file, "utf8");
  const res = await fetch(url, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-delivery": `replay-${randomUUID()}`,
      "x-github-event": event,
      "x-hub-signature-256": sign(secret, body),
    },
    signal: AbortSignal.timeout(10_000),
  });
  io.out(`${res.status} ${await res.text()}`);
  return res.ok ? 0 : 1;
}
