// Inheritance chances, following the community model used by uma.guide's
// lineage planner (https://uma.guide/roster-viewer/) and parenting guide
// (APPROXIMATION – the game does not publish these numbers):
//
//   chance per inspiration = baseOdds(colour, ★) × (1 + affinity / 100)
//
// Sparks can be inherited at the two inspiration events of a career (Classic
// and Senior year, early April), and every horse is rolled separately with its
// own affinity (see compatibility.ts).

import type { LineageCompat } from "./compatibility";
import { FactorType } from "./types";

/** Base odds at 0 affinity, indexed by stars − 1 (uma.guide's planner). */
export const BASE_ODDS: Record<"blue" | "pink" | "green" | "race" | "white", [number, number, number]> = {
  blue: [0.7, 0.8, 0.9],
  pink: [0.01, 0.03, 0.05],
  green: [0.05, 0.1, 0.15],
  race: [0.01, 0.02, 0.03],
  white: [0.03, 0.06, 0.09],
};

export const INSPIRATIONS = 2;

export function oddsKind(type: FactorType): keyof typeof BASE_ODDS {
  switch (type) {
    case FactorType.Stat: return "blue";
    case FactorType.Aptitude: return "pink";
    case FactorType.Unique: return "green";
    case FactorType.Race: return "race";
    default: return "white"; // white skill and scenario sparks
  }
}

/** Chance that one spark procs at a single inspiration. */
export function procChance(type: FactorType, stars: number, affinity: number): number {
  const base = BASE_ODDS[oddsKind(type)][Math.min(3, Math.max(1, stars)) - 1];
  return Math.min(1, base * (1 + Math.max(0, affinity) / 100));
}

/** Chance that at least one of the given per-inspiration chances procs during the career. */
export function chanceAny(chances: number[], inspirations = INSPIRATIONS): number {
  let miss = 1;
  for (const p of chances) miss *= (1 - p) ** inspirations;
  return 1 - miss;
}

/** Affinity of every inherited horse, by tree slot ("p1", "p1g1", …). */
export function slotAffinities(compat: LineageCompat): Record<string, number> {
  const out: Record<string, number> = {};
  compat.parents.forEach((pc, i) => {
    out[`p${i + 1}`] = pc.affinity;
    out[`p${i + 1}g1`] = pc.grandparents[0];
    out[`p${i + 1}g2`] = pc.grandparents[1];
  });
  return out;
}

/** Chance of at least k successes among independent trials (Poisson binomial). */
export function chanceAtLeast(k: number, trials: number[]): number {
  if (k <= 0) return 1;
  if (k > trials.length) return 0;
  let dist = [1];
  for (const p of trials) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, i) => {
      next[i] += q * (1 - p);
      next[i + 1] += q * p;
    });
    dist = next;
  }
  return dist.slice(k).reduce((a, b) => a + b, 0);
}

/** Aptitude grades as stored by the game: 1 = G … 7 = A, 8 = S. */
export const GRADE_A = 7;
export const GRADE_S = 8;

/**
 * Starting aptitude after the career-start boost from pink ★ in the lineage
 * (parents + grandparents): ≥1★ +1 grade, ≥4★ +2, ≥7★ +3, ≥10★ +4, never
 * above A (uma.guide's model). Each pink proc at an inspiration then adds one grade.
 */
export function startingGrade(base: number, pinkStars: number): number {
  const bonus = pinkStars >= 10 ? 4 : pinkStars >= 7 ? 3 : pinkStars >= 4 ? 2 : pinkStars >= 1 ? 1 : 0;
  if (base >= GRADE_A) return base;
  return Math.min(base + bonus, GRADE_A);
}

/**
 * Chance that the trainee generates a white spark for a skill it learns,
 * given how many horses in the lineage carry that white spark. uma.guide's
 * current model (the exact formula is not known): base × 1.1^n, with base
 * 20% for ○, 25% for ◎ and 40% for the gold version.
 */
export function sparkGenerationChance(appearances: number, base: 0.2 | 0.25 | 0.4 = 0.2): number {
  return Math.min(1, base * 1.1 ** appearances);
}
