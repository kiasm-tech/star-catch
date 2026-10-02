import { describe, expect, it } from "vitest";
import { isMock } from "./config.js";

describe("isMock", () => {
  it("defaults to the real service", () => {
    expect(isMock("github", {})).toBe(false);
  });

  it("follows the master switch", () => {
    expect(isMock("github", { STAR_CATCH_MOCK: "true" })).toBe(true);
  });

  it("lets a service switch override the master", () => {
    expect(isMock("github", { STAR_CATCH_MOCK: "true", STAR_CATCH_MOCK_GITHUB: "false" })).toBe(false);
    expect(isMock("github", { STAR_CATCH_MOCK_GITHUB: "true" })).toBe(true);
  });
});
