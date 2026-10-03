import type { Node } from "web-tree-sitter";

export const DECLARATION_CATEGORIES = ["callable", "type", "variable", "test"] as const;
export type DeclarationCategory = (typeof DECLARATION_CATEGORIES)[number];

/** What a tree-sitter query can't say about a language's declarations (changes.md §5.3). */
export interface LanguageSpec {
  /** Captures `@definition.<category>` on the declaration and `@name` on its name. */
  definitions: string;
  /** Parent nodes that wrap a declaration and belong to its span (`export`). */
  wrappers: string[];
  /** Preceding siblings that belong to a declaration's span (a method's decorators). */
  leading: string[];
  /** A test's title node → its name; null when the title isn't a literal. */
  testName(title: Node): string | null;
}
