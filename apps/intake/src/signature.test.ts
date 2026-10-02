import { describe, expect, it } from "vitest";
import { sign, verifySignature } from "./signature.js";

const body = new TextEncoder().encode('{"action":"opened"}');

describe("verifySignature", () => {
  it("accepts the body's own signature", () => {
    expect(verifySignature("s3cret", body, sign("s3cret", body))).toBe(true);
  });

  it("matches GitHub's documented example", () => {
    // docs.github.com, "Validating webhook deliveries"
    const header = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
    expect(verifySignature("It's a Secret to Everybody", new TextEncoder().encode("Hello, World!"), header)).toBe(true);
  });

  it.each([
    ["another secret", sign("other", body)],
    ["a changed body", sign("s3cret", '{"action":"closed"}')],
    ["the old sha1 header", "sha1=0123"],
    ["a truncated signature", sign("s3cret", body).slice(0, 20)],
    ["no header", undefined],
  ])("rejects %s", (_case, header) => {
    expect(verifySignature("s3cret", body, header)).toBe(false);
  });
});
