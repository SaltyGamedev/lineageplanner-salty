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

describe("aptitude by year and advice", () => {
  it("never lowers an aptitude over the career and lifts it with pink sparks", async () => {
    const { aptitudesByYear, aptitudeAdvice, planSchedule: plan } = await import("../src/domain/loop");
    const { createPlanContext, evaluate } = await import("../src/domain/goals");
    const d = realData();
    const vets = sampleVeterans();
    const card = d.cards.get(100101)!;
    const pc = createPlanContext(d, { ...DEFAULT_CONFIG, targetCardId: card.id }, [], []);
    const l = evaluate(pc, vets[0], vets[1]);
    const years = aptitudesByYear(d, card, l);
    for (const k of ["turf", "dirt", "short", "mile", "middle", "long"] as const) {
      expect(years[0][k]).toBeGreaterThanOrEqual(card.aptitudes[k]);
      expect(years[1][k]).toBeGreaterThanOrEqual(years[0][k]);
      expect(years[2][k]).toBeGreaterThanOrEqual(years[1][k]);
      expect(years[2][k]).toBeLessThanOrEqual(8);
    }
    const partners = [vets[0], vets[1]];
    const sched = plan(d, card, years, partners, 3);
    for (const a of aptitudeAdvice(d, card, years, partners, 3, sched)) {
      expect(a.gain).toBeGreaterThanOrEqual(1);
      expect(Math.max(...years.map((y) => y[a.key]))).toBeLessThan(7);
    }
  });

  it("ranks by total affinity in affinity mode", () => {
    const d = realData();
    const res = optimizeLoop(d, [100101, 100601], sampleVeterans(), [], { ...DEFAULT_CONFIG, useBorrow: false }, [], { excluded: [] }, { limit: 8, objective: "affinity" });
    const total = (s: (typeof res.setups)[number]) => s.lineage.compat.total + s.nextAffinity + s.schedule!.expectedAffinity;
    for (let i = 1; i < res.setups.length; i++) expect(total(res.setups[i - 1])).toBeGreaterThanOrEqual(total(res.setups[i]) - 1e-9);
  });
});

describe("fixed 4-uma loops", () => {
  it("4 umas beat 3, and one shared schedule beats unaligned ones", async () => {
    const { bestGroups } = await import("../src/domain/loopGroup");
    const d = realData();
    const pool = [100101, 100601, 101701, 100701, 102001].filter((id) => d.cards.has(id));
    const four = bestGroups(d, pool, { size: 4, raceCost: 3, limit: 1 })[0];
    const three = bestGroups(d, pool, { size: 3, raceCost: 3, limit: 1 })[0];
    expect(four.affinity).toBeGreaterThan(three.affinity);
    expect(four.races).toBeGreaterThan(four.independentRaces);
    // Every run's parents and their parents are other loop umas.
    for (const r of four.runs) {
      expect(r.fourth).not.toBeNull();
      expect([r.parents[0].charaId, r.parents[1].charaId, r.fourth!.charaId]).not.toContain(r.trainee.charaId);
    }
  });

  it("suggests runs to start a group from the veterans you have", async () => {
    const { planGroup, startRuns } = await import("../src/domain/loopGroup");
    const d = realData();
    const vets = sampleVeterans();
    // A group of four characters you own veterans of.
    const cards: number[] = [];
    for (const v of vets) {
      const c = d.cards.get(v.cardId);
      if (c && !cards.some((id) => d.cards.get(id)!.charaId === c.charaId)) cards.push(c.id);
      if (cards.length === 4) break;
    }
    const g = planGroup(d, cards.map((id) => d.cards.get(id)!), 3);
    const runs = startRuns(g, d, vets, [], DEFAULT_CONFIG, { excluded: [] });
    expect(runs.length).toBeGreaterThan(0);
    const charas = new Set(g.members.map((m) => m.card.charaId));
    for (const r of runs) {
      expect(charas.has(r.p1.charaId!)).toBe(true);
      expect(charas.has(r.p2.charaId!)).toBe(true);
      expect([r.p1.charaId, r.p2.charaId]).not.toContain(r.trainee.charaId);
    }
    expect(runs[0].affinity).toBeGreaterThanOrEqual(runs[runs.length - 1].affinity);
  });
});
