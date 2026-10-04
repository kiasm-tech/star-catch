import { describe, expect, it } from "vitest";
import { CruxGitHubEventSchema } from "./jobs.js";

describe("CruxGitHubEventSchema", () => {
  it("keeps the payload as sent", () => {
    const job = { deliveryId: "d-1", event: "installation", payload: { action: "created", installation: { id: 9 } } };
    expect(CruxGitHubEventSchema.parse(job)).toEqual(job);
  });

  it("needs a delivery id and an event name", () => {
    expect(CruxGitHubEventSchema.safeParse({ deliveryId: "", event: "member", payload: {} }).success).toBe(false);
    expect(CruxGitHubEventSchema.safeParse({ deliveryId: "d-1", payload: {} }).success).toBe(false);
  });
});
