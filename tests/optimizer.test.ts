import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS } from "../src/domain/config";
import { alternativesForSlot, optimize } from "../src/domain/optimizer";
import { createScoringContext, evaluateLineage } from "../src/domain/scoring";
import type { PlannerConfig } from "../src/domain/types";
import { realData, sampleVeterans } from "./helpers";

// Target: Special Week [Special Dreamer], Late Surger, Medium turf.
const cfg: PlannerConfig = { ...DEFAULT_CONFIG, targetCardId: 100101, style: "sashi", distance: "middle", surface: "turf" };

describe("optimizer", () => {
  it("scores every valid pair and reports rule exclusions", () => {
    const res = optimize(realData(), sampleVeterans(), cfg, DEFAULT_WEIGHTS);
    // 4 standard veterans (3869 has use_type 1) → 6 pairs, minus 2653+2667 (same character)
    expect(res.stats.candidates).toBe(4);
    expect(res.stats.pairsEvaluated).toBe(5);
    expect(res.stats.byReason["Both parents are the same character (game rule)"]).toBe(1);
    expect(res.stats.byReason["Non-standard entry (use_type ≠ 0, possibly borrowed)"]).toBe(1);
    for (const r of res.ranked) expect(r.p1.charaId).not.toBe(r.p2.charaId);
  });

  it("is sorted by total score, descending", () => {
    const { ranked } = optimize(realData(), sampleVeterans(), cfg, DEFAULT_WEIGHTS);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].total).toBeGreaterThanOrEqual(ranked[i].total);
  });

  it("is deterministic", () => {
    const a = optimize(realData(), sampleVeterans(), cfg, DEFAULT_WEIGHTS).ranked.map((r) => [r.p1.trainedId, r.p2.trainedId]);
    const b = optimize(realData(), sampleVeterans(), cfg, DEFAULT_WEIGHTS).ranked.map((r) => [r.p1.trainedId, r.p2.trainedId]);
    expect(a).toEqual(b);
  });

  it("never uses a veteran of the trainee's own character", () => {
    const res = optimize(realData(), sampleVeterans(), { ...cfg, targetCardId: 101601 }, DEFAULT_WEIGHTS);
    expect(res.stats.byReason["Same character as the trainee (game rule)"]).toBe(2);
    for (const r of res.ranked) expect([r.p1.charaId, r.p2.charaId]).not.toContain(1016);
  });

  it("honours locks and exclusions (restricted roster)", () => {
    const locked = optimize(realData(), sampleVeterans(), cfg, DEFAULT_WEIGHTS, { locked: [2471], excluded: [], excludedCharas: [] });
    expect(locked.ranked.length).toBeGreaterThan(0);
    for (const r of locked.ranked) expect([r.p1.trainedId, r.p2.trainedId]).toContain(2471);

    const excluded = optimize(realData(), sampleVeterans(), cfg, DEFAULT_WEIGHTS, { locked: [], excluded: [2292, 2471], excludedCharas: [] });
    expect(excluded.ranked).toHaveLength(0);
    expect(excluded.stats.byReason["Excluded by you"]).toBe(2);
  });

  it("can include non-standard entries when asked", () => {
    const res = optimize(realData(), sampleVeterans(), { ...cfg, includeNonStandardVeterans: true }, DEFAULT_WEIGHTS);
    expect(res.stats.candidates).toBe(5);
  });

  it("lists alternatives for a slot with the other parent fixed", () => {
    const vets = sampleVeterans();
    const sc = createScoringContext(realData(), cfg, DEFAULT_WEIGHTS);
    const fixed = vets.find((v) => v.trainedId === 2292)!;
    const replacing = vets.find((v) => v.trainedId === 2471)!;
    const alts = alternativesForSlot(sc, vets, fixed, replacing, { locked: [], excluded: [], excludedCharas: [] });
    expect(alts.map((a) => a.p2.trainedId).sort()).toEqual([2653, 2667]);
    expect(evaluateLineage(sc, fixed, replacing).total).toBeGreaterThan(0);
  });
});
