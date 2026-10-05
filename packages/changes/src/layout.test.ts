import { describe, expect, it } from "vitest";
import { layoutOf } from "./layout.js";

const tree = [
  "src/cart/totals.ts",
  "src/cart/receipt.ts",
  "src/pricing/discount.ts",
  "src/pricing/tax.ts",
  "src/pricing/round.ts",
  "src/checkout/flow.ts",
  "src/checkout/logo.png",
  "tests/cart.test.ts",
  "docs/setup.md",
  "README.md",
  "package.json",
];

describe("the repository around a change", () => {
  it("lists the unchanged parts by size, skipping tests, docs and non-code files", () => {
    const layout = layoutOf(tree, [], new Set(["cart"]));
    expect(layout.neighbours).toEqual([
      { component: "pricing", files: 3 },
      { component: "checkout", files: 1 },
    ]);
  });

  it("links a changed part to the unchanged parts its files import", () => {
    const changed = [{ filename: "src/cart/totals.ts", headContent: 'import { tax } from "../pricing/tax";\nimport x from "lodash";\n' }];
    expect(layoutOf(tree, changed, new Set(["cart"])).uses).toEqual([{ from: "cart", to: "pricing" }]);
  });

  it("ignores imports within the changed parts and files without contents", () => {
    const changed = [
      { filename: "src/cart/totals.ts", headContent: 'import { receipt } from "./receipt";\n' },
      { filename: "src/cart/receipt.ts" },
    ];
    expect(layoutOf(tree, changed, new Set(["cart"])).uses).toEqual([]);
  });
});
