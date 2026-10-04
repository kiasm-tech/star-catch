import { lineAt, numbered, type Section } from "./sections.js";

interface Statement {
  text: string;
  start: number;
  end: number;
}

type Piece = { kind: "code" | "quoted" | "comment"; text: string; start: number };

/** Code, quoted text (strings, quoted identifiers, `$tag$` bodies) and comments, in order. */
function scan(sql: string): Piece[] {
  const pieces: Piece[] = [];
  let code = 0;
  const flush = (to: number) => {
    if (to > code) pieces.push({ kind: "code", text: sql.slice(code, to), start: code });
  };
  const take = (kind: Piece["kind"], from: number, to: number) => {
    flush(from);
    pieces.push({ kind, text: sql.slice(from, to), start: from });
    code = to;
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      const eol = sql.indexOf("\n", i);
      take("comment", i, eol < 0 ? sql.length : eol);
      i = code;
    } else if (c === "/" && sql[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.startsWith("/*", j)) {
          depth++;
          j += 2;
        } else if (sql.startsWith("*/", j)) {
          depth--;
          j += 2;
        } else j++;
      }
      take("comment", i, j);
      i = j;
    } else if (c === "'" || c === '"' || c === "`") {
      // A doubled quote is an escaped one.
      let j = i + 1;
      while (j < sql.length && !(sql[j] === c && sql[j + 1] !== c)) j += sql[j] === c ? 2 : 1;
      take("quoted", i, Math.min(j + 1, sql.length));
      i = code;
    } else if (c === "$" && /^\$[A-Za-z_]*\$/.test(sql.slice(i, i + 64))) {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64))![0];
      const close = sql.indexOf(tag, i + tag.length);
      take("quoted", i, close < 0 ? sql.length : close + tag.length);
      i = code;
    } else i++;
  }
  flush(sql.length);
  return pieces;
}

/** Statements split on `;` outside quotes, comments and dollar-quoted bodies (`$fn$ … $fn$`). */
export function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = sql.slice(start, end);
    if (normalise(raw) === "") return;
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    statements.push({ text, start: start + lead, end: start + lead + text.length });
  };
  for (const piece of scan(sql)) {
    if (piece.kind !== "code") continue;
    for (let at = piece.text.indexOf(";"); at >= 0; at = piece.text.indexOf(";", at + 1)) {
      push(piece.start + at + 1);
      start = piece.start + at + 1;
    }
  }
  push(sql.length);
  return statements;
}

/** Without comments, with runs of whitespace outside quotes as one space: what a statement means. */
export function normalise(statement: string): string {
  let out = "";
  for (const piece of scan(statement)) {
    if (piece.kind === "quoted") {
      out += piece.text;
      continue;
    }
    const text = piece.kind === "comment" ? " " : piece.text.replace(/\s+/g, " ");
    out += out.endsWith(" ") && text.startsWith(" ") ? text.slice(1) : text;
  }
  return out.replace(/\s*;\s*$/, "").trim();
}

const IDENTIFIER = String.raw`("[^"]+"|` + "`[^`]+`" + String.raw`|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\.("[^"]+"|` + "`[^`]+`" + String.raw`|\[[^\]]+\]|[A-Za-z_][\w$]*))?`;

/** Unquoted identifiers fold to lowercase, as SQL does; quoted ones keep their case. */
function identifier(match: string): string {
  return match
    .split(".")
    .map((part) => (/^["`[]/.test(part) ? part.slice(1, -1) : part.toLowerCase()))
    .join(".");
}

const RULES: [RegExp, (m: RegExpExecArray) => string][] = [
  [
    new RegExp(String.raw`^ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(${IDENTIFIER}) (?:ADD|DROP|ALTER|RENAME)(?: COLUMN)?(?: IF (?:NOT )?EXISTS)? (${IDENTIFIER})`, "i"),
    (m) => {
      const column = identifier(m[4]);
      const keyword = column.toUpperCase();
      return ["CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN", "CHECK", "INDEX", "TO"].includes(keyword)
        ? identifier(m[1])
        : `${identifier(m[1])}.${column}`;
    },
  ],
  [new RegExp(String.raw`^(?:CREATE|ALTER|DROP) TABLE (?:IF (?:NOT )?EXISTS )?(${IDENTIFIER})`, "i"), (m) => identifier(m[1])],
  [
    new RegExp(String.raw`^CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?(${IDENTIFIER}) ON (?:ONLY )?(${IDENTIFIER})`, "i"),
    (m) => `${identifier(m[4])}.${identifier(m[1])}`,
  ],
  [
    new RegExp(String.raw`^(?:CREATE (?:OR REPLACE )?|DROP |ALTER )(?:MATERIALIZED )?(?:VIEW|FUNCTION|PROCEDURE|TYPE|SEQUENCE|TRIGGER|INDEX|SCHEMA|EXTENSION) (?:IF (?:NOT )?EXISTS )?(${IDENTIFIER})`, "i"),
    (m) => identifier(m[1]),
  ],
  [new RegExp(String.raw`^(?:INSERT INTO|UPDATE|DELETE FROM) (?:ONLY )?(${IDENTIFIER})`, "i"), (m) => identifier(m[1])],
];

/** One section per statement, named by the table, column or object it touches (changes.md §5.6). */
export function sqlSections(sql: string): Section[] {
  return numbered(
    splitStatements(sql).map((statement, i) => {
      const value = normalise(statement.text);
      const rule = RULES.map(([pattern, name]) => {
        const match = pattern.exec(value);
        return match ? name(match) : null;
      }).find((name) => name !== null);
      return {
        name: rule ?? `statement ${i + 1}`,
        unitKind: "schemaEntity" as const,
        value,
        text: statement.text,
        lines: [lineAt(sql, statement.start), lineAt(sql, statement.end)] as [number, number],
      };
    }),
  );
}
