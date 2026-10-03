import { describe, expect, it } from "vitest";
import { markdownSections } from "./markdown.js";
import { compareSections } from "./sections.js";
import { normalise, splitStatements, sqlSections } from "./sql.js";

const fields = { file: "f", language: "sql", refactorings: [], component: "db", fileClass: "schema" as const, references: [] };
const summary = (base: string, head: string, read: typeof sqlSections) =>
  compareSections("f", read(base), read(head), fields).map((u) => `${u.name} ${u.verdict} ${u.changeType}`);

describe("splitStatements", () => {
  it("splits on semicolons outside quotes, comments and dollar-quoted bodies", () => {
    const sql = `INSERT INTO t VALUES ('a;b', "c;d");
-- a comment; still a comment
/* block; /* nested; */ still */ UPDATE t SET x = 1;
CREATE FUNCTION f() RETURNS int AS $body$ SELECT 1; SELECT 2; $body$ LANGUAGE sql;
SELECT 'it''s; fine'`;
    expect(splitStatements(sql).map((s) => normalise(s.text))).toEqual([
      "INSERT INTO t VALUES ('a;b', \"c;d\")",
      "UPDATE t SET x = 1",
      "CREATE FUNCTION f() RETURNS int AS $body$ SELECT 1; SELECT 2; $body$ LANGUAGE sql",
      "SELECT 'it''s; fine'",
    ]);
  });

  it("keeps quoted text as written when normalising", () => {
    expect(normalise("SELECT  'a -- b'   -- note\n , 1;")).toBe("SELECT 'a -- b' , 1");
    expect(normalise("SELECT 'a -- b'")).not.toBe(normalise("SELECT 'a -- c'"));
  });
});

describe("sqlSections", () => {
  it.each([
    ["ALTER TABLE orders ADD COLUMN gift_note TEXT;", "orders.gift_note"],
    ["alter table public.Orders add if not exists note text;", "public.orders.note"],
    ['ALTER TABLE "Orders" DROP COLUMN "Note";', "Orders.Note"],
    ["ALTER TABLE orders RENAME COLUMN note TO memo;", "orders.note"],
    ["ALTER TABLE orders ADD CONSTRAINT positive CHECK (total > 0);", "orders"],
    ["CREATE TABLE IF NOT EXISTS orders (id int);", "orders"],
    ["DROP TABLE orders;", "orders"],
    ["CREATE UNIQUE INDEX CONCURRENTLY orders_email ON orders (email);", "orders.orders_email"],
    ["CREATE OR REPLACE VIEW open_orders AS SELECT 1;", "open_orders"],
    ["INSERT INTO countries VALUES ('NL');", "countries"],
    ["GRANT SELECT ON orders TO reader;", "statement 1"],
  ])("names %s %s", (sql, name) => {
    expect(sqlSections(sql).map((s) => s.name)).toEqual([name]);
  });

  it("numbers repeated names and records line spans", () => {
    const sections = sqlSections("INSERT INTO t VALUES (1);\n\nINSERT INTO t\nVALUES (2);\n");
    expect(sections.map((s) => [s.name, s.lines])).toEqual([["t", [1, 1]], ["t (2)", [3, 4]]]);
  });

  it("compares statements: added, changed, reformatted, removed", () => {
    const base = "CREATE TABLE a (id int);\nALTER TABLE a ADD COLUMN x int;\nDROP TABLE old;\n";
    const head = "CREATE   TABLE a (id int); -- reformatted\nALTER TABLE a ADD COLUMN x bigint;\nALTER TABLE a ADD COLUMN y int;\n";
    expect(summary(base, head, sqlSections)).toEqual([
      "a notAChange bodyChanged",
      "a.x behavioural bodyChanged",
      "a.y behavioural added",
      "old behavioural removed",
    ]);
  });
});

describe("markdownSections", () => {
  const README = `---
title: Shop
---
Intro text.

# Install

Run it.

## macOS
\`\`\`sh
# not a heading
brew install shop
\`\`\`

Usage
-----
Call \`shop\`.

## macOS
Twice.
`;

  it("names sections by heading path, skipping fences and front matter", () => {
    expect(markdownSections(README).map((s) => [s.name, s.lines])).toEqual([
      ["(intro)", [1, 4]],
      ["Install", [6, 8]],
      ["Install > macOS", [10, 14]],
      // A "-----" underline is level 2: under Install, like the second "## macOS".
      ["Install > Usage", [16, 18]],
      ["Install > macOS (2)", [20, 21]],
    ]);
  });

  it("reads a \"=====\" underline as level 1", () => {
    expect(markdownSections("# A\ntext\n\nB\n===\nmore\n").map((s) => s.name)).toEqual(["A", "B"]);
  });

  it("calls rewrapped whitespace notAChange and a new sentence behavioural", () => {
    const base = "# Install\nRun   it.\n\n# Usage\nCall it.\n";
    const head = "# Install\n  Run it.\n\n# Usage\nCall it.\nThen wait.\n";
    expect(summary(base, head, markdownSections)).toEqual(["Install notAChange bodyChanged", "Usage behavioural bodyChanged"]);
  });
});
