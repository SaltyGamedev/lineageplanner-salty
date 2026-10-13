// Affinity (相性) between the trainee and the six inherited horses.
//
// VERIFIED from master.mdb: relation groups and their points
// (succession_relation / succession_relation_member) and the ◎○△ thresholds.
//
// APPROXIMATION – how the groups combine, following uma.guide's lineage
// planner (community model). rel(...) = sum of points of every relation group
// containing all listed characters; race(A,B) = 3 per G1 won by both.
//   parent P (other parent Q, grandparents G1, G2):
//     rel(T,P) + rel(T,P,G1) + rel(T,P,G2) + race(P,G1) + race(P,G2) + rel(P,Q) + race(P,Q)
//   grandparent G of P:   rel(T,P,G) + race(P,G)
//   lineage total (◎○△): rel(T,P1) + rel(T,P2) + Σ rel(T,P,G) + rel(P1,P2)
// A horse of the trainee's own character contributes nothing.

import type { GameData } from "./gameData";
import type { LineageMember, Veteran } from "./types";

/** Affinity per G1 race won by both horses. */
export const G1_WIN_POINTS = 3;
/** win_saddle_type of G1 saddles in single_mode_wins_saddle. */
const G1_SADDLE_TYPE = 3;

export interface ParentAffinity {
  /** This parent's own affinity (drives its sparks' inheritance chances). */
  affinity: number;
  /** Affinity of its two grandparents. */
  grandparents: [number, number];
  rank: number;
}

export interface LineageCompat {
  /** Lineage total, as shown in game with ◎○△. */
  total: number;
  rank: number;
  parents: [ParentAffinity, ParentAffinity];
  /** True when every character could be resolved. */
  complete: boolean;
}

export function sharedG1Wins(data: GameData, a: LineageMember, b: LineageMember): number {
  const set = new Set(a.winSaddleIds);
  let n = 0;
  for (const id of new Set(b.winSaddleIds)) if (set.has(id) && data.saddles.get(id)?.type === G1_SADDLE_TYPE) n++;
  return n;
}

const raceBonus = (data: GameData, a: LineageMember, b: LineageMember) => sharedG1Wins(data, a, b) * G1_WIN_POINTS;

/** rel() over characters, 0 when one is missing or a member is the trainee's character. */
function rel(data: GameData, target: number, ids: (number | null)[], excludeTarget = true): number {
  if (ids.some((x) => x == null)) return 0;
  if (excludeTarget && ids.slice(1).some((x) => x === target)) return 0;
  return data.relationSum(ids as number[]);
}

function parentAffinity(data: GameData, target: number, p: Veteran, q: Veteran): { pa: ParentAffinity; trios: number } {
  if (p.charaId === target) return { pa: { affinity: 0, grandparents: [0, 0], rank: 1 }, trios: 0 };
  const direct = rel(data, target, [target, p.charaId]);
  const gps = p.parents.map((g) => {
    if (!g || g.charaId === target) return 0;
    return rel(data, target, [target, p.charaId, g.charaId]) + raceBonus(data, p, g);
  }) as [number, number];
  const trios = p.parents.reduce((s, g) => s + (g && g.charaId !== target ? rel(data, target, [target, p.charaId, g.charaId]) : 0), 0);
  const pair = p.charaId !== q.charaId && q.charaId !== target ? rel(data, target, [p.charaId, q.charaId], false) + raceBonus(data, p, q) : 0;
  const affinity = direct + gps[0] + gps[1] + pair;
  return { pa: { affinity, grandparents: gps, rank: data.relationRank(affinity) }, trios };
}

export function lineageCompat(data: GameData, target: number, p1: Veteran, p2: Veteran): LineageCompat {
  const a = parentAffinity(data, target, p1, p2);
  const b = parentAffinity(data, target, p2, p1);
  const direct = (p: Veteran) => (p.charaId === target ? 0 : rel(data, target, [target, p.charaId]));
  const pair = p1.charaId !== p2.charaId ? rel(data, target, [p1.charaId, p2.charaId], false) : 0;
  const total = direct(p1) + direct(p2) + a.trios + b.trios + pair;
  const members = [p1, p2, ...p1.parents, ...p2.parents];
  return {
    total,
    rank: data.relationRank(total),
    parents: [a.pa, b.pa],
    complete: members.every((m) => m != null && m.charaId != null),
  };
}

export const RANK_SYMBOL: Record<number, string> = { 1: "△", 2: "○", 3: "◎" };
