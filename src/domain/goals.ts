// Evaluates a lineage (trainee + two veterans with their fixed parents)
// against the user's goals and spark filters.
//
//   Inherit % – chance the trainee gets the skill hint / race spark at least once
//               over the two inspirations, or reaches the aptitude grade.
//   Spark %   – chance the trainee generates that white/race spark itself
//               (if it learns the skill / wins the race): base × 1.1ⁿ.
// Both follow the community model in inheritance.ts (approximation).

import { lineageCompat, type LineageCompat } from "./compatibility";
import { effectiveConfig, targetContext } from "./config";
import type { TargetContext } from "./conditions";
import type { GameData } from "./gameData";
import { aptitudeChance, chanceAny, procChance, slotAffinities, sparkGenerationChance, startingGrade } from "./inheritance";
import { ACTIVE_RULES } from "./rules";
import { APTITUDE_BY_GROUP, type AptitudeKey } from "./sparks";
import { FactorType, type Card, type Goal, type LineageMember, type PlannerConfig, type SparkFilter, type Veteran } from "./types";

export const SLOTS = ["p1", "p2", "p1g1", "p1g2", "p2g1", "p2g2"] as const;
export type Slot = (typeof SLOTS)[number];

export type SparkTier = "white" | "double" | "gold";
export const SPARK_BASE: Record<SparkTier, number> = ACTIVE_RULES.sparkGeneration.base;

const versionCache = new WeakMap<GameData, Map<number, SparkTier[]>>();

/**
 * Versions of a skill your trainee can buy, which only changes its Spark %
 * (the hint you inherit is always the plain skill): ○ always; ◎ when the group
 * has a ◎ variant; gold when it has a rarity-2 version.
 */
export function skillVersions(data: GameData, groupId: number): SparkTier[] {
  let perData = versionCache.get(data);
  if (!perData) {
    perData = new Map();
    versionCache.set(data, perData);
    for (const s of data.skills.values()) {
      const g = s.groupId || s.id;
      const list = perData.get(g) ?? ["white"];
      if (s.rarity === 1 && s.name.endsWith("◎") && !list.includes("double")) list.push("double");
      if (s.rarity === 2 && !list.includes("gold")) list.push("gold");
      perData.set(g, list);
    }
    for (const [g, list] of perData) perData.set(g, (["white", "double", "gold"] as const).filter((t) => list.includes(t)));
  }
  return perData.get(groupId) ?? ["white"];
}

export interface PlanContext {
  data: GameData;
  config: PlannerConfig;
  target: Card;
  goals: Goal[];
  filters: SparkFilter[];
  ctx: TargetContext;
  /** Labels computed once per context (looking them up scans the game data). */
  labels: Map<string, string>;
}

export function createPlanContext(data: GameData, config: PlannerConfig, goals: Goal[], filters: SparkFilter[]): PlanContext {
  if (config.targetCardId == null) throw new Error("No trainee selected");
  const target = data.cards.get(config.targetCardId);
  if (!target) throw new Error(`Trainee ${config.targetCardId} is not in the game data`);
  const eff = effectiveConfig(config, data);
  const labels = new Map<string, string>();
  for (const g of goals) labels.set(goalKey(g), goalLabel(data, g));
  for (const f of filters) labels.set(`filter:${f.color}:${f.groupId}`, filterLabel(data, f));
  return { data, config: eff, target, goals, filters, ctx: targetContext(eff, data), labels };
}

export interface SparkHit {
  slot: Slot;
  stars: number;
  /** Chance to proc at one inspiration. */
  chance: number;
}

export interface GoalResult {
  goal: Goal;
  key: string;
  label: string;
  color: "white" | "green" | "race" | "pink";
  inherit: number;
  /** Aptitude goals: upper bound of `inherit` (the hidden red-gene points are unknown; `inherit` is the lower bound). */
  inheritMax?: number;
  /** null when the trainee can't generate this spark from the lineage (aptitudes, unique skills). */
  spark: number | null;
  hits: SparkHit[];
  /** Aptitude goals: base grade, grade after the pink ★ start boost, pink ★ in the lineage. */
  aptitude?: { base: number; start: number; stars: number };
}

export interface FilterResult {
  filter: SparkFilter;
  label: string;
  stars: number;
  ok: boolean;
}

export interface Lineage {
  p1: Veteran;
  p2: Veteran;
  members: Record<Slot, LineageMember | null>;
  compat: LineageCompat;
  affinity: Record<Slot, number>;
  /** Skill and race-spark goals: the only ones with Inherit % and Spark %. */
  goals: GoalResult[];
  /** Aptitude targets (pink sparks), shown and ranked separately from the goals. */
  aptitudes: GoalResult[];
  filters: FilterResult[];
  /** All filters met. */
  ok: boolean;
  /** Mean chance (low end) of reaching the aptitude targets; null without targets. Ranks before the goals. */
  aptScore: number | null;
  /** Priority-weighted mean of the skill/race goal chances, 0..100; null without goals. Only used to order pairs. */
  score: number | null;
  /** Expected number of skill/race goals passed on (sum of Inherit chances). */
  expected: number;
  /** Chance that every skill/race goal is inherited (they roll independently); null without goals. */
  allInherit: number | null;
  /** Chance that the trainee generates every goal that has a Spark % (if it learns them). */
  allSpark: { chance: number; goals: number } | null;
}

