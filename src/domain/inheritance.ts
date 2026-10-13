// Inheritance chances, following the community model published at
// https://uma.guide/guides/parenting-in-umamusume (APPROXIMATION – the game does
// not publish these numbers):
//
//   chance per inspiration = baseOdds(colour, ★) × (1 + affinity / 100)
//
// Sparks can be inherited at the two inspiration events of a career (Classic
// and Senior year, early April), and every horse is rolled separately with its
// own affinity. Per-horse affinity follows the usual community split of the
// compatibility terms:
//   parent P       = rel(T,P) + Σ rel(T,P,G) + Σ sharedWins(P,G)
//   grandparent G  = rel(T,P,G) + sharedWins(P,G)

import type { LineageCompat } from "./compatibility";
import { FactorType } from "./types";

/** Base odds at 0 affinity, indexed by stars − 1 (uma.guide). */
export const BASE_ODDS: Record<"blue" | "pink" | "green" | "race" | "white", [number, number, number]> = {
  blue: [0.7, 0.8, 0.9],
  pink: [0.02, 0.03, 0.05],
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
    out[`p${i + 1}`] = pc.total;
    out[`p${i + 1}g1`] = pc.grandparentAffinity[0];
    out[`p${i + 1}g2`] = pc.grandparentAffinity[1];
  });
  return out;
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
