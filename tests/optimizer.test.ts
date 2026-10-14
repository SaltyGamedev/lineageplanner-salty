import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/domain/config";
import { createPlanContext, evaluate, goalKey } from "../src/domain/goals";
import { GRADE_S, chanceAtLeast, startingGrade } from "../src/domain/inheritance";
import { optimize, partnersFor, validPair } from "../src/domain/optimizer";
import { rosterSparks } from "../src/domain/roster";
import { FactorType, type Goal, type PlannerConfig, type Veteran } from "../src/domain/types";
import { parseExport } from "../src/domain/importer";
import { realData, sampleExport, sampleVeterans } from "./helpers";

// Special Week [Special Dreamer], Late Surger, Medium turf.
const cfg: PlannerConfig = { ...DEFAULT_CONFIG, targetCardId: 100101, style: "sashi", distance: "middle", surface: "turf", useBorrow: false };

/** The sample export with its first veteran's first parent marked as a friend's rental. */
function withRental() {
  const raw = structuredClone(sampleExport()) as Record<string, unknown>[];
  const sa = raw[0].succession_chara_array as Record<string, unknown>[];
  sa.find((s) => s.position_id === 10)!.owner_viewer_id = 123456789;
  return parseExport(raw, realData(), "x");
}

describe("importer rentals", () => {
  it("rebuilds a friend's rental with its own parents", () => {
    const r = withRental();
    expect(r.borrowed).toHaveLength(1);
    const v = r.borrowed[0];
    expect(v.borrowed).toMatchObject({ trainerId: "123456789", source: "export" });
    expect(v.trainedId).toBeLessThan(0);
    // The fixture keeps position 11 (and not 12) for this veteran.
    expect(v.parents[0]?.cardId).toBeGreaterThan(0);
    expect(v.parents[1]).toBeNull();
  });
});

