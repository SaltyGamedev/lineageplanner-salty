import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS } from "../src/domain/config";
import { NO_CONSTRAINTS } from "../src/domain/optimizer";
import { clearRoster, exportPlanFile, loadRoster, parsePlanFile, saveRoster, type SavedPlan } from "../src/state/storage";
import { sampleVeterans } from "./helpers";

describe("roster cache", () => {
  it("round-trips an import through IndexedDB and can be cleared", async () => {
    const veterans = sampleVeterans();
    expect(await saveRoster({ veterans, warnings: [], importedAt: "2026-10-14T00:00:00Z", sourceName: "x.json" })).toBe(true);
    const back = await loadRoster();
    expect(back?.veterans.map((v) => v.trainedId)).toEqual(veterans.map((v) => v.trainedId));
    expect(back?.veterans[0].parents).toEqual(veterans[0].parents);
    await clearRoster();
    expect(await loadRoster()).toBeNull();
  });
});

describe("plan files", () => {
  const plan: SavedPlan = {
    id: "a1", name: "Test", savedAt: "2026-10-14T00:00:00Z", config: { ...DEFAULT_CONFIG, targetCardId: 100101 },
    weights: DEFAULT_WEIGHTS, constraints: NO_CONSTRAINTS, pair: [2292, 2471], scoreAtSave: 50, dataVersion: "1",
  };

  it("round-trips", () => {
    expect(parsePlanFile(exportPlanFile([plan]))).toEqual([plan]);
  });

  it("rejects other JSON and drops malformed plans", () => {
    expect(() => parsePlanFile("[]")).toThrow();
    const text = JSON.stringify({ kind: "lineageplanner-plan", version: 1, plans: [plan, { id: 3 }, { ...plan, id: "b", pair: [1] }] });
    expect(parsePlanFile(text).map((p) => p.id)).toEqual(["a1"]);
  });
});
