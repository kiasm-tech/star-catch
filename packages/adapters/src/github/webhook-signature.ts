import { createHmac, timingSafeEqual } from "node:crypto";

/** X-Hub-Signature-256 for a body: "sha256=" and the hex HMAC-SHA256 under the webhook secret. */
export function sign(secret: string, body: Uint8Array | string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Compares in constant time, so the response time leaks nothing about the expected value. */
export function verifySignature(secret: string, body: Uint8Array, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
