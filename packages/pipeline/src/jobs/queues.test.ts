import { describe, expect, it } from "vitest";
import { INGEST_QUEUE, QUEUES, ingestKey } from "./queues.js";

describe("queues", () => {
  it("prefixes the backend's own queues with star-catch.", () => {
    expect(INGEST_QUEUE.name).toBe("star-catch.ingest");
    expect(new Set(QUEUES.map((q) => q.name)).size).toBe(QUEUES.length);
  });

  it("keys an ingest by repo, in any case, and head commit", () => {
    expect(ingestKey({ fullName: "Acme/Shop", headSha: "abc1234" })).toBe(ingestKey({ fullName: "acme/shop", headSha: "abc1234" }));
    expect(ingestKey({ fullName: "acme/shop", headSha: "abc1234" })).not.toBe(ingestKey({ fullName: "acme/shop", headSha: "def5678" }));
  });
});
