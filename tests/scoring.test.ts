import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS, distanceCategory, targetContext } from "../src/domain/config";
import { createScoringContext, evaluateLineage } from "../src/domain/scoring";
import type { PlannerConfig, Veteran } from "../src/domain/types";
import { realData, sampleVeterans } from "./helpers";

const cfg: PlannerConfig = { ...DEFAULT_CONFIG, targetCardId: 100101, style: "sashi", distance: "middle", surface: "turf" };
const pick = (vets: Veteran[], id: number) => vets.find((v) => v.trainedId === id)!;

describe("scoring", () => {
  it("produces a breakdown with evidence labels and a 0..100 total", () => {
    const vets = sampleVeterans();
    const sc = createScoringContext(realData(), cfg, DEFAULT_WEIGHTS);
    const ev = evaluateLineage(sc, pick(vets, 2292), pick(vets, 2471));
    expect(ev.total).toBeGreaterThan(0);
    expect(ev.total).toBeLessThanOrEqual(100);
    expect(ev.components.map((c) => c.evidence)).toEqual(["approximation", "approximation", "approximation", "approximation"]);
  });

  it("does not double count skill variants of the same group", () => {
    const vets = sampleVeterans();
    const sc = createScoringContext(realData(), cfg, DEFAULT_WEIGHTS);
    const ev = evaluateLineage(sc, pick(vets, 2292), pick(vets, 2471));
    const groups = ev.skills.map((s) => s.skill.groupId);
    expect(new Set(groups).size).toBe(groups.length);
    // 2001501 (2292) and 2001502 (its parent) and 2001501 (2471's parent) are one group
    const g = ev.skills.find((s) => s.sources.some((x) => x.factorName && x.slot === "p1"))!;
    expect(g).toBeTruthy();
  });

  it("gives grandparents their own, lower affinity and chance", () => {
    const vets = sampleVeterans();
    const ev = evaluateLineage(createScoringContext(realData(), cfg, DEFAULT_WEIGHTS), pick(vets, 2292), pick(vets, 2471));
    const sources = ev.stats.flatMap((s) => s.sources);
    const parent = sources.find((x) => x.role === "parent" && x.stars === 3) ?? sources.find((x) => x.role === "parent")!;
    const gp = sources.find((x) => x.role === "grandparent" && x.stars === parent.stars);
    if (gp) expect(parent.chance).toBeGreaterThanOrEqual(gp.chance);
    for (const s of ev.skills) {
      expect(s.chance).toBeGreaterThan(0);
      expect(s.chance).toBeLessThanOrEqual(1);
    }
  });

  it("values skills by the tier list and boosts Champions Meeting skills", () => {
    const d = realData();
    const vets = sampleVeterans();
    const cm = d.extras.championsMeetings[0];
    const withCm = { ...cfg, cmId: cm.id, courseId: [...d.courses.values()].find((c) => c.trackId === cm.trackId && c.distance === cm.distance && c.ground === cm.ground)!.id, season: cm.season, weather: cm.weather };
    const a = evaluateLineage(createScoringContext(d, withCm, DEFAULT_WEIGHTS), pick(vets, 2292), pick(vets, 2471));
    for (const s of a.skills.filter((x) => x.cmBoost)) expect(s.relevance.relevance).toBe("match");
    const off = evaluateLineage(createScoringContext(d, cfg, { ...DEFAULT_WEIGHTS, tierList: false }), pick(vets, 2292), pick(vets, 2471));
    for (const s of off.skills) expect([0, 1, DEFAULT_WEIGHTS.genericSkill]).toContain(s.baseValue);
  });

  it("drops the aptitude component when the target needs nothing", () => {
    const vets = sampleVeterans();
    const sc = createScoringContext(realData(), cfg, { ...DEFAULT_WEIGHTS, aptitudeAlreadyA: 0 });
    // Special Week is A on turf, A on medium, A as Late Surger
    const ev = evaluateLineage(sc, pick(vets, 2292), pick(vets, 2471));
    expect(ev.components.find((c) => c.key === "aptitudeSparks")!.score).toBeNull();
  });

  it("degrades gracefully with missing data", () => {
    const vets = sampleVeterans();
    const broken: Veteran = { ...pick(vets, 2292), factorIds: [99999999], parents: [null, null] };
    const sc = createScoringContext(realData(), cfg, DEFAULT_WEIGHTS);
    const ev = evaluateLineage(sc, broken, pick(vets, 2471));
    expect(ev.warnings.join(" ")).toMatch(/unknown/);
    expect(ev.compat.complete).toBe(false);
    expect(Number.isFinite(ev.total)).toBe(true);
  });

  it("rejects an unknown target", () => {
    expect(() => createScoringContext(realData(), { ...cfg, targetCardId: 1 }, DEFAULT_WEIGHTS)).toThrow();
  });

  it("maps metres to distance categories and basis distance", () => {
    expect(distanceCategory(1400)).toBe("short");
    expect(distanceCategory(1600)).toBe("mile");
    expect(distanceCategory(2400)).toBe("middle");
    expect(distanceCategory(2500)).toBe("long");
    const ctx = targetContext({ ...cfg, distanceMeters: 2400 }, realData());
    expect(ctx.is_basis_distance).toBe(1);
  });

  it("lets a chosen course override distance and surface", () => {
    const d = realData();
    const course = [...d.courses.values()].find((c) => c.ground === 2 && c.distance === 1600)!;
    const ctx = targetContext({ ...cfg, courseId: course.id }, d);
    expect(ctx.ground_type).toBe(2);
    expect(ctx.distance_type).toBe(2);
    expect(ctx.track_id).toBe(course.trackId);
  });
});
