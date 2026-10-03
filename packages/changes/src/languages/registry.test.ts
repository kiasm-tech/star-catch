import { describe, expect, it } from "vitest";
import { languageOf } from "./registry.js";

describe("languageOf", () => {
  it.each([
    ["src/cart/totals.ts", "typescript", "code"],
    ["src/lib/esm.mts", "typescript", "code"],
    ["app/billing/page.tsx", "tsx", "code"],
    ["scripts/build.mjs", "javascript", "code"],
    ["web/Widget.jsx", "javascript", "code"],
    ["shop/cart.py", "python", "code"],
    ["src/main/java/com/acme/Money.java", "java", "code"],
    ["config/flags.json", "json", "structured"],
    ["tsconfig.jsonc", "json", "structured"],
    [".github/workflows/ci.yml", "yaml", "structured"],
    ["pyproject.toml", "toml", "structured"],
    ["db/migrations/0001.sql", "sql", "structured"],
    ["README.MD", "markdown", "structured"],
    ["pom.xml", "xml", "structured"],
    ["app/build.gradle.kts", "gradle", "structured"],
    ["go.mod", "gomod", "structured"],
    ["requirements-dev.txt", "requirements", "structured"],
  ])("%s → %s, %s", (path, language, engine) => {
    expect(languageOf(path)).toEqual({ language, engine });
  });

  it.each([
    ["src/native/lib.c", "c"],
    ["main.go", "go"],
    ["Makefile", "text"],
    [".gitignore", "text"],
    ["config/app.xml", "xml"],
    ["odd/file.we_ird", "text"],
  ])("compares %s line by line as %s", (path, language) => {
    expect(languageOf(path)).toEqual({ language, engine: "lines" });
  });
});
