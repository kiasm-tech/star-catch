import { describe, expect, it } from "vitest";
import { defaultComponentOf } from "./component.js";

describe("defaultComponentOf", () => {
  it.each([
    ["src/pricing/discount.ts", "pricing"],
    ["src/middleware/persist.ts", "middleware"],
    ["app/billing/page.tsx", "billing"],
    ["app/api/orders/route.ts", "api"],
    ["src/persist.ts", "persist"],
    ["src/app/settings/form.tsx", "settings"],
    ["packages/core/src/store/index.ts", "core"],
    ["src/main/java/com/acme/shop/Money.java", "shop"],
    ["src/test/kotlin/org/acme/billing/InvoiceTest.kt", "billing"],
    ["shop/invoices.py", "shop"],
    ["db/migrations/20260930_add.sql", "db"],
    ["tests/persistAsync.test.tsx", "tests"],
    ["package.json", "(root)"],
  ])("%s → %s", (path, component) => expect(defaultComponentOf(path)).toBe(component));
});
