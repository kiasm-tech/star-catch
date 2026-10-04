import { describe, expect, it } from "vitest";
import { defaultComponentOf } from "./component.js";

describe("defaultComponentOf", () => {
  it.each([
    ["src/cart/totals.ts", "src"],
    ["app/billing/page.tsx", "app"],
    ["package.json", "(root)"],
  ])("%s → %s", (path, component) => expect(defaultComponentOf(path)).toBe(component));
});