export const goalKey = (g: Goal) => (g.kind === "aptitude" ? `apt:${g.key}` : `${g.kind}:${g.groupId}`);

const APT_GROUP: Record<AptitudeKey, number> = Object.fromEntries(
  Object.entries(APTITUDE_BY_GROUP).map(([g, k]) => [k, Number(g)]),
) as Record<AptitudeKey, number>;

export const APT_LABEL: Record<AptitudeKey, string> = {
  turf: "Turf", dirt: "Dirt", short: "Sprint", mile: "Mile", middle: "Medium", long: "Long",
  nige: "Front", senko: "Pace", sashi: "Late", oikomi: "End",
};
export const GRADE_LETTER = ["?", "G", "F", "E", "D", "C", "B", "A", "S"];

/** Display name of a skill group: its plain (○/white) version without the variant mark. */
export function skillGroupName(data: GameData, groupId: number): string {
  let best: { name: string; rarity: number } | null = null;
  for (const s of data.skills.values()) {
    if ((s.groupId || s.id) !== groupId) continue;
    if (!best || s.rarity < best.rarity || (s.rarity === best.rarity && s.name.endsWith("○"))) best = s;
  }
  return best ? best.name.replace(/\s*[○◎]$/, "") : `Skill ${groupId}`;
}

export function factorGroupName(data: GameData, groupId: number): string {
  for (const f of data.factors.values()) if (f.groupId === groupId) return f.name;
  return `Spark ${groupId}`;
}

export function goalLabel(data: GameData, g: Goal): string {
  if (g.kind === "aptitude") return `${APT_LABEL[g.key]} ${GRADE_LETTER[g.grade]}`;
  return g.kind === "skill" ? skillGroupName(data, g.groupId) : factorGroupName(data, g.groupId);
}

export function filterLabel(data: GameData, f: SparkFilter): string {
  return `${factorGroupName(data, f.groupId)} ≥${f.minStars}★`;
}

const isWhite = (t: FactorType) => t === FactorType.Skill || t === FactorType.Scenario;

interface ParsedSpark { type: FactorType; groupId: number; skillGroup: number | null; stars: number }
const parsedCache = new WeakMap<GameData, WeakMap<LineageMember, ParsedSpark[]>>();

/** A horse's sparks resolved against the game data (cached per horse). */
function parsedSparks(data: GameData, m: LineageMember): ParsedSpark[] {
  let perData = parsedCache.get(data);
  if (!perData) parsedCache.set(data, (perData = new WeakMap()));
  let out = perData.get(m);
  if (!out) {
    out = [];
    for (const id of m.factorIds) {
      const f = data.factors.get(id);
      if (!f) continue;
      const skill = f.skillId != null ? data.skills.get(f.skillId) : undefined;
      out.push({ type: f.type, groupId: f.groupId, stars: f.stars, skillGroup: skill ? skill.groupId || skill.id : null });
    }
    perData.set(m, out);
  }
  return out;
}

const relevantCache = new WeakMap<PlanContext, WeakMap<LineageMember, ParsedSpark[]>>();

/** The subset of a horse's sparks that any goal or filter of this context looks at. */
function relevantSparks(pc: PlanContext, m: LineageMember): ParsedSpark[] {
  let perPc = relevantCache.get(pc);
  if (!perPc) relevantCache.set(pc, (perPc = new WeakMap()));
  let out = perPc.get(m);
  if (!out) {
    const skillGroups = new Set(pc.goals.flatMap((g) => (g.kind === "skill" ? [g.groupId] : [])));
    const raceGroups = new Set(pc.goals.flatMap((g) => (g.kind === "race" ? [g.groupId] : [])));
    const pinkGroups = new Set(pc.goals.flatMap((g) => (g.kind === "aptitude" ? [APT_GROUP[g.key]] : [])));
    const filterKeys = new Set(pc.filters.map((f) => `${f.color}:${f.groupId}`));
    const color = (t: FactorType) => (t === FactorType.Stat ? "blue" : t === FactorType.Aptitude ? "pink" : t === FactorType.Unique ? "green" : "");
    out = parsedSparks(pc.data, m).filter(
      (f) =>
        (f.skillGroup != null && skillGroups.has(f.skillGroup)) ||
        (f.type === FactorType.Race && raceGroups.has(f.groupId)) ||
        (f.type === FactorType.Aptitude && pinkGroups.has(f.groupId)) ||
        filterKeys.has(`${color(f.type)}:${f.groupId}`),
    );
    perPc.set(m, out);
  }
  return out;
}

