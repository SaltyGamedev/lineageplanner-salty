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
 * Grades gained from red-gene points: 1 point = +1 grade, 4 = +2, 7 = +3, 10 = +4.
 * Source: Crazyfellow's Parenting & Gene Guide, ch. 3 "Red Gene mechanics"
 * (strong empirical finding for the career-start boost; inferred for mid-run).
 */
export function gradesFromPoints(points: number): number {
  return points >= 10 ? 4 : points >= 7 ? 3 : points >= 4 ? 2 : points >= 1 ? 1 : 0;
}

/**
 * Starting aptitude: the pink ★ of that aptitude across parents + grandparents
 * count as points; the boost never goes above A (S only comes from mid-run inheritance).
 */
export function startingGrade(base: number, pinkStars: number): number {
  if (base >= GRADE_A) return base;
  return Math.min(base + gradesFromPoints(pinkStars), GRADE_A);
}

/** Distribution of the number of successes among independent trials (index = count). */
export function successDistribution(trials: number[]): number[] {
  let dist = [1];
  for (const p of trials) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, i) => {
      next[i] += q * (1 - p);
      next[i + 1] += q * p;
    });
    dist = next;
  }
  return dist;
}

/** Hidden points a single red-gene proc gives mid-run: 1 to 5 (distribution unknown). */
export const RED_PROC_POINTS = { min: 1, max: 5 } as const;

/**
 * Chance to reach `goal` from `start` over the two inspirations, as a range.
 * Each inspiration: every pink spark of the aptitude rolls once; the procs' hidden
 * points (1–5 each) add up, and the turn's grade gain follows gradesFromPoints.
 * The point distribution is not known, so `min` assumes every proc gives 1 point
 * and `max` assumes 5 (ESTIMATE; the guide marks the 1–5 values as inference).
 */
export function aptitudeChance(start: number, goal: number, perTurnChances: number[]): { min: number; max: number } {
  const target = Math.min(goal, GRADE_S);
  if (start >= target) return { min: 1, max: 1 };
  const procs = successDistribution(perTurnChances);
  const chance = (pointsPerProc: number) => {
    let p = 0;
    procs.forEach((a, n1) => procs.forEach((b, n2) => {
      if (start + gradesFromPoints(n1 * pointsPerProc) + gradesFromPoints(n2 * pointsPerProc) >= target) p += a * b;
    }));
    return p;
  };
  return { min: chance(RED_PROC_POINTS.min), max: chance(RED_PROC_POINTS.max) };
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
