import { describe, expect, it } from "vitest";
import { readGrammarFile } from "./grammar-files.js";

describe("readGrammarFile", () => {
  it("reads a vendored grammar", async () => {
    const bytes = await readGrammarFile("tree-sitter-java.wasm");
    expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]); // "\0asm"
  });

  it("says how to get a missing one", async () => {
    await expect(readGrammarFile("tree-sitter-cobol.wasm")).rejects.toThrow(
      "Grammar tree-sitter-cobol.wasm is missing: run pnpm install",
    );
  });
});
