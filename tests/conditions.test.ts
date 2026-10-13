import { describe, expect, it } from "vitest";
import { evaluateSkill, parseCondition } from "../src/domain/conditions";
import type { Skill } from "../src/domain/types";
import { realData } from "./helpers";

const skill = (cond: string, pre = ""): Skill => ({
  id: 1, name: "t", desc: "", rarity: 1, groupId: 1, iconId: 0, gradeValue: 0, category: 0,
  conditions: [{ pre, cond }],
});

describe("condition parsing", () => {
  it("splits OR (@) and AND (&)", () => {
    const p = parseCondition("running_style==3&distance_type==3@running_style==4");
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual([
      { variable: "running_style", op: "==", value: 3 },
      { variable: "distance_type", op: "==", value: 3 },
    ]);
  });
});

describe("skill relevance", () => {
  const ctx = { running_style: 3, distance_type: 3, ground_type: 1 };

  it("matches skills whose target conditions are satisfied", () => {
    const r = evaluateSkill(skill("running_style==3&distance_type==3&ground_type==1"), ctx);
    expect(r.relevance).toBe("match");
    expect(r.matched).toContain("running style");
  });

  it("rules out skills for another style", () => {
    const r = evaluateSkill(skill("running_style==1&phase==1"), ctx);
    expect(r.relevance).toBe("mismatch");
    expect(r.blockers).toEqual(["running style"]);
  });

  it("keeps a skill if any OR-alternative is possible", () => {
    expect(evaluateSkill(skill("running_style==1@running_style==3"), ctx).relevance).toBe("match");
  });

  it("treats situational variables as possible (generic)", () => {
    expect(evaluateSkill(skill("phase==2&order_rate<=50"), ctx).relevance).toBe("generic");
  });

  it("never rules out on variables the config does not fix", () => {
    const r = evaluateSkill(skill("rotation==1"), ctx);
    expect(r.relevance).toBe("generic");
    expect(r.unknown).toContain("direction");
    expect(evaluateSkill(skill("rotation==1"), { ...ctx, rotation: 2 }).relevance).toBe("mismatch");
  });

  it("respects preconditions", () => {
    expect(evaluateSkill(skill("phase==1", "distance_type==1"), ctx).relevance).toBe("mismatch");
  });

  it("flags slope dependence as unknown (no slope data)", () => {
    expect(evaluateSkill(skill("slope==1"), ctx).unknown).toContain("slopes");
  });

  it("evaluates real skills from the data set", () => {
    const d = realData();
    // 202152: running_style==3&phase_random==1 (Late Surger only)
    const s = d.skills.get(202152)!;
    expect(evaluateSkill(s, ctx).relevance).toBe("match");
    expect(evaluateSkill(s, { ...ctx, running_style: 1 }).relevance).toBe("mismatch");
  });
});
