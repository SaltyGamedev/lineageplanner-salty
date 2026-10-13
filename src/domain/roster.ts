// What sparks the roster (own veterans, their parents, and rentals) carries,
// for the goal and filter pickers.

import type { GameData } from "./gameData";
import { FactorType, type Veteran } from "./types";

export interface SparkOption {
  kind: "skill" | "race" | "blue" | "pink" | "green";
  /** Skill group for skills; factor group otherwise. */
  groupId: number;
  /** Horses in the roster carrying it (veterans and their recorded parents). */
  count: number;
  bestStars: number;
}

export function rosterSparks(data: GameData, veterans: Veteran[]): Map<string, SparkOption> {
  const out = new Map<string, SparkOption>();
  const add = (kind: SparkOption["kind"], groupId: number, stars: number) => {
    const key = `${kind}:${groupId}`;
    const o = out.get(key) ?? { kind, groupId, count: 0, bestStars: 0 };
    o.count++;
    o.bestStars = Math.max(o.bestStars, stars);
    out.set(key, o);
  };
  for (const v of veterans) {
    for (const m of [v, ...v.parents]) {
      if (!m) continue;
      for (const id of m.factorIds) {
        const f = data.factors.get(id);
        if (!f) continue;
        if (f.type === FactorType.Stat) add("blue", f.groupId, f.stars);
        else if (f.type === FactorType.Aptitude) add("pink", f.groupId, f.stars);
        else if (f.type === FactorType.Race) add("race", f.groupId, f.stars);
        if (f.type === FactorType.Unique) add("green", f.groupId, f.stars);
        if (f.skillId != null && f.type !== FactorType.Race) {
          const s = data.skills.get(f.skillId);
          if (s) add("skill", s.groupId || s.id, f.stars);
        }
      }
    }
  }
  return out;
}

/** Every skill group that can be hinted by a spark (white or unique), with its representative skill id. */
export function sparkableSkillGroups(data: GameData): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of data.factors.values()) {
    if (f.skillId == null || f.type === FactorType.Race) continue;
    const s = data.skills.get(f.skillId);
    if (!s) continue;
    const g = s.groupId || s.id;
    if (!out.has(g)) out.set(g, s.id);
  }
  return out;
}
