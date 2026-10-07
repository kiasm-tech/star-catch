import { MAX_UNIT_MEMBERS, type Member } from "@kiasm-tech/star-catch-contracts";
import type { Node } from "web-tree-sitter";

/** The node types each grammar uses for the same idea; one walker reads them all. */
const FUNCTION_VALUES = new Set(["arrow_function", "function_expression", "function", "generator_function"]);
const OBJECT_BODIES = new Set(["interface_body", "object_type", "class_body", "block", "enum_body"]);
const METHODS = new Set(["method_signature", "method_definition", "abstract_method_signature", "method_declaration", "function_definition"]);
const CONSTRUCTORS = new Set(["constructor", "__init__"]);

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
/** A type annotation's text without its leading colon. */
const typeOf = (node: Node | null) => (node ? squash(node.text.replace(/^:\s*/, "")) : "");

/** Private to its declaration: `private`, `#x`, Python's leading underscore. */
function isPrivate(node: Node, name: string): boolean {
  if (name.startsWith("#") || (name.startsWith("_") && !name.startsWith("__"))) return true;
  return node.namedChildren.some((c) => c !== null && ["accessibility_modifier", "modifiers"].includes(c.type) && /\bprivate\b/.test(c.text));
}

function parameter(node: Node): Member | null {
  switch (node.type) {
    // TypeScript
    case "required_parameter":
    case "optional_parameter": {
      const pattern = node.childForFieldName("pattern");
      if (!pattern || pattern.type === "this") return null;
      const name = pattern.type === "identifier" || pattern.type === "rest_pattern" ? pattern.text : "options";
      return { name: name + (node.type === "optional_parameter" ? "?" : ""), type: typeOf(node.childForFieldName("type")) };
    }
    // JavaScript
    case "identifier":
      return ["self", "cls"].includes(node.text) ? null : { name: node.text, type: "" };
    case "assignment_pattern":
      return parameter(node.childForFieldName("left")!);
    case "rest_pattern":
      return { name: node.text, type: "" };
    case "object_pattern":
    case "array_pattern":
      return { name: "options", type: "" };
    // Python
    case "typed_parameter":
    case "typed_default_parameter":
    case "default_parameter": {
      const name = node.childForFieldName("name") ?? node.namedChildren.find((c) => c !== null && c.type !== "type") ?? null;
      if (!name || ["self", "cls"].includes(name.text)) return null;
      return { name: name.text, type: typeOf(node.childForFieldName("type")) };
    }
    case "list_splat_pattern":
    case "dictionary_splat_pattern":
      return { name: node.text, type: "" };
    // Java
    case "formal_parameter":
    case "spread_parameter": {
      const name = node.childForFieldName("name") ?? node.namedChildren.at(-1) ?? null;
      return name ? { name: name.text, type: typeOf(node.childForFieldName("type")) } : null;
    }
    default:
      return null;
  }
}

/** A function's parameters, then what it returns. */
function signature(node: Node): Member[] {
  const list = node.childForFieldName("parameters");
  const members = (list?.namedChildren ?? []).flatMap((p) => (p ? (parameter(p) ?? []) : []));
  // TypeScript and Python name it `return_type`; Java's method has its return type as `type`.
  const returns = node.childForFieldName("return_type") ?? (node.type === "method_declaration" ? node.childForFieldName("type") : null);
  return returns ? [...members, { name: "returns", type: typeOf(returns) }] : members;
}

/** One entry of an object type, class, interface or enum body; null for what isn't part of its shape. */
function bodyMember(node: Node): Member[] {
  // Python wraps decorated methods, and annotated fields sit in expression statements.
  if (node.type === "decorated_definition") return bodyMember(node.childForFieldName("definition")!);
  if (node.type === "expression_statement") {
    const assignment = node.namedChildren[0];
    const type = assignment?.childForFieldName("type");
    const left = assignment?.childForFieldName("left");
    return assignment?.type === "assignment" && type && left && !isPrivate(left, left.text) ? [{ name: left.text, type: typeOf(type) }] : [];
  }
  if (METHODS.has(node.type)) {
    const name = node.childForFieldName("name")?.text ?? "";
    if (!name || CONSTRUCTORS.has(name) || isPrivate(node, name)) return [];
    const returns = signature(node).find((m) => m.name === "returns");
    return [{ name: `${name}()`, type: returns?.type ?? "" }];
  }
  switch (node.type) {
    case "property_signature":
    case "public_field_definition": {
      const name = node.childForFieldName("name")?.text ?? "";
      if (!name || isPrivate(node, name)) return [];
      const optional = node.children.some((c) => c?.type === "?");
      return [{ name: name + (optional ? "?" : ""), type: typeOf(node.childForFieldName("type")) }];
    }
    case "field_declaration": {
      const type = typeOf(node.childForFieldName("type"));
      return node.childrenForFieldName("declarator").flatMap((d) => {
        const name = d?.childForFieldName("name")?.text;
        return name && !isPrivate(node, name) ? [{ name, type }] : [];
      });
    }
    case "enum_assignment":
      return [{ name: node.childForFieldName("name")?.text ?? node.text, type: "" }];
    case "property_identifier":
    case "enum_constant":
      return [{ name: (node.childForFieldName("name") ?? node).text, type: "" }];
    default:
      return [];
  }
}

/** A union's alternatives, flattened: `A | B | C`. */
function alternatives(node: Node): Member[] {
  return node.namedChildren.flatMap((c) => (!c ? [] : c.type === "union_type" ? alternatives(c) : [{ name: squash(c.text), type: "" }]));
}

function shapeOf(node: Node): Member[] | null {
  if (node.childForFieldName("parameters") && node.type !== "record_declaration") return signature(node);
  // `const total = (items) => …`: the function in the declarator.
  for (const declarator of node.namedChildren) {
    const value = declarator?.type === "variable_declarator" ? declarator.childForFieldName("value") : null;
    if (value && FUNCTION_VALUES.has(value.type)) return signature(value);
  }
  if (node.type === "record_declaration") {
    const fields = (node.childForFieldName("parameters")?.namedChildren ?? []).flatMap((p) => (p ? (parameter(p) ?? []) : []));
    const body = node.childForFieldName("body");
    return [...fields, ...(body?.namedChildren ?? []).flatMap((c) => (c ? bodyMember(c) : []))];
  }
  if (node.type === "type_alias_declaration") {
    const value = node.childForFieldName("value");
    if (value?.type === "object_type") return value.namedChildren.flatMap((c) => (c ? bodyMember(c) : []));
    if (value?.type === "union_type") return alternatives(value);
    return null;
  }
  const body = node.childForFieldName("body");
  if (body && OBJECT_BODIES.has(body.type)) return body.namedChildren.flatMap((c) => (c ? bodyMember(c) : []));
  return null;
}

/**
 * A declaration's shape from its syntax node (changes.md §5.4): a function's parameters and what
 * it returns; an interface's, object type's, class's or record's public fields and methods; a
 * union's alternatives; an enum's values. Null when it has none to read: a constant, a test.
 */
export function membersOf(node: Node): Member[] | null {
  const members = shapeOf(node);
  return members && members.slice(0, MAX_UNIT_MEMBERS);
}
