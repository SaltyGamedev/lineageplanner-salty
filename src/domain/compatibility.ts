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
//                        + Σ race(P,G) + race(P1,P2)
// uma.guide shows a parent's "own" affinity (without the trio links, which it
// shows on the grandparents); the parent's sparks still roll at the full value.
// A horse of the trainee's own character contributes nothing.

import type { GameData } from "./gameData";
import { ACTIVE_RULES } from "./rules";
import type { LineageMember, Veteran } from "./types";

const RULES = ACTIVE_RULES.compatibility;
/** Affinity per G1 race won by both horses (current Global rule set). */
export const G1_WIN_POINTS = RULES.g1Points;

export interface ParentAffinity {
  /** Full affinity of this parent: drives its sparks' inheritance chances. */
  affinity: number;
  /** The part shown on the parent card (affinity without the trio links to its grandparents). */
  own: number;
  /** Affinity of its two grandparents. */
  grandparents: [number, number];
  rank: number;
  /** Saddle ids of the G1s behind the race bonuses: with each grandparent, and with the other parent. */
  sharedG1: { grandparents: [number[], number[]]; pair: number[] };
}

export interface LineageCompat {
  /** Lineage total, as shown in game with ◎○△. */
  total: number;
  rank: number;
  parents: [ParentAffinity, ParentAffinity];
  /** True when every character could be resolved. */
  complete: boolean;
}

/** Saddle ids of races both horses won that count under the current rules (G1 only), each once. */
export function sharedG1Saddles(data: GameData, a: LineageMember, b: LineageMember): number[] {
  const set = new Set(a.winSaddleIds);
  return [...new Set(b.winSaddleIds)].filter((id) => {
    const type = data.saddles.get(id)?.type;
    return set.has(id) && type != null && RULES.countedSaddleTypes.includes(type);
  });
}

export const sharedG1Wins = (data: GameData, a: LineageMember, b: LineageMember) => sharedG1Saddles(data, a, b).length;

const raceBonus = (data: GameData, a: LineageMember, b: LineageMember) => sharedG1Wins(data, a, b) * G1_WIN_POINTS;
const pairRaceBonus = (data: GameData, a: LineageMember, b: LineageMember) => (RULES.parentPairOverlap ? raceBonus(data, a, b) : 0);

/** rel() over characters, 0 when one is missing or a member is the trainee's character. */
function rel(data: GameData, target: number, ids: (number | null)[], excludeTarget = true): number {
  if (ids.some((x) => x == null)) return 0;
  if (excludeTarget && ids.slice(1).some((x) => x === target)) return 0;
  return data.relationSum(ids as number[]);
}

function parentAffinity(data: GameData, target: number, p: Veteran, q: Veteran): { pa: ParentAffinity; trios: number; races: number } {
  if (p.charaId === target) {
    return { pa: { affinity: 0, own: 0, grandparents: [0, 0], rank: 1, sharedG1: { grandparents: [[], []], pair: [] } }, trios: 0, races: 0 };
  }
  const direct = rel(data, target, [target, p.charaId]);
  const gps = p.parents.map((g) => {
    if (!g || g.charaId === target) return 0;
    return rel(data, target, [target, p.charaId, g.charaId]) + raceBonus(data, p, g);
  }) as [number, number];
  const trios = p.parents.reduce((s, g) => s + (g && g.charaId !== target ? rel(data, target, [target, p.charaId, g.charaId]) : 0), 0);
  const pairCounts = p.charaId !== q.charaId && q.charaId !== target;
  const pair = pairCounts ? rel(data, target, [p.charaId, q.charaId], false) + pairRaceBonus(data, p, q) : 0;
  const affinity = direct + gps[0] + gps[1] + pair;
  const races = p.parents.reduce((s, g) => s + (g && g.charaId !== target ? raceBonus(data, p, g) : 0), 0);
  const sharedG1 = {
    grandparents: p.parents.map((g) => (g && g.charaId !== target ? sharedG1Saddles(data, p, g) : [])) as [number[], number[]],
    pair: pairCounts && RULES.parentPairOverlap ? sharedG1Saddles(data, p, q) : [],
  };
  return { pa: { affinity, own: affinity - trios, grandparents: gps, rank: data.relationRank(affinity), sharedG1 }, trios, races };
}

export function lineageCompat(data: GameData, target: number, p1: Veteran, p2: Veteran): LineageCompat {
  const a = parentAffinity(data, target, p1, p2);
  const b = parentAffinity(data, target, p2, p1);
  const direct = (p: Veteran) => (p.charaId === target ? 0 : rel(data, target, [target, p.charaId]));
  const pair = p1.charaId !== p2.charaId ? rel(data, target, [p1.charaId, p2.charaId], false) + pairRaceBonus(data, p1, p2) : 0;
  const total = direct(p1) + direct(p2) + a.trios + b.trios + pair + a.races + b.races;
  const members = [p1, p2, ...p1.parents, ...p2.parents];
  return {
    total,
    rank: data.relationRank(total),
    parents: [a.pa, b.pa],
    complete: members.every((m) => m != null && m.charaId != null),
  };
}

export const RANK_SYMBOL: Record<number, string> = { 1: "△", 2: "○", 3: "◎" };
