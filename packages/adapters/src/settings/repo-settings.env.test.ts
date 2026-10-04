import { describe, expect, it } from "vitest";
import { EnvRepoSettings } from "./repo-settings.env.js";

describe("EnvRepoSettings", () => {
  it("enables the listed repos, in any case", async () => {
    const settings = new EnvRepoSettings(" Acme/Shop ,pmndrs/zustand,");
    expect(await settings.isEnabled("acme/shop")).toBe(true);
    expect(await settings.isEnabled("PMNDRS/Zustand")).toBe(true);
    expect(await settings.isEnabled("acme/other")).toBe(false);
  });

  it.each([[undefined], [""], [" , "]])("enables nothing for %j", async (list) => {
    expect(await new EnvRepoSettings(list).isEnabled("acme/shop")).toBe(false);
  });
});