export function evaluate(pc: PlanContext, p1: Veteran, p2: Veteran): Lineage {
  const { data, target } = pc;
  const compat = lineageCompat(data, target.charaId, p1, p2);
  const affinity = slotAffinities(compat) as Record<Slot, number>;
  const members: Record<Slot, LineageMember | null> = {
    p1, p2, p1g1: p1.parents[0], p1g2: p1.parents[1], p2g1: p2.parents[0], p2g2: p2.parents[1],
  };

  // Only sparks that matter for a goal or filter (precomputed per horse and context).
  const sparks: { slot: Slot; type: FactorType; groupId: number; skillGroup: number | null; stars: number; chance: number }[] = [];
  for (const slot of SLOTS) {
    const m = members[slot];
    if (!m) continue;
    for (const f of relevantSparks(pc, m)) sparks.push({ slot, type: f.type, groupId: f.groupId, skillGroup: f.skillGroup, stars: f.stars, chance: procChance(f.type, f.stars, affinity[slot]) });
  }

  const results: GoalResult[] = pc.goals.map((g) => {
    const label = pc.labels.get(goalKey(g)) ?? goalLabel(data, g);
    if (g.kind === "aptitude") {
      const pinks = sparks.filter((s) => s.type === FactorType.Aptitude && s.groupId === APT_GROUP[g.key]);
      const stars = pinks.reduce((a, s) => a + s.stars, 0);
      const base = target.aptitudes[g.key];
      const start = startingGrade(base, stars);
      const range = aptitudeChance(start, g.grade, pinks.map((s) => s.chance));
      return {
        goal: g, key: goalKey(g), label, color: "pink",
        inherit: range.min,
        inheritMax: range.max,
        spark: null,
        hits: pinks.map(({ slot, stars, chance }) => ({ slot, stars, chance })),
        aptitude: { base, start, stars },
      };
    }
    const matching = sparks.filter((s) => (g.kind === "skill" ? s.skillGroup === g.groupId : s.type === FactorType.Race && s.groupId === g.groupId));
    const hits = matching.map(({ slot, stars, chance }) => ({ slot, stars, chance }));
    const inherit = chanceAny(matching.map((s) => s.chance));
    let spark: number | null;
    let color: GoalResult["color"];
    if (g.kind === "race") {
      color = "race";
      spark = sparkGenerationChance(new Set(matching.map((s) => s.slot)).size, ACTIVE_RULES.sparkGeneration.base.race);
    } else {
      const whites = matching.filter((s) => isWhite(s.type));
      const unique = matching.length > 0 && whites.length === 0 && matching.every((s) => s.type === FactorType.Unique);
      color = unique ? "green" : "white";
      // A saved version the skill doesn't have falls back to the plain one.
      const tier = skillVersions(data, g.groupId).includes(g.sparkTier) ? g.sparkTier : "white";
      spark = unique ? null : sparkGenerationChance(new Set(whites.map((s) => s.slot)).size, SPARK_BASE[tier]);
    }
    return { goal: g, key: goalKey(g), label, color, inherit, spark, hits };
  });

  const filters: FilterResult[] = pc.filters.map((f) => {
    const type = f.color === "blue" ? FactorType.Stat : f.color === "pink" ? FactorType.Aptitude : FactorType.Unique;
    const stars = sparks.filter((s) => s.type === type && s.groupId === f.groupId).reduce((a, s) => a + s.stars, 0);
    return { filter: f, label: pc.labels.get(`filter:${f.color}:${f.groupId}`) ?? filterLabel(data, f), stars, ok: stars >= f.minStars };
  });

  // Pink aptitude targets are not "goals": they get their own section and rank first.
  const aptitudes = results.filter((r) => r.goal.kind === "aptitude");
  const goals = results.filter((r) => r.goal.kind !== "aptitude");
  const weight = goals.reduce((a, r) => a + r.goal.priority, 0);
  const score = weight > 0 ? (100 * goals.reduce((a, r) => a + r.goal.priority * r.inherit, 0)) / weight : null;
  const withSpark = goals.filter((r) => r.spark != null);
  return {
    p1, p2, members, compat, affinity, goals, aptitudes, filters, ok: filters.every((f) => f.ok), score,
    aptScore: aptitudes.length ? aptitudes.reduce((a, r) => a + r.inherit, 0) / aptitudes.length : null,
    expected: goals.reduce((a, r) => a + r.inherit, 0),
    allInherit: goals.length ? goals.reduce((a, r) => a * r.inherit, 1) : null,
    allSpark: withSpark.length ? { chance: withSpark.reduce((a, r) => a * (r.spark as number), 1), goals: withSpark.length } : null,
  };
}
