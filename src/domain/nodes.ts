// Per-node view of an evaluated lineage: what each of the six inherited
// horses contributes. Used by the tree cards and the detail drawer.

import type { LineageEvaluation } from "./scoring";
import type { LineageMember, ScoreWeights } from "./types";

export type Quality = "excellent" | "good" | "mediocre" | "poor";

export interface NodeContribution {
  slot: string;
  role: "parent" | "grandparent";
  member: LineageMember;
  relevantSkills: { name: string; stars: number; relevance: string; tier: string | null; baseValue: number; cmBoost: boolean }[];
  ruledOutSkills: string[];
  aptitudeSparks: { label: string; stars: number; needed: boolean }[];
  statSparks: { key: string; stars: number }[];
  /** Preference indicator, 0..100 (see docs/SCORING.md). */
  score: number;
  quality: Quality;
}

export const quality = (score: number): Quality =>
  score >= 75 ? "excellent" : score >= 50 ? "good" : score >= 25 ? "mediocre" : "poor";

export function nodeMember(ev: LineageEvaluation, slot: string): LineageMember | null {
  const parent = slot.startsWith("p1") ? ev.p1 : ev.p2;
  if (slot.length === 2) return parent;
  return parent.parents[Number(slot[3]) - 1] ?? null;
}

export function nodeContribution(ev: LineageEvaluation, slot: string, weights: ScoreWeights): NodeContribution | null {
  const member = nodeMember(ev, slot);
  if (!member) return null;
  const role = slot.length === 2 ? "parent" : "grandparent";
  const relevantSkills: NodeContribution["relevantSkills"] = [];
  const ruledOutSkills: string[] = [];
  for (const s of ev.skills) {
    const own = s.sources.filter((x) => x.slot === slot);
    if (!own.length) continue;
    const stars = own.reduce((a, x) => a + x.stars, 0);
    if (s.relevance.relevance === "mismatch") ruledOutSkills.push(s.skill.name);
    else relevantSkills.push({ name: s.skill.name, stars, relevance: s.relevance.relevance, tier: s.tier?.tier ?? null, baseValue: s.baseValue, cmBoost: s.cmBoost });
  }
  const aptitudeSparks = ev.aptitudes.flatMap((a) =>
    a.sources.filter((x) => x.slot === slot).map((x) => ({ label: a.label, stars: x.stars, needed: a.need > 0 })),
  );
  const statSparks = ev.stats.flatMap((s) => s.sources.filter((x) => x.slot === slot).map((x) => ({ key: s.key, stars: x.stars })));

  // Skill worth (tier / condition value, CM bonus included) × stars / 3, so a 3★ T0 spark counts 1.
  const skillWorth = relevantSkills.reduce((a, s) => a + (s.baseValue * (s.cmBoost ? weights.cmBonus : 1) * Math.min(3, s.stars)) / 3, 0);
  const aptStars = aptitudeSparks.filter((a) => a.needed).reduce((a, s) => a + s.stars, 0);
  const statStars = statSparks.reduce((a, s) => a + s.stars * (weights.stat[s.key as keyof ScoreWeights["stat"]] ?? 0), 0);
  const score = 45 * Math.min(1, skillWorth / 2) + 35 * Math.min(1, aptStars / 3) + 20 * Math.min(1, statStars / 3);
  return { slot, role, member, relevantSkills, ruledOutSkills, aptitudeSparks, statSparks, score, quality: quality(score) };
}

export const SLOTS = ["p1", "p2", "p1g1", "p1g2", "p2g1", "p2g2"] as const;