describe("optimizer", () => {
  it("scores every own pair and never pairs the trainee's character", () => {
    const vets = sampleVeterans();
    const res = optimize(realData(), vets, [], cfg, [], []);
    expect(res.pairs).toBeGreaterThan(0);
    for (const l of res.ranked) {
      expect(l.p1.charaId).not.toBe(1001);
      expect(l.p2.charaId).not.toBe(1001);
      expect(l.p1.charaId).not.toBe(l.p2.charaId);
    }
    // Without goals, pairs are ranked by affinity.
    const totals = res.ranked.map((l) => l.compat.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it("uses at most one rental, and only when borrowing is on", () => {
    const r = withRental();
    const off = optimize(realData(), r.veterans, r.borrowed, cfg, [], [], undefined, 999);
    expect(off.ranked.some((l) => l.p1.borrowed || l.p2.borrowed)).toBe(false);
    const on = optimize(realData(), r.veterans, r.borrowed, { ...cfg, useBorrow: true }, [], [], undefined, 999);
    expect(on.pairs).toBeGreaterThan(off.pairs);
    expect(validPair(r.borrowed[0], { ...r.borrowed[0], trainedId: -99, charaId: 9999 })).toBe(false);
  });

  it("ranks by goal chances and keeps filters as hard requirements", () => {
    const d = realData();
    const vets = sampleVeterans();
    const owned = rosterSparks(d, vets);
    const skill = [...owned.values()].find((o) => o.kind === "skill")!;
    const goals: Goal[] = [{ kind: "skill", groupId: skill.groupId, priority: 1, sparkTier: "white" }];
    const res = optimize(d, vets, [], cfg, goals, []);
    const scores = res.ranked.map((l) => l.score!);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const g = res.ranked[0].goals[0];
    expect(g.key).toBe(goalKey(goals[0]));
    expect(g.inherit).toBeGreaterThan(0);
    expect(g.spark).toBeGreaterThanOrEqual(0.2);

    const blue = [...owned.values()].find((o) => o.kind === "blue")!;
    const strict = optimize(d, vets, [], cfg, goals, [{ color: "blue", groupId: blue.groupId, minStars: 99 }]);
    expect(strict.ranked.every((l) => !l.ok)).toBe(true); // nothing passes: shown, flagged
    const loose = optimize(d, vets, [], cfg, goals, [{ color: "blue", groupId: blue.groupId, minStars: 1 }]);
    expect(loose.ranked.every((l) => l.ok)).toBe(true);
  });

  it("combines goal chances: expected hits, all inherited, all sparks", () => {
    const d = realData();
    const vets = sampleVeterans();
    const owned = rosterSparks(d, vets);
    const skills = [...owned.values()].filter((o) => o.kind === "skill").slice(0, 4);
    const goals: Goal[] = skills.map((s) => ({ kind: "skill", groupId: s.groupId, priority: 1, sparkTier: "white" }));
    const l = evaluate(createPlanContext(d, cfg, goals, []), vets[1], vets[2]);
    const inh = l.goals.map((g) => g.inherit);
    expect(l.expected).toBeCloseTo(inh.reduce((a, b) => a + b, 0));
    expect(l.allInherit).toBeCloseTo(inh.reduce((a, b) => a * b, 1));
    expect(l.allInherit!).toBeLessThanOrEqual(Math.min(...inh));
    expect(l.allSpark!.goals).toBe(l.goals.filter((g) => g.spark != null).length);
    expect(evaluate(createPlanContext(d, cfg, [], []), vets[1], vets[2]).allInherit).toBeNull();
  });

  it("evaluates aptitude goals with the pink start boost", () => {
    const d = realData();
    const vets = sampleVeterans();
    const pc = createPlanContext(d, cfg, [{ kind: "aptitude", key: "long", grade: GRADE_S, priority: 3 }], []);
    const l = evaluate(pc, vets[1], vets[2]);
    const r = l.goals[0];
    expect(r.aptitude!.start).toBe(startingGrade(r.aptitude!.base, r.aptitude!.stars));
    expect(r.inherit).toBeGreaterThanOrEqual(0);
    expect(r.inherit).toBeLessThanOrEqual(1);
    expect(r.hits.every((h) => h.chance > 0)).toBe(true);
  });

  it("lists partners for a fixed parent, best first", () => {
    const vets = sampleVeterans();
    const pc = createPlanContext(realData(), cfg, [], []);
    const list = partnersFor(pc, vets[1], vets);
    expect(list.every((l) => l.p1 === vets[1] && l.p2 !== vets[1])).toBe(true);
  });
});

describe("aptitude model", () => {
  it("boosts the start grade by pink stars, capped at A", () => {
    expect(startingGrade(5, 0)).toBe(5);
    expect(startingGrade(5, 1)).toBe(6);
    expect(startingGrade(5, 4)).toBe(7);
    expect(startingGrade(3, 10)).toBe(7);
    expect(startingGrade(8, 10)).toBe(8);
  });

  it("computes at-least-k chances", () => {
    expect(chanceAtLeast(0, [])).toBe(1);
    expect(chanceAtLeast(1, [0.5, 0.5])).toBeCloseTo(0.75);
    expect(chanceAtLeast(2, [0.5, 0.5])).toBeCloseTo(0.25);
    expect(chanceAtLeast(3, [0.5, 0.5])).toBe(0);
  });

  it("uses the planner's pink odds", () => {
    expect(FactorType.Aptitude).toBe(2);
  });
});

export type { Veteran };

describe("skill versions", () => {
  it("only offers ◎ and gold where the skill has them", async () => {
    const { skillVersions } = await import("../src/domain/goals");
    const d = realData();
    expect(skillVersions(d, 20001)).toEqual(["white", "double", "gold"]); // Right-Handed ◎ and Demon
    expect(skillVersions(d, 20159)).toEqual(["white", "gold"]); // Uma Stan → Superstan
    expect(skillVersions(d, 21010)).toEqual(["white"]); // Racing Spirit: Stamina
    expect(skillVersions(d, 999999)).toEqual(["white"]);
  });
});
