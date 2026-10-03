import type { Node } from "web-tree-sitter";
import type { LanguageSpec } from "../spec.js";

/** `describe` / `it` / `test` / `context` with a literal title, as Jest, Vitest and Mocha write them. */
export const TEST_CASES = `
(expression_statement
  (call_expression
    function: [(identifier) (member_expression)] @fn
    arguments: (arguments . [(string) (template_string)] @name))
  (#match? @fn "^(describe|it|test|context)(\\\\.(only|skip|each|concurrent))?$")) @definition.test
`;

/** Top-level `const` / `let` / `var`, exported or not. */
export const TOP_LEVEL_VARIABLES = `
(program (lexical_declaration (variable_declarator name: (identifier) @name)) @definition.variable)
(program (variable_declaration (variable_declarator name: (identifier) @name)) @definition.variable)
(program (export_statement (lexical_declaration (variable_declarator name: (identifier) @name)) @definition.variable))
(program (export_statement (variable_declaration (variable_declarator name: (identifier) @name)) @definition.variable))
`;

const BOOLEAN_OPERATORS = new Set(["<", ">", "<=", ">=", "==", "!=", "===", "!==", "&&", "||"]);

/** Comparisons, `&&` / `||`, `!`, and a `case` value. Java's operators are a subset. */
export function cStyleCondition(node: Node): boolean {
  if (node.type === "binary_expression") return BOOLEAN_OPERATORS.has(node.childForFieldName("operator")?.text ?? "");
  if (node.type === "unary_expression") return node.childForFieldName("operator")?.text === "!";
  return node.parent?.type === "switch_case" && node.parent.childForFieldName("value")?.id === node.id;
}

/** A string title without quotes; a template title only when it has no substitutions. */
export function literalTitle(title: Node): string | null {
  if (title.type === "template_string" && title.namedChildren.some((c) => c?.type === "template_substitution")) {
    return null;
  }
  return title.text.slice(1, -1);
}

export const javascript: LanguageSpec = {
  definitions: `
(function_declaration name: (identifier) @name) @definition.callable
(generator_function_declaration name: (identifier) @name) @definition.callable
(method_definition name: [(property_identifier) (private_property_identifier)] @name) @definition.callable
(class_declaration name: (identifier) @name) @definition.type
(field_definition property: [(property_identifier) (private_property_identifier)] @name) @definition.variable
${TOP_LEVEL_VARIABLES}
${TEST_CASES}`,
  wrappers: ["export_statement"],
  leading: ["decorator"],
  testName: literalTitle,
  isCondition: cStyleCondition,
};
