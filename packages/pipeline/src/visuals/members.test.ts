import { describe, expect, it } from "vitest";
import { contractShape, memberChanges } from "./members.js";

describe("memberChanges", () => {
  it("lists added, changed and removed members, unchanged ones left out", () => {
    const before = [{ name: "next", type: "Date" }, { name: "open", type: "boolean" }, { name: "note", type: "string" }];
    const after = [{ name: "next", type: "LocalTime" }, { name: "open", type: "boolean" }, { name: "zone", type: "string" }];
    expect(memberChanges(before, after)).toEqual([
      { name: "next", before: "Date", after: "LocalTime", change: "changed" },
      { name: "zone", before: null, after: "string", change: "added" },
      { name: "note", before: "string", after: null, change: "removed" },
    ]);
  });

  it("treats everything in a new declaration as added, a union alternative as itself", () => {
    expect(memberChanges(null, [{ name: '"mon"', type: "" }])).toEqual([{ name: '"mon"', before: null, after: '"mon"', change: "added" }]);
  });
});

describe("contractShape", () => {
  const unit = { id: "src/a.ts#Status", before: "interface Status {}", after: "interface Status {}" };

  it("lists every member that changed inside the declaration, however many", () => {
    const after = Array.from({ length: 12 }, (_, i) => ({ name: `f${i}`, type: "string" }));
    const shape = contractShape({ ...unit, before: undefined, members: { before: null, after } });
    expect(shape.change).toBe("added");
    expect(shape.members).toHaveLength(12);
    expect(shape.members![0]).toEqual({ id: "member:src/a.ts#Status:f0", name: "f0", before: null, after: "string", change: "added" });
  });

  it("says only how the declaration changed when analysis couldn't read its shape", () => {
    expect(contractShape(unit)).toEqual({ change: "changed" });
  });
});
