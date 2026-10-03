import { loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { analyzeChanges } from "./analyze-changes.js";

describe("analyzeChanges", () => {
  it("analyses a snapshot as stored", async () => {
    const { snapshot } = loadSyntheticFixtures().find((f) => f.name === "09-ts-extract")!;
    const changes = await analyzeChanges(JSON.parse(JSON.stringify(snapshot)));
    expect(changes.units.map((u) => u.id)).toEqual(["src/orders/receipt.ts#orderTotal", "src/orders/receipt.ts#receiptLines"]);
  });

  it("refuses what isn't a snapshot", async () => {
    await expect(analyzeChanges({ fullName: "acme/shop" })).rejects.toThrow();
  });
});
