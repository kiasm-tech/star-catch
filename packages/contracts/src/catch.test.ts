import { describe, expect, it } from "vitest";
import { CatchVersionSchema, catchIdOf } from "./catch.js";

describe("CatchVersionSchema", () => {
  const version = {
    catchId: catchIdOf("pmndrs/zustand", 3555),
    pr: { fullName: "pmndrs/zustand", number: 3555, title: "fix", author: null, url: "u", state: "merged", createdAt: "t", updatedAt: "t" },
    technical: null,
    business: null,
    generatedBy: { classifier: "mock@1", writer: "template@1" },
  };

  it("names a catch by repository and number", () => {
    expect(catchIdOf("pmndrs/zustand", 3555)).toBe("pmndrs__zustand__3555");
    expect(CatchVersionSchema.parse(version).catchId).toBe("pmndrs__zustand__3555");
  });

  it("rejects an id that isn't owner__repo__number", () => {
    expect(CatchVersionSchema.safeParse({ ...version, catchId: "pmndrs/zustand#3555" }).success).toBe(false);
  });
});
