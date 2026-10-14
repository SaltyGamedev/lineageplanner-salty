import { describe, expect, it } from "vitest";
import { evaluateSkill } from "../src/domain/conditions";
import { BASE_ODDS, chanceAny, procChance, sparkGenerationChance } from "../src/domain/inheritance";
import { TIER_LISTS, normalizeSkillName, resolveTierList } from "../src/domain/tiers";
import { FactorType, type Skill } from "../src/domain/types";
import { realData } from "./helpers";

describe("tier lists", () => {
  it("only contains skills that exist in the Global data", () => {
    const d = realData();
    for (const style of ["nige", "senko", "sashi", "oikomi"] as const) {
      const list = resolveTierList(d, style);
      expect(list.entries.length).toBeGreaterThan(10);
      for (const e of list.entries) {
        expect(e.groupIds.length, e.label).toBeGreaterThan(0);
        expect(e.missing, e.label).toEqual([]);
      }
    }
  });

  it("puts variants of one skill in one group", () => {
    const list = resolveTierList(realData(), "nige");
    const entry = list.entries.find((e) => e.label === "Front Runner Straightaways/Corners")!;
    expect(entry.groupIds.length).toBe(2);
    expect(entry.missing).toEqual([]);
  });

  it("keeps the best tier when a skill is listed twice", () => {
    const list = resolveTierList(realData(), "senko");
    const prudent = [...list.byGroup.values()].find((e) => e.skills.includes("Prudent Positioning"))!;
    expect(prudent.tier).toBe("HM");
    const uma = list.entries.find((e) => e.label === "Uma Stan")!;
    expect(list.byGroup.get(uma.groupIds[0])!.tier).toBe("T0");
  });

  it("normalises names", () => {
    expect(normalizeSkillName("Racing Spirit: Stamina")).toBe("racingspiritstamina");
    expect(normalizeSkillName("Fast-Paced")).toBe(normalizeSkillName("Fast Paced"));
    expect(Object.keys(TIER_LISTS)).toHaveLength(4);
  });
});

describe("inheritance odds (uma.guide model)", () => {
  it("scales base odds by affinity and caps at 100%", () => {
    expect(procChance(FactorType.Skill, 3, 0)).toBeCloseTo(BASE_ODDS.white[2]);
    expect(procChance(FactorType.Skill, 3, 100)).toBeCloseTo(0.18);
    expect(procChance(FactorType.Stat, 3, 200)).toBe(1);
    expect(procChance(FactorType.Aptitude, 1, -50)).toBeCloseTo(0.01);
  });

  it("combines sources over two inspirations", () => {
    expect(chanceAny([0.5])).toBeCloseTo(0.75);
    expect(chanceAny([])).toBe(0);
    expect(chanceAny([0.1, 0.1])).toBeCloseTo(1 - 0.9 ** 4);
  });

  it("models white spark generation as base × 1.1^n", () => {
    expect(sparkGenerationChance(0)).toBeCloseTo(0.2);
    expect(sparkGenerationChance(6, 0.4)).toBeCloseTo(0.7086, 3);
  });
});

describe("race details from GameTora", () => {
  const skill = (cond: string): Skill => ({ id: 1, name: "x", desc: "", rarity: 1, groupId: 1, iconId: 0, gradeValue: 0, category: 0, conditions: [{ pre: "", cond }] });

  it("evaluates slopes against the course layout", () => {
    const flat = { slope_up: 0, slope_down: 0 };
    const hilly = { slope_up: 1, slope_down: 1 };
    expect(evaluateSkill(skill("slope==2&phase>=1"), flat).relevance).toBe("mismatch");
    expect(evaluateSkill(skill("slope==2&phase>=1"), hilly).relevance).toBe("match");
    expect(evaluateSkill(skill("up_slope_random==1"), flat).relevance).toBe("mismatch");
    expect(evaluateSkill(skill("slope==2"), {}).unknown).toContain("slopes");
  });

  it("evaluates season and weather", () => {
    expect(evaluateSkill(skill("season==1@season==5"), { season: 1 }).relevance).toBe("match");
    expect(evaluateSkill(skill("season==1@season==5"), { season: 3 }).relevance).toBe("mismatch");
    expect(evaluateSkill(skill("weather==3"), { weather: 3 }).relevance).toBe("match");
  });

  it("maps every Champions Meeting to a course in the game data", () => {
    const d = realData();
    expect(d.extras.championsMeetings.length).toBeGreaterThan(0);
    for (const cm of d.extras.championsMeetings) {
      const course = [...d.courses.values()].find((c) => c.trackId === cm.trackId && c.distance === cm.distance && c.ground === cm.ground);
      expect(course, cm.name).toBeTruthy();
    }
  });
});
