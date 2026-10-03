import type { Node } from "web-tree-sitter";
import type { LanguageSpec } from "../spec.js";

const DOCUMENTED = new Set(["module", "function_definition", "class_definition"]);

const CONDITIONS = new Set(["comparison_operator", "boolean_operator", "not_operator"]);

/** Comparisons, `and` / `or` / `not`, and the middle of `a if cond else b`. */
function isCondition(node: Node): boolean {
  if (CONDITIONS.has(node.type)) return true;
  return node.parent?.type === "conditional_expression" && node.parent.namedChild(1)?.id === node.id;
}

/** A string statement that opens a module, class or function body. */
function isDocstring(statement: Node): boolean {
  if (statement.type !== "expression_statement" || statement.namedChildCount !== 1) return false;
  if (statement.firstNamedChild?.type !== "string") return false;
  const body = statement.parent;
  if (!body || body.firstNamedChild?.id !== statement.id) return false;
  const owner = body.type === "block" ? body.parent : body;
  return owner !== null && DOCUMENTED.has(owner.type);
}

/** Test functions are declarations already (`test_*`), so there is no test-case query. */
export const python: LanguageSpec = {
  definitions: `
(function_definition name: (identifier) @name) @definition.callable
(class_definition name: (identifier) @name) @definition.type
(type_alias_statement left: (type (identifier) @name)) @definition.type
(module (expression_statement (assignment left: (identifier) @name)) @definition.variable)
(class_definition body: (block (expression_statement (assignment left: (identifier) @name)) @definition.variable))
`,
  // Holds the decorators.
  wrappers: ["decorated_definition"],
  leading: [],
  testName: () => null,
  isDocstring,
  isCondition,
};
