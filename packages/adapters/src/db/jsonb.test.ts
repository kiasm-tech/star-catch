import { describe, expect, it } from "vitest";
import { toJsonb } from "./jsonb.js";

describe("toJsonb", () => {
  it("drops NUL characters", () => {
    expect(JSON.parse(toJsonb({ text: "a\u0000b" }))).toEqual({ text: "ab" });
  });

  it("keeps a literal backslash-u0000", () => {
    const value = { text: "\\u0000", deeper: "\\\\u0000" };
    expect(JSON.parse(toJsonb(value))).toEqual(value);
  });
});
