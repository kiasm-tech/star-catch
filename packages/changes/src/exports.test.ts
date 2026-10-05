import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { exportNames } from "./exports.js";

describe("exportNames", () => {
  it("reads aliases, export lists and default exports of the file's own declarations", () => {
    const text = [
      "const persistImpl = () => 1;",
      "export const persist = persistImpl as unknown as Persist;",
      "function a() {}",
      "function b() {}",
      "export { a, b as bee };",
      "export default a;",
      'export { other } from "./other";',
      "export const store = createStore(config);",
    ].join("\n");
    expect(Object.fromEntries(exportNames(text))).toEqual({ persistImpl: ["persist"], a: ["a", "default"], b: ["bee"] });
  });
});

describe("exported aliases in analyze", () => {
  const impl = "const persistImpl = (config) => {\n  return config;\n};\nexport const persist = persistImpl as unknown as Persist;\n";
  const changed = impl.replace("return config;", "return { ...config };");

  it("records the alias on the unit and links a test that calls the alias", async () => {
    const changes = await analyze({
      files: [
        { path: "src/middleware/persist.ts", status: "modified", base: impl, head: changed },
        {
          path: "tests/persist.test.ts",
          status: "added",
          head: 'import { persist } from "zustand/middleware";\nit("keeps config", () => {\n  persist({});\n});\n',
        },
      ],
    });
    const unit = changes.units.find((u) => u.name === "persistImpl")!;
    expect(unit.exportedAs).toEqual(["persist"]);
    expect(changes.links).toContainEqual({ from: "tests/persist.test.ts#keeps config", to: unit.id, type: "covers" });
  });
});
