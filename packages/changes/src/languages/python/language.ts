import type { LanguageSpec } from "../spec.js";

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
};
