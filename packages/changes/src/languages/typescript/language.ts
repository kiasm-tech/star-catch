import { TEST_CASES, TOP_LEVEL_VARIABLES, cStyleCondition, literalTitle } from "../javascript/language.js";
import type { LanguageSpec } from "../spec.js";

/** For both grammars, typescript and tsx: JavaScript's declarations plus the type-level ones. */
export const typescript: LanguageSpec = {
  definitions: `
(function_declaration name: (identifier) @name) @definition.callable
(generator_function_declaration name: (identifier) @name) @definition.callable
(function_signature name: (identifier) @name) @definition.callable
(method_definition name: [(property_identifier) (private_property_identifier)] @name) @definition.callable
(method_signature name: (property_identifier) @name) @definition.callable
(abstract_method_signature name: (property_identifier) @name) @definition.callable
(class_declaration name: (type_identifier) @name) @definition.type
(abstract_class_declaration name: (type_identifier) @name) @definition.type
(interface_declaration name: (type_identifier) @name) @definition.type
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.type
(public_field_definition name: [(property_identifier) (private_property_identifier)] @name) @definition.variable
${TOP_LEVEL_VARIABLES}
${TEST_CASES}`,
  wrappers: ["export_statement"],
  leading: ["decorator"],
  testName: literalTitle,
  isCondition: cStyleCondition,
};
