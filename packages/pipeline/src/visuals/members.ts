/** What changed inside a contract's declaration, from the members analysis read off its syntax tree. */
import type { ChangeUnit, Member } from "@kiasm-tech/star-catch-contracts";
import { clip } from "./words.js";

export interface MemberChange {
  name: string;
  before: string | null;
  after: string | null;
  change: "added" | "removed" | "changed";
}

/** Which members were added, removed or changed type, in the new order, removed ones last. */
export function memberChanges(before: Member[] | null, after: Member[] | null): MemberChange[] {
  const old = new Map((before ?? []).map((m) => [m.name, m.type]));
  const now = new Map((after ?? []).map((m) => [m.name, m.type]));
  // A union alternative or an enum value has no type: it shows as itself.
  const show = (m: Member) => m.type || m.name;
  return [
    ...(after ?? []).flatMap((m): MemberChange[] => {
      if (!old.has(m.name)) return [{ name: m.name, before: null, after: show(m), change: "added" }];
      const was = old.get(m.name)!;
      return was === m.type ? [] : [{ name: m.name, before: was || m.name, after: show(m), change: "changed" }];
    }),
    ...(before ?? []).filter((m) => !now.has(m.name)).map((m): MemberChange => ({ name: m.name, before: show(m), after: null, change: "removed" })),
  ];
}

/** A contract item's change and, when analysis could read its shape, every member that changed. */
export function contractShape(u: Pick<ChangeUnit, "id" | "before" | "after" | "members">) {
  const change: MemberChange["change"] = u.before == null ? "added" : u.after == null ? "removed" : "changed";
  if (!u.members) return { change };
  const members = memberChanges(u.members.before, u.members.after).map((m) => ({
    id: `member:${u.id}:${m.name}`,
    name: clip(m.name, 80),
    before: m.before && clip(m.before, 160),
    after: m.after && clip(m.after, 160),
    change: m.change,
  }));
  return { change, members };
}
