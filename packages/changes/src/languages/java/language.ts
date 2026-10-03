import { cStyleCondition } from "../javascript/language.js";
import type { LanguageSpec } from "../spec.js";

/** Annotations live inside a declaration's `modifiers`, so nothing wraps or precedes it. */
export const java: LanguageSpec = {
  definitions: `
(class_declaration name: (identifier) @name) @definition.type
(interface_declaration name: (identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.type
(record_declaration name: (identifier) @name) @definition.type
(annotation_type_declaration name: (identifier) @name) @definition.type
(method_declaration name: (identifier) @name) @definition.callable
(constructor_declaration name: (identifier) @name) @definition.callable
(compact_constructor_declaration name: (identifier) @name) @definition.callable
(annotation_type_element_declaration name: (identifier) @name) @definition.callable
(field_declaration declarator: (variable_declarator name: (identifier) @name)) @definition.variable
`,
  wrappers: [],
  leading: [],
  testName: () => null,
  // A case value sits in a switch_label.
  isCondition: (node) => cStyleCondition(node) || node.type === "switch_label",
};
