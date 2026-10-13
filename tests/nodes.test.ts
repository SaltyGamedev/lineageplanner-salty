import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS } from "../src/domain/config";
import { SLOTS, nodeContribution, nodeMember, quality } from "../src/domain/nodes";
import { createScoringContext, evaluateLineage } from "../src/domain/scoring";
import type { PlannerConfig } from "../src/domain/types";
import { realData, sampleVeterans } from "./helpers";

const cfg: PlannerConfig = { ...DEFAULT_CONFIG, targetCardId: 100101, style: "sashi", distance: "middle", surface: "turf" };

describe("tree nodes", () => {
  const vets = sampleVeterans();
  const sc = createScoringContext(realData(), cfg, DEFAULT_WEIGHTS);
  const ev = evaluateLineage(sc, vets[0], vets[1]);

  it("maps slots to the veteran and its fixed parents", () => {
    expect(nodeMember(ev, "p1")).toBe(vets[0]);
    expect(nodeMember(ev, "p2g2")).toBe(vets[1].parents[1]);
  });

  it("attributes every spark in the evaluation to exactly one node", () => {
    const nodes = SLOTS.map((s) => nodeContribution(ev, s, DEFAULT_WEIGHTS)!);
    const skillStars = nodes.reduce((a, n) => a + n.relevantSkills.reduce((b, s) => b + s.stars, 0), 0);
    const expected = ev.skills
      .filter((s) => s.relevance.relevance !== "mismatch")
      .reduce((a, s) => a + s.sources.reduce((b, x) => b + x.stars, 0), 0);
    expect(skillStars).toBe(expected);
    for (const n of nodes) {
      expect(n.score).toBeGreaterThanOrEqual(0);
      expect(n.score).toBeLessThanOrEqual(100);
    }
  });

  it("buckets quality at fixed thresholds", () => {
    expect([90, 60, 30, 10].map(quality)).toEqual(["excellent", "good", "mediocre", "poor"]);
  });
});
