// Ranks pairs of owned veterans for a target. Each veteran brings its two
// recorded parents with it (they cannot be chosen separately), so the search
// space is unordered pairs of veterans. With realistic roster sizes this is a
// few thousand pairs, so every valid pair is scored exactly: no heuristic
// pruning. Rule-based exclusions are counted and reported.

import { createScoringContext, evaluateLineage, type LineageEvaluation, type ScoringContext } from "./scoring";
import type { GameData } from "./gameData";
import type { PlannerConfig, ScoreWeights, Veteran } from "./types";

export interface Constraints {
  /** Veterans that must appear in every result. At most two. */
  locked: number[];
  /** Veterans never used. */
  excluded: number[];
  /** Characters never used as parent. */
  excludedCharas: number[];
}

export const NO_CONSTRAINTS: Constraints = { locked: [], excluded: [], excludedCharas: [] };

export interface ExclusionStats {
  candidates: number;
  pairsEvaluated: number;
  byReason: Record<string, number>;
}

export interface OptimizeResult {
  ranked: LineageEvaluation[];
  stats: ExclusionStats;
  context: ScoringContext;
}

/** Why a single veteran cannot be a parent for this target, or null. */
export function veteranExclusion(v: Veteran, targetChara: number, cfg: PlannerConfig, c: Constraints): string | null {
  if (c.excluded.includes(v.trainedId)) return "Excluded by you";
  if (v.charaId != null && c.excludedCharas.includes(v.charaId)) return "Character excluded by you";
  if (v.charaId === targetChara) return "Same character as the trainee (game rule)";
  if (v.useType !== 0 && !cfg.includeNonStandardVeterans) return "Non-standard entry (use_type ≠ 0, possibly borrowed)";
  return null;
}

/** Why two otherwise valid veterans cannot be paired, or null. */
export function pairExclusion(a: Veteran, b: Veteran): string | null {
  if (a.trainedId === b.trainedId) return "Same veteran twice";
  if (a.charaId != null && a.charaId === b.charaId) return "Both parents are the same character (game rule)";
  return null;
}

export function optimize(
  data: GameData,
  veterans: Veteran[],
  config: PlannerConfig,
  weights: ScoreWeights,
  constraints: Constraints = NO_CONSTRAINTS,
  limit = 50,
): OptimizeResult {
  const sc = createScoringContext(data, config, weights);
  const targetChara = sc.target.charaId;
  const byReason: Record<string, number> = {};
  const bump = (r: string) => (byReason[r] = (byReason[r] ?? 0) + 1);

  const candidates = veterans.filter((v) => {
    const reason = veteranExclusion(v, targetChara, sc.config, constraints);
    if (reason && !constraints.locked.includes(v.trainedId)) {
      bump(reason);
      return false;
    }
    return true;
  });

  const locked = constraints.locked.filter((id) => candidates.some((v) => v.trainedId === id)).slice(0, 2);
  const ranked: LineageEvaluation[] = [];
  let pairsEvaluated = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (locked.length && !locked.every((id) => id === a.trainedId || id === b.trainedId)) continue;
      const reason = pairExclusion(a, b);
      if (reason) {
        bump(reason);
        continue;
      }
      pairsEvaluated++;
      ranked.push(evaluateLineage(sc, a, b));
    }
  }
  ranked.sort((x, y) => y.total - x.total || y.compat.total - x.compat.total || x.p1.trainedId - y.p1.trainedId);
  return { ranked: ranked.slice(0, limit), stats: { candidates: candidates.length, pairsEvaluated, byReason }, context: sc };
}

/**
 * Alternatives for one parent slot: keep the other parent fixed and rank every
 * other valid veteran in this slot. Because grandparents are fixed to their
 * veteran, this is also how a grandparent is "replaced".
 */
export function alternativesForSlot(
  sc: ScoringContext,
  veterans: Veteran[],
  fixed: Veteran,
  replacing: Veteran,
  constraints: Constraints,
  limit = 10,
): LineageEvaluation[] {
  const out: LineageEvaluation[] = [];
  for (const v of veterans) {
    if (v.trainedId === replacing.trainedId) continue;
    if (veteranExclusion(v, sc.target.charaId, sc.config, constraints)) continue;
    if (pairExclusion(fixed, v)) continue;
    out.push(evaluateLineage(sc, fixed, v));
  }
  return out.sort((a, b) => b.total - a.total).slice(0, limit);
}
