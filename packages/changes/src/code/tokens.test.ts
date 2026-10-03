import { loadSyntheticFixtures } from "@star-catch/testkit";
import { describe, expect, it } from "vitest";
import { java } from "../languages/java/language.js";
import { python } from "../languages/python/language.js";
import { typescript } from "../languages/typescript/language.js";
import type { LanguageSpec } from "../languages/spec.js";
import { declarationsOf } from "./declarations.js";
import { parse, parserFor, type CodeLanguage } from "./parse.js";
import { hashTokens, ownTokens, residueTokens, tokensOf } from "./tokens.js";

const SPECS: Partial<Record<CodeLanguage, LanguageSpec>> = { typescript, tsx: typescript, python, java };
const later = { deadline: Number.POSITIVE_INFINITY };

/** Each declaration's own tokens and hash, plus the file's tokens and residue. */
async function read(language: CodeLanguage, source: string) {
  const tree = parse(await parserFor(language), source, later)!;
  try {
    const tokens = tokensOf(tree, source, SPECS[language]!);
    const declarations = await declarationsOf(tree, language);
    const own = Object.fromEntries(
      declarations.map((d) => {
        const mine = ownTokens(tokens, d, declarations);
        return [d.qualifiedName, { text: mine.map((t) => t.text).join(" "), hash: hashTokens(mine) }];
      }),
    );
    return { tokens: tokens.map((t) => t.text), own, residue: residueTokens(tokens, declarations).map((t) => t.text) };
  } finally {
    tree.delete();
  }
}

describe("tokensOf", () => {
  it("never yields whitespace, so reformatting changes nothing", async () => {
    const a = await read("typescript", "export function f(a: number) { return a + 1; }\n");
    const b = await read("typescript", "export function f(\n  a: number,\n) {\n    return a+1;\n}\n");
    expect(a.tokens).toEqual(["export", "function", "f", "(", "a", ":", "number", ")", "{", "return", "a", "+", "1", ";", "}"]);
    expect(b.tokens).toEqual([...a.tokens.slice(0, 7), ",", ...a.tokens.slice(7)]);
  });

  it("drops comments in every language", async () => {
    expect((await read("typescript", "// a\n/* b */ const x = 1; /** c */\n")).tokens).toEqual(["const", "x", "=", "1", ";"]);
    expect((await read("python", "# a\nx = 1  # b\n")).tokens).toEqual(["x", "=", "1"]);
    expect((await read("java", "/** a */ class A { // b\n int x; /* c */ }\n")).tokens).toEqual(["class", "A", "{", "int", "x", ";", "}"]);
  });

  it("drops Python docstrings, and only docstrings", async () => {
    const source = `"""Module."""\nclass A:\n    """Class."""\n    def f(self):\n        """Function."""\n        "not a docstring"\n        return 1\n`;
    expect((await read("python", source)).tokens.join(" ")).toBe(
      'class A : def f ( self ) : " not a docstring " return 1',
    );
  });
});

describe("ownTokens", () => {
  it("leaves nested declarations out of their container", async () => {
    const base = await read("typescript", "class Cart {\n  total() { return 1; }\n}\n");
    const head = await read("typescript", "class Cart {\n  total() { return 2; }\n  count() { return 0; }\n}\n");
    expect(base.own["Cart"].text).toBe("class Cart { }");
    expect(head.own["Cart"].hash).toBe(base.own["Cart"].hash);
    expect(head.own["Cart.total"].hash).not.toBe(base.own["Cart.total"].hash);
  });

  it("keeps the decorators and export keyword of a declaration", async () => {
    const { own } = await read("typescript", "@Injectable()\nexport class Api {\n  @Get() run() {}\n}\n");
    expect(own["Api"].text).toBe("@ Injectable ( ) export class Api { }");
    expect(own["Api.run"].text).toBe("@ Get ( ) run ( ) { }");
  });

  it("separates variables declared in one statement", async () => {
    const base = await read("typescript", "export const MAX = 10, MIN = 1;\n");
    const head = await read("typescript", "export const MAX = 10, MIN = 2;\n");
    expect(base.own["MAX"].text).toBe("export const MAX = 10 , ;");
    expect(head.own["MAX"].hash).toBe(base.own["MAX"].hash);
    expect(head.own["MIN"].hash).not.toBe(base.own["MIN"].hash);
  });

  it("separates test cases from their suite", async () => {
    const { own } = await read("typescript", 'describe("cart", () => {\n  it("adds", () => { add(); });\n});\n');
    expect(own["cart"].text).toBe('describe ( " cart " , ( ) => { } ) ;');
    expect(own["cart > adds"].text).toBe('it ( " adds " , ( ) => { add ( ) ; } ) ;');
  });
});

describe("residueTokens", () => {
  it("is what lies outside every declaration", async () => {
    const { residue } = await read("typescript", 'import { z } from "zod";\nexport function f() {}\nf();\n');
    expect(residue).toEqual(["import", "{", "z", "}", "from", '"', "zod", '"', ";", "f", "(", ")", ";"]);
  });
});

describe("hashes on the fixtures", () => {
  it.each(["01-formatting-only", "02-comment-only"])("%s: every declaration keeps its hash", async (name) => {
    const fixture = loadSyntheticFixtures().find((f) => f.name === name)!;
    for (const file of fixture.snapshot.files) {
      const base = await read("typescript", file.baseContent!);
      const head = await read("typescript", file.headContent!);
      expect(Object.keys(head.own)).toEqual(Object.keys(base.own));
      for (const name of Object.keys(base.own)) expect(head.own[name].hash).toBe(base.own[name].hash);
      expect(file.headContent).not.toBe(file.baseContent);
    }
  });

  it("is sha1 of the tokens joined with NUL", () => {
    expect(hashTokens([{ text: "a", start: 0, end: 1 }, { text: "b", start: 2, end: 3 }])).toBe(
      "4a3dec2d1f8245280855c42db0ee4239f917fdb8",
    );
  });
});
