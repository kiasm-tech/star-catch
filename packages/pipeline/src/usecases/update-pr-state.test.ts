import type { CatchVersion } from "@kiasm-tech/star-catch-contracts";
import { loadSyntheticFixtures } from "@star-catch/testkit";
import { beforeAll, describe, expect, it } from "vitest";
import { mockClassifier } from "../classifier.js";
import type { CatchStore, StoredVersion } from "../ports/catch-store.js";
import { templateWriter } from "../script/template-writer.js";
import { buildCatch } from "./build-catch.js";
import { updatePrState } from "./update-pr-state.js";

let open: CatchVersion;

beforeAll(async () => {
  for (const fixture of loadSyntheticFixtures().filter((f) => f.snapshot.state === "open")) {
    open = await buildCatch(fixture.snapshot, { classifier: mockClassifier, writer: templateWriter });
    if (open.technical?.draft.length) return;
  }
  throw new Error("no open fixture with a draft appendix");
});

function store(initial: StoredVersion | null) {
  const saved: { version: CatchVersion; headSha: string }[] = [];
  const catches: CatchStore = {
    save: async (version, headSha) => void saved.push({ version, headSha }),
    edit: async () => true,
    latest: async () => initial,
    list: async () => [],
  };
  return { catches, saved };
}

const job = () => ({ fullName: open.pr.fullName, number: open.pr.number, state: "merged", at: "2026-10-07T10:00:00Z" });

describe("updatePrState", () => {
  it("marks the latest catch merged, under the same head commit, without its draft appendix", async () => {
    expect(open.technical!.draft.length).toBeGreaterThan(0);
    const { catches, saved } = store({ headSha: "abc1234", generatedAt: new Date(), version: open });
    expect(await updatePrState({ catches }, job())).toBe("updated");
    const [{ version, headSha }] = saved as [{ version: CatchVersion; headSha: string }];
    expect(headSha).toBe("abc1234");
    expect(version.pr).toMatchObject({ state: "merged", updatedAt: "2026-10-07T10:00:00Z" });
    expect(version.technical!.draft).toEqual([]);
    expect(version.technical!.chapters).toEqual(open.technical!.chapters);
  });

  it("does nothing for a PR with no catch, or a malformed job", async () => {
    const { catches, saved } = store(null);
    expect(await updatePrState({ catches }, job())).toBe("no-catch");
    expect(await updatePrState({ catches }, { fullName: "nope" })).toBe("invalid");
    expect(saved).toEqual([]);
  });
});
