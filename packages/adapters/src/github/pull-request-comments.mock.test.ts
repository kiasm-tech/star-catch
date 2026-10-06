import { describe, expect, it } from "vitest";
import { MemoryPullRequestComments } from "./pull-request-comments.mock.js";

describe("MemoryPullRequestComments", () => {
  it("keeps one comment per PR and marker, edited in place", async () => {
    const memory = new MemoryPullRequestComments();
    const ref = { fullName: "acme/shop", number: 7, installationId: 1 };
    expect(await memory.upsert(ref, "<!-- m -->", "<!-- m --> one")).toBe("created");
    expect(await memory.upsert(ref, "<!-- m -->", "<!-- m --> two")).toBe("updated");
    expect(await memory.upsert(ref, "<!-- m -->", "<!-- m --> two")).toBe("unchanged");
    expect(await memory.upsert({ ...ref, number: 8 }, "<!-- m -->", "<!-- m --> other")).toBe("created");
    expect(memory.comments).toEqual([
      { fullName: "acme/shop", number: 7, body: "<!-- m --> two" },
      { fullName: "acme/shop", number: 8, body: "<!-- m --> other" },
    ]);
  });
});
