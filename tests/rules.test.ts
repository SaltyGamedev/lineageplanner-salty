// The active rule set is the single source of every mechanic constant. These
// tests pin the current Global values so a rule change is a deliberate edit.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/domain/config";
import { lineageCompat } from "../src/domain/compatibility";
import { createPlanContext, evaluate } from "../src/domain/goals";
import { BASE_ODDS, procChance, sparkGenerationChance } from "../src/domain/inheritance";
import { optimize } from "../src/domain/optimizer";
import { rosterSparks } from "../src/domain/roster";
import { ACTIVE_RULES, GLOBAL_2026_06_24 } from "../src/domain/rules";
import { FactorType, type Goal, type PlannerConfig } from "../src/domain/types";
import { mkVet, realData, sampleVeterans, tinyData } from "./helpers";

const cfg: PlannerConfig = { ...DEFAULT_CONFIG, targetCardId: 100101, style: "sashi", useBorrow: false };

describe("active rule set", () => {
  it("is the Global set from the 24 June 2026 compatibility overhaul", () => {
    expect(ACTIVE_RULES).toBe(GLOBAL_2026_06_24);
    expect(ACTIVE_RULES.server).toBe("Global");
    expect(ACTIVE_RULES.compatibility.source.effective).toBe("2026-06-24");
    expect(ACTIVE_RULES.compatibility.g1Points).toBe(3);
    expect(ACTIVE_RULES.compatibility.countedSaddleTypes).toEqual([3]);
    expect(ACTIVE_RULES.compatibility.parentPairOverlap).toBe(true);
  });

  it("feeds every module's constants", () => {
    expect(BASE_ODDS).toBe(ACTIVE_RULES.inheritance.baseOdds);
    expect(sparkGenerationChance(0)).toBe(ACTIVE_RULES.sparkGeneration.base.white);
    expect(sparkGenerationChance(2, 0.4)).toBeCloseTo(0.4 * ACTIVE_RULES.sparkGeneration.growth ** 2);
  });

  it("labels estimates as estimates, never as confirmed", () => {
    expect(ACTIVE_RULES.inheritance.source.evidence).toBe("strong-empirical");
    expect(ACTIVE_RULES.sparkGeneration.source.evidence).toBe("estimate");
    expect(ACTIVE_RULES.aptitude.procSource.evidence).toBe("hypothesis");
  });
});

describe("compatibility breakdown", () => {
  it("lists the shared G1s behind every race bonus", () => {
    const d = tinyData();
    // saddles 1, 2, 9 are G1; 3 is G3; 4 a title; 5 a G2
    const a = mkVet(1, 2, [1, 2, 3, 4, 5, 9], [[3, [1, 3, 4]], [4, [9, 5]]]);
    const b = mkVet(2, 3, [2, 5], [[4, []], [4, []]]);
    const l = lineageCompat(d, 1, a, b);
    expect(l.parents[0].sharedG1.grandparents).toEqual([[1], [9]]);
    expect(l.parents[0].sharedG1.pair).toEqual([2]);
    expect(l.parents[1].sharedG1.pair).toEqual([2]);
  });
});

describe("parent versus grandparent", () => {
  it("rolls a parent's sparks at its own (higher) affinity", () => {
    const vets = sampleVeterans();
    const l = evaluate(createPlanContext(realData(), cfg, [], []), vets[1], vets[2]);
    expect(l.affinity.p1).toBeGreaterThanOrEqual(l.affinity.p1g1);
    expect(procChance(FactorType.Skill, 3, l.affinity.p1)).toBeGreaterThanOrEqual(procChance(FactorType.Skill, 3, l.affinity.p1g1));
  });
});

describe("ranking objectives", () => {
  it("orders by the objective the user picks", () => {
    const d = realData();
    const vets = sampleVeterans();
    const goals: Goal[] = [...rosterSparks(d, vets).values()].filter((o) => o.kind === "skill").slice(0, 5)
      .map((o) => ({ kind: "skill", groupId: o.groupId, priority: 1, sparkTier: "white" }));
    const desc = (xs: number[]) => expect([...xs].sort((a, b) => b - a)).toEqual(xs);
    desc(optimize(d, vets, [], cfg, goals, [], undefined, 99, "hits").ranked.map((l) => l.score!));
    desc(optimize(d, vets, [], cfg, goals, [], undefined, 99, "all").ranked.map((l) => l.allInherit!));
    desc(optimize(d, vets, [], cfg, goals, [], undefined, 99, "affinity").ranked.map((l) => l.compat.total));
  });
});
