import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/domain/config";
import { notableSkills, optimizeLoop, ownSkillGroups, planSchedule, raceGoals, slotOfTurn, turnOf, winChance } from "../src/domain/loop";
import { realData, sampleVeterans } from "./helpers";

const A = 7, B = 6, C = 5, G = 1;

describe("independent training win chance (uma.guide table)", () => {
  it("reads distance × surface", () => {
    expect(winChance(B, B)).toBeCloseTo(0.9); // Mile B / Dirt B in the guide's example
    expect(winChance(A, C)).toBeCloseTo(0.9);
    expect(winChance(8, A)).toBe(1); // 110% caps at 100%
    expect(winChance(G, G)).toBe(0);
  });

  it("takes off the back-to-back penalty from the third race in a row", () => {
    expect(winChance(B, B, 2)).toBeCloseTo(0.9);
    expect(winChance(B, B, 3)).toBeCloseTo(0.8);
    expect(winChance(B, B, 4)).toBeCloseTo(0.65);
    expect(winChance(B, B, 5)).toBeCloseTo(0.55);
    expect(winChance(B, B, 9)).toBeCloseTo(0.4);
  });
});

describe("calendar and goals", () => {
  it("numbers turns by year and half-month", () => {
    expect(turnOf(2, 5, 2)).toBe(34); // Classic May ii: Japanese Derby
    expect(turnOf(3, 12, 2)).toBe(72);
    expect(slotOfTurn(34)).toEqual({ year: 2, month: 5, half: 2 });
  });

  it("reads Special Week's career goals", () => {
    const d = realData();
    const { races } = raceGoals(d, 1001);
    expect(races.map((r) => r.options[0].name)).toContain("Arima Kinen");
    expect(races.find((r) => r.options[0].name === "Arima Kinen")!.goal.value).toBe(1);
  });

  it("lists only tier-list skills the card can learn itself", () => {
    const d = realData();
    const card = d.cards.get(100101)!;
    const own = ownSkillGroups(d, card);
    for (const n of notableSkills(d, card)) expect(own.has(d.skills.get(n.skillId)!.groupId || n.skillId)).toBe(true);
  });
});

describe("race plan", () => {
  it("keeps the goal races, races each G1 once and only where it pays", () => {
    const d = realData();
    const card = d.cards.get(100101)!;
    const vets = sampleVeterans();
    const partners = vets.slice(0, 2);
    const plan = planSchedule(d, card, card.aptitudes, partners, 3);
    const goalTurns = raceGoals(d, card.charaId).races.map((r) => r.options[0].turn);
    for (const t of goalTurns) expect(plan.races.some((r) => r.turn === t && r.goal)).toBe(true);
    const extras = plan.races.filter((r) => !r.goal);
    expect(new Set(extras.map((r) => r.saddleId)).size).toBe(extras.length);
    for (const r of extras) expect(r.sharedWith).toBeGreaterThan(0);
    // Fewer races when each one has to be worth more.
    expect(planSchedule(d, card, card.aptitudes, partners, 6).extraRaces).toBeLessThanOrEqual(plan.extraRaces);
  });
});

describe("loop setups", () => {
  it("ranks setups with every goal in both parents first", () => {
    const d = realData();
    const vets = sampleVeterans();
    const groups = new Map<number, number>();
    for (const v of vets) for (const id of v.factorIds) {
      const s = d.factors.get(id)?.skillId;
      const g = s != null ? d.skills.get(s)?.groupId : undefined;
      if (g) groups.set(g, (groups.get(g) ?? 0) + 1);
    }
    const goals = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([groupId]) => ({ kind: "skill" as const, groupId, priority: 1 as const, sparkTier: "white" as const }));
    const res = optimizeLoop(d, [100101, 100601], vets, [], { ...DEFAULT_CONFIG, useBorrow: false }, goals, { excluded: [] }, { limit: 10 });
    expect(res.setups.length).toBeGreaterThan(0);
    for (let i = 1; i < res.setups.length; i++) expect(res.setups[i - 1].covered).toBeGreaterThanOrEqual(res.setups[i].covered);
    const top = res.setups[0];
    expect(top.schedule).toBeDefined();
    for (const g of top.goals) expect(g.kept).toBeLessThanOrEqual(g.spark ?? 0);
    expect([100101, 100601]).toContain(top.target.id);
    expect(top.lineage.p1.charaId).not.toBe(top.target.charaId);
  });
});
