// Compatibility (相性) between the trainee and a pair of veterans.
//
// VERIFIED from master.mdb: relation groups and their points
// (succession_relation / succession_relation_member) and the ◎○△ thresholds
// (succession_relation_rank).
//
// APPROXIMATION (community-documented, not confirmed from game code): how the
// groups are combined. For each parent P with grandparents G1, G2:
//   parentTotal = rel(T,P) + rel(T,P,G1) + rel(T,P,G2) + sharedWins(P,G1) + sharedWins(P,G2)
// and the lineage total additionally includes rel(P1,P2).
// rel(...) = sum of points of every relation group that contains all listed characters.
// sharedWins = number of win saddles both horses hold.

import type { GameData } from "./gameData";
import type { LineageMember, Veteran } from "./types";

export interface CompatTerm {
  label: string;
  value: number;
  kind: "pair" | "trio" | "wins";
  /** False when a character id could not be resolved (value is then 0 and incomplete). */
  complete: boolean;
}

export interface ParentCompat {
  total: number;
  rank: number;
  terms: CompatTerm[];
  /** Per-grandparent affinity: rel(T,P,G) + sharedWins(P,G) (see inheritance.ts). */
  grandparentAffinity: [number, number];
}

export interface LineageCompat {
  total: number;
  parents: [ParentCompat, ParentCompat];
  parentPair: CompatTerm;
  complete: boolean;
}

export function sharedWins(a: LineageMember, b: LineageMember): number {
  const set = new Set(a.winSaddleIds);
  let n = 0;
  for (const id of new Set(b.winSaddleIds)) if (set.has(id)) n++;
  return n;
}

function rel(data: GameData, label: string, kind: CompatTerm["kind"], ids: (number | null)[]): CompatTerm {
  const complete = ids.every((x) => x != null);
  return { label, kind, complete, value: complete ? data.relationSum(ids as number[]) : 0 };
}

export function parentCompat(data: GameData, targetChara: number, parent: Veteran): ParentCompat {
  const pName = data.charaName(parent.charaId);
  const terms: CompatTerm[] = [rel(data, `Trainee × ${pName}`, "pair", [targetChara, parent.charaId])];
  const grandparentAffinity: [number, number] = [0, 0];
  parent.parents.forEach((gp, i) => {
    if (!gp) {
      terms.push({ label: "Grandparent missing in export", value: 0, kind: "trio", complete: false });
      return;
    }
    const gName = data.charaName(gp.charaId);
    const trio = rel(data, `Trainee × ${pName} × ${gName}`, "trio", [targetChara, parent.charaId, gp.charaId]);
    const wins: CompatTerm = { label: `Shared wins ${pName} / ${gName}`, value: sharedWins(parent, gp), kind: "wins", complete: true };
    terms.push(trio, wins);
    grandparentAffinity[i] = trio.value + wins.value;
  });
  const total = terms.reduce((s, t) => s + t.value, 0);
  return { total, rank: data.relationRank(total), terms, grandparentAffinity };
}

export function lineageCompat(data: GameData, targetChara: number, p1: Veteran, p2: Veteran): LineageCompat {
  const a = parentCompat(data, targetChara, p1);
  const b = parentCompat(data, targetChara, p2);
  const parentPair = rel(data, `${data.charaName(p1.charaId)} × ${data.charaName(p2.charaId)}`, "pair", [p1.charaId, p2.charaId]);
  const complete = [...a.terms, ...b.terms, parentPair].every((t) => t.complete);
  return { total: a.total + b.total + parentPair.value, parents: [a, b], parentPair, complete };
}

export const RANK_SYMBOL: Record<number, string> = { 1: "△", 2: "○", 3: "◎" };
