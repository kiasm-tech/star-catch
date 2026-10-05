/** Gates (spec-update-structure.md §3): does this cut get an update, and in which form? */
import type { ChangeUnit, Context, Cut, Gate, GateResult } from "@kiasm-tech/star-catch-contracts";
import { FactIndex } from "./facts-index.js";

const SECRET_TEXT = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /"type"\s*:\s*"service_account"/,
  /\bpassword\s*[=:]\s*["'][^"'\s]+["']/i,
];
const SECRET_FILE = /(^|\/)(\.env(?!\.example$)[^/]*|[^/]+\.(pem|key|p12)|id_(rsa|dsa|ecdsa|ed25519)[^/]*)$/;

/** A unit whose code must never be shown: a denylisted file, or a secret in its text. */
export function isUnsafe(unit: ChangeUnit): boolean {
  if (SECRET_FILE.test(unit.file)) return true;
  const text = `${unit.before ?? ""}\n${unit.after ?? ""}`;
  return SECRET_TEXT.some((pattern) => pattern.test(text));
}

const BLOCKING: Gate[] = ["meaningful", "safe", "visible"];

export function gatesOf(context: Context, cut: Cut): GateResult {
  const changed = context.units.filter((u) => u.verdict !== "notAChange");
  const facts = new FactIndex(context);
  const failed: Gate[] = [];
  if (context.truncated) failed.push("readable");
  if (changed.length === 0) failed.push("meaningful");
  if (!context.sentences.some((s) => s.class === "problem" || s.class === "rationale")) failed.push("explainable");
  if (changed.length > 0 && changed.every(isUnsafe)) failed.push("safe");
  if (cut === "business") {
    const visible = changed.some((u) => u.labels?.visibility === "user" || u.labels?.visibility === "apiConsumer");
    if (!visible && !facts.has("rules") && !facts.has("contracts")) failed.push("visible");
  }
  const outcome = failed.some((g) => BLOCKING.includes(g)) ? "none" : failed.length > 0 ? "articleOnly" : "full";
  return { outcome, failed };
}
