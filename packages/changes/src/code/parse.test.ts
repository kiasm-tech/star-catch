import { LANGUAGE_VERSION, MIN_COMPATIBLE_VERSION, type Node } from "web-tree-sitter";
import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES, isCodeLanguage, loadLanguage, parse, parserFor, type CodeLanguage } from "./parse.js";

const SAMPLES: Record<CodeLanguage, string> = {
  typescript: "export function total(items: number[]): number {\n  return items.reduce((a, b) => a + b, 0);\n}\n",
  tsx: "export function Page() {\n  return <h1 className=\"title\">Billing</h1>;\n}\n",
  javascript: "const total = (items) => items.reduce((a, b) => a + b, 0);\nmodule.exports = { total };\n",
  python: "def total(items):\n    \"\"\"Sum them.\"\"\"\n    return sum(items)\n",
  java: "class Cart {\n  int total(int[] items) {\n    int sum = 0;\n    for (int i : items) sum += i;\n    return sum;\n  }\n}\n",
};

const later = { deadline: Number.POSITIVE_INFINITY };

function namedNodes(node: Node): Node[] {
  return [node, ...node.namedChildren.flatMap((child) => (child ? namedNodes(child) : []))];
}

describe("parse", () => {
  it.each(CODE_LANGUAGES)("loads a %s grammar the runtime supports", async (language) => {
    const { abiVersion } = await loadLanguage(language);
    expect(abiVersion).toBeGreaterThanOrEqual(MIN_COMPATIBLE_VERSION);
    expect(abiVersion).toBeLessThanOrEqual(LANGUAGE_VERSION);
  });

  it.each(CODE_LANGUAGES)("parses %s without errors, with one reused parser", async (language) => {
    const parser = await parserFor(language);
    expect(await parserFor(language)).toBe(parser);
    const tree = parse(parser, SAMPLES[language], later)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.endIndex).toBe(SAMPLES[language].length);
    } finally {
      tree.delete();
    }
  });

  it("knows which languages it can parse", () => {
    expect(["typescript", "python", "java"].every(isCodeLanguage)).toBe(true);
    expect(isCodeLanguage("json")).toBe(false);
  });

  it("gives up past the deadline and starts the next parse afresh", async () => {
    const parser = await parserFor("typescript");
    const big = Array.from({ length: 20_000 }, (_, i) => `export const v${i} = ${i} + 1;`).join("\n");
    // Each progress check advances the clock, so the parse gets partway before it is cancelled.
    let clock = 0;
    expect(parse(parser, big, { deadline: 2, now: () => clock++ })).toBeNull();
    expect(clock).toBeGreaterThan(2);

    const small = SAMPLES.typescript;
    const tree = parse(parser, small, later)!;
    try {
      expect(tree.rootNode.text).toBe(small);
      expect(tree.rootNode.hasError).toBe(false);
    } finally {
      tree.delete();
    }
  });

  it("indexes by JS string position, so slicing the source gives each node's text", async () => {
    const text = "// é 😀\nexport const café = \"naïve 🍰\";\nexport function größe(x: number) { return x > 1; }\n";
    const tree = parse(await parserFor("typescript"), text, later)!;
    try {
      const nodes = namedNodes(tree.rootNode);
      expect(nodes.length).toBeGreaterThan(10);
      for (const node of nodes) expect(text.slice(node.startIndex, node.endIndex)).toBe(node.text);
    } finally {
      tree.delete();
    }
  });
});
