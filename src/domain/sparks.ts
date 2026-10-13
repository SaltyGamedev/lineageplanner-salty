// Collects the sparks (factors) present in a lineage and groups them by
// meaning. Mapping of factor groups to stats/aptitudes is verified against the
// factor names in master.mdb (text category 147): group 1..5 = Speed..Wit,
// 11/12 = Turf/Dirt, 21..24 = Front Runner..End Closer, 31..34 = Sprint..Long.

import type { GameData } from "./gameData";
import { FactorType, type Factor, type LineageMember, type Veteran } from "./types";

export type StatKey = "speed" | "stamina" | "power" | "guts" | "wiz";
export const STAT_BY_GROUP: Record<number, StatKey> = { 1: "speed", 2: "stamina", 3: "power", 4: "guts", 5: "wiz" };
export const STAT_LABEL: Record<StatKey, string> = { speed: "Speed", stamina: "Stamina", power: "Power", guts: "Guts", wiz: "Wit" };

export type AptitudeKey = "turf" | "dirt" | "nige" | "senko" | "sashi" | "oikomi" | "short" | "mile" | "middle" | "long";
export const APTITUDE_BY_GROUP: Record<number, AptitudeKey> = {
  11: "turf", 12: "dirt",
  21: "nige", 22: "senko", 23: "sashi", 24: "oikomi",
  31: "short", 32: "mile", 33: "middle", 34: "long",
};

export type SourceRole = "parent" | "grandparent";

export interface SparkSource {
  /** Position in the 7-node tree: "p1", "p2", "p1g1", "p1g2", "p2g1", "p2g2". */
  slot: string;
  role: SourceRole;
  member: LineageMember;
}

export interface Spark {
  factor: Factor;
  source: SparkSource;
}

export function lineageSources(p1: Veteran, p2: Veteran): SparkSource[] {
  const out: SparkSource[] = [];
  [p1, p2].forEach((p, i) => {
    out.push({ slot: `p${i + 1}`, role: "parent", member: p });
    p.parents.forEach((gp, j) => {
      if (gp) out.push({ slot: `p${i + 1}g${j + 1}`, role: "grandparent", member: gp });
    });
  });
  return out;
}

export function collectSparks(data: GameData, sources: SparkSource[]): { sparks: Spark[]; unknownFactorIds: number[] } {
  const sparks: Spark[] = [];
  const unknown: number[] = [];
  for (const source of sources) {
    for (const id of source.member.factorIds) {
      const factor = data.factors.get(id);
      if (factor) sparks.push({ factor, source });
      else unknown.push(id);
    }
  }
  return { sparks, unknownFactorIds: unknown };
}

export function sparkColor(f: Factor): "blue" | "pink" | "green" | "white" {
  switch (f.type) {
    case FactorType.Stat: return "blue";
    case FactorType.Aptitude: return "pink";
    case FactorType.Unique: return "green";
    default: return "white";
  }
}
