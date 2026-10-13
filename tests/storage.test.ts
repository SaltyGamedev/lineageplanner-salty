import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { clearRoster, loadRoster, saveRoster } from "../src/state/storage";
import { sampleVeterans } from "./helpers";

describe("roster cache", () => {
  it("round-trips an import through IndexedDB and can be cleared", async () => {
    const veterans = sampleVeterans();
    expect(await saveRoster({ veterans, borrowed: [], warnings: [], importedAt: "2026-10-14T00:00:00Z", sourceName: "x.json" })).toBe(true);
    const back = await loadRoster();
    expect(back?.veterans.map((v) => v.trainedId)).toEqual(veterans.map((v) => v.trainedId));
    expect(back?.veterans[0].parents).toEqual(veterans[0].parents);
    await clearRoster();
    expect(await loadRoster()).toBeNull();
  });
});
