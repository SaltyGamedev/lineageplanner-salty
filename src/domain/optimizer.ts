// Ranks pairs of veterans for a trainee. Each veteran brings its two recorded
// parents (they cannot be chosen separately), so the search space is pairs of
// veterans: every own pair, plus own × one friend's rental when borrowing is on
// (the game allows one rental per career). Every valid pair is scored exactly.

import { createPlanContext, evaluate, type Lineage, type PlanContext } from "./goals";
import type { GameData } from "./gameData";
import type { Goal, PlannerConfig, SparkFilter, Veteran } from "./types";

export interface Constraints {
  /** Veterans never used. */
  excluded: number[];
}

export const NO_CONSTRAINTS: Constraints = { excluded: [] };

export interface OptimizeResult {
  ranked: Lineage[];
  context: PlanContext;
  /** Pairs scored, and pairs dropped because a spark filter was not met. */
  pairs: number;
  filteredOut: number;
}

export function usable(v: Veteran, targetChara: number, cfg: PlannerConfig, c: Constraints): boolean {
  if (c.excluded.includes(v.trainedId)) return false;
  if (v.charaId === targetChara) return false; // game rule
  if (v.useType !== 0 && !cfg.includeNonStandardVeterans) return false;
  return true;
}

/** Game rules for a pair: two different characters, at most one rental. */
export function validPair(a: Veteran, b: Veteran): boolean {
  if (a.trainedId === b.trainedId) return false;
  if (a.charaId != null && a.charaId === b.charaId) return false;
  if (a.borrowed && b.borrowed) return false;
  return true;
}

/** Best first: filters met, then goal score (or affinity without goals), then affinity. */
export function compareLineages(x: Lineage, y: Lineage): number {
  if (x.ok !== y.ok) return x.ok ? -1 : 1;
  const s = (y.score ?? 0) - (x.score ?? 0);
  if (Math.abs(s) > 1e-9) return s;
  return y.compat.total - x.compat.total || x.p1.trainedId - y.p1.trainedId;
}

export function optimize(
  data: GameData,
  own: Veteran[],
  borrowed: Veteran[],
  config: PlannerConfig,
  goals: Goal[],
  filters: SparkFilter[],
  constraints: Constraints = NO_CONSTRAINTS,
  limit = 20,
): OptimizeResult {
  const pc = createPlanContext(data, config, goals, filters);
  const t = pc.target.charaId;
  const mine = own.filter((v) => usable(v, t, pc.config, constraints));
  const rentals = config.useBorrow ? borrowed.filter((v) => usable(v, t, pc.config, constraints)) : [];

  const all: Lineage[] = [];
  const consider = (a: Veteran, b: Veteran) => {
    if (validPair(a, b)) all.push(evaluate(pc, a, b));
  };
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) consider(mine[i], mine[j]);
    for (const r of rentals) consider(mine[i], r);
  }
  const kept = all.filter((l) => l.ok);
  const ranked = (kept.length ? kept : all).sort(compareLineages).slice(0, limit);
  return { ranked, context: pc, pairs: all.length, filteredOut: all.length - kept.length };
}

/** Every valid partner for a fixed veteran, best first (for picking a parent by hand). */
export function partnersFor(pc: PlanContext, fixed: Veteran, candidates: Veteran[], constraints: Constraints = NO_CONSTRAINTS): Lineage[] {
  return candidates
    .filter((v) => usable(v, pc.target.charaId, pc.config, constraints) && validPair(fixed, v))
    .map((v) => evaluate(pc, fixed, v))
    .sort(compareLineages);
}
