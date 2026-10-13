// Explainable scoring of a lineage (target + two veterans with their fixed parents).
//
// Each component returns 0..100 (or null when it does not apply) together with
// an evidence label:
//   verified       – read directly from game data
//   approximation  – game data combined by a documented community formula / interpretation
//   preference     – a weighting choice the user can change (including the community tier list)
// Inheritance chances follow the community model in inheritance.ts; how much a
// skill is worth comes from the tier list (or the skill's conditions when the
// tier list is off).

import { lineageCompat, type LineageCompat } from "./compatibility";
import { effectiveConfig, targetContext } from "./config";
import { evaluateSkill, type SkillRelevance, type TargetContext } from "./conditions";
import type { GameData } from "./gameData";
import { INSPIRATIONS, chanceAny, procChance, slotAffinities } from "./inheritance";
import {
  APTITUDE_BY_GROUP, STAT_BY_GROUP, STAT_LABEL, collectSparks, lineageSources,
  type AptitudeKey, type SourceRole, type StatKey,
} from "./sparks";
import { TIER_VALUE, resolveTierList, type ResolvedTierEntry, type ResolvedTierList } from "./tiers";
import { FactorType, type Card, type Evidence, type PlannerConfig, type ScoreWeights, type Skill, type Veteran } from "./types";

/** Normalisation references (preferences, documented in docs/SCORING.md). */
export const REFERENCE = {
  /** Compatibility total that maps to 100. */
  compatibility: 200,
  /** Sum of skill values (tier value × chance to inherit) that maps to 100. */
  skills: 4,
  /** Chance to inherit at least one needed aptitude spark that counts as full marks. */
  aptitudeChance: 0.5,
} as const;

/** Matched condition labels that describe the race itself (not the trainee's chosen style). */
const RACE_PROPERTIES = new Set([
  "distance", "surface", "track condition", "racecourse", "direction", "basis distance (multiple of 400 m)", "slopes", "season", "weather",
]);

export interface SparkSourceRef {
  slot: string;
  role: SourceRole;
  stars: number;
  /** Chance to proc at one inspiration (approximation). */
  chance: number;
}

export interface SkillSourceRef extends SparkSourceRef {
  factorType: FactorType;
  factorName: string;
}

export interface SkillEntry {
  skill: Skill;
  relevance: SkillRelevance;
  sources: SkillSourceRef[];
  /** Community tier for the running style, if listed. */
  tier: ResolvedTierEntry | null;
  /** Worth of the skill for this race before chance: tier value or condition-based value. */
  baseValue: number;
  /** True when the Champions Meeting bonus applied. */
  cmBoost: boolean;
  /** Chance that at least one source procs during the career. */
  chance: number;
  /** Number of horses carrying this skill as a white spark (drives spark generation when looping). */
  whiteAppearances: number;
  /** baseValue × CM bonus × chance. */
  value: number;
}

export interface AptitudeEntry {
  key: AptitudeKey;
  label: string;
  targetValue: number;
  need: number;
  stars: number;
  sources: SparkSourceRef[];
  /** Chance that at least one of these sparks procs during the career. */
  chance: number;
  value: number;
}

export interface StatEntry {
  key: StatKey;
  stars: number;
  /** Expected ★ inherited over both inspirations. */
  expectedStars: number;
  sources: SparkSourceRef[];
}

export interface ComponentScore {
  key: "compatibility" | "skills" | "aptitudeSparks" | "statSparks";
  label: string;
  score: number | null;
  weight: number;
  evidence: Evidence;
  notes: string[];
}

export interface LineageEvaluation {
  p1: Veteran;
  p2: Veteran;
  compat: LineageCompat;
  skills: SkillEntry[];
  aptitudes: AptitudeEntry[];
  stats: StatEntry[];
  components: ComponentScore[];
  total: number;
  reasons: string[];
  warnings: string[];
}

export interface ScoringContext {
  data: GameData;
  config: PlannerConfig;
  target: Card;
  weights: ScoreWeights;
  ctx: TargetContext;
  relevanceCache: Map<number, SkillRelevance>;
  tiers: ResolvedTierList;
  /** Champions Meeting selected for this plan, if any. */
  cmActive: boolean;
}

export function createScoringContext(
  data: GameData,
  config: PlannerConfig,
  weights: ScoreWeights,
): ScoringContext {
  if (config.targetCardId == null) throw new Error("No target selected");
  const target = data.cards.get(config.targetCardId);
  if (!target) throw new Error(`Target card ${config.targetCardId} is not in the game data`);
  const eff = effectiveConfig(config, data);
  return {
    data, config: eff, target, weights,
    ctx: targetContext(eff, data),
    relevanceCache: new Map(),
    tiers: resolveTierList(data, eff.style),
    cmActive: eff.cmId != null,
  };
}

function relevanceOf(sc: ScoringContext, skill: Skill): SkillRelevance {
  let r = sc.relevanceCache.get(skill.id);
  if (!r) {
    r = evaluateSkill(skill, sc.ctx);
    sc.relevanceCache.set(skill.id, r);
  }
  return r;
}

/** Worth of a usable skill for this race before inheritance chance (preference). */
export function skillBaseValue(sc: ScoringContext, skill: Skill, relevance: SkillRelevance): { value: number; tier: ResolvedTierEntry | null } {
  const tier = sc.tiers.byGroup.get(skill.groupId || skill.id) ?? null;
  if (relevance.relevance === "mismatch") return { value: 0, tier };
  const byConditions = relevance.relevance === "match" ? 1 : sc.weights.genericSkill;
  if (!sc.weights.tierList) return { value: byConditions, tier };
  return { value: tier ? TIER_VALUE[tier.tier] : byConditions * sc.weights.untieredSkill, tier };
}

const APT_LABEL: Record<AptitudeKey, string> = {
  turf: "Turf", dirt: "Dirt", nige: "Front Runner", senko: "Pace Chaser", sashi: "Late Surger",
  oikomi: "End Closer", short: "Sprint", mile: "Mile", middle: "Medium", long: "Long",
};

export function evaluateLineage(sc: ScoringContext, p1: Veteran, p2: Veteran): LineageEvaluation {
  const { data, weights, target } = sc;
  const warnings: string[] = [];
  const compat = lineageCompat(data, target.charaId, p1, p2);
  if (!compat.complete) warnings.push("Some characters are unknown to the game data; compatibility is incomplete.");

  const { sparks, unknownFactorIds } = collectSparks(data, lineageSources(p1, p2));
  if (unknownFactorIds.length) warnings.push(`${unknownFactorIds.length} spark(s) unknown to the game data were ignored.`);

  const affinity = slotAffinities(compat);
  const ref = (slot: string, role: SourceRole, type: FactorType, stars: number): SparkSourceRef => ({
    slot, role, stars, chance: procChance(type, stars, affinity[slot] ?? 0),
  });

  // ---- skills (white, green and race sparks that hint a skill); grouped by skill group so ○/◎ variants never double count
  const byGroup = new Map<number, { skill: Skill; sources: SkillSourceRef[] }>();
  for (const { factor, source } of sparks) {
    if (factor.skillId == null) continue;
    const skill = data.skills.get(factor.skillId);
    if (!skill) continue;
    const key = skill.groupId || skill.id;
    const entry = byGroup.get(key) ?? { skill, sources: [] };
    // Keep the higher-rarity variant as the representative skill of the group.
    if (skill.rarity > entry.skill.rarity) entry.skill = skill;
    entry.sources.push({ ...ref(source.slot, source.role, factor.type, factor.stars), factorType: factor.type, factorName: factor.name });
    byGroup.set(key, entry);
  }
  const skills: SkillEntry[] = [...byGroup.values()].map(({ skill, sources }) => {
    const relevance = relevanceOf(sc, skill);
    const { value: baseValue, tier } = skillBaseValue(sc, skill, relevance);
    const cmBoost = sc.cmActive && baseValue > 0 && relevance.relevance === "match" && relevance.matched.some((m) => RACE_PROPERTIES.has(m));
    const chance = chanceAny(sources.map((x) => x.chance));
    const whiteAppearances = new Set(sources.filter((x) => x.factorType === FactorType.Skill).map((x) => x.slot)).size;
    const value = baseValue * (cmBoost ? weights.cmBonus : 1) * chance;
    return { skill, relevance, sources, tier, baseValue, cmBoost, chance, whiteAppearances, value };
  });
  skills.sort((a, b) => b.value - a.value || b.baseValue - a.baseValue);

  // ---- aptitude sparks for the three properties of the target race
  const wanted: AptitudeKey[] = [sc.config.surface, sc.config.distance, sc.config.style];
  const aptitudes: AptitudeEntry[] = wanted.map((key) => {
    const targetValue = target.aptitudes[key];
    const need = targetValue >= 8 ? 0 : targetValue === 7 ? weights.aptitudeAlreadyA : 1;
    const sources = sparks
      .filter((s) => s.factor.type === FactorType.Aptitude && APTITUDE_BY_GROUP[s.factor.groupId] === key)
      .map((s) => ref(s.source.slot, s.source.role, s.factor.type, s.factor.stars));
    const chance = chanceAny(sources.map((x) => x.chance));
    const stars = sources.reduce((a, x) => a + x.stars, 0);
    return { key, label: APT_LABEL[key], targetValue, need, stars, sources, chance, value: need * Math.min(1, chance / REFERENCE.aptitudeChance) };
  });

  // ---- stat sparks
  const statKeys: StatKey[] = ["speed", "stamina", "power", "guts", "wiz"];
  const stats: StatEntry[] = statKeys.map((key) => {
    const sources = sparks
      .filter((s) => s.factor.type === FactorType.Stat && STAT_BY_GROUP[s.factor.groupId] === key)
      .map((s) => ref(s.source.slot, s.source.role, s.factor.type, s.factor.stars));
    return {
      key,
      sources,
      stars: sources.reduce((a, x) => a + x.stars, 0),
      expectedStars: sources.reduce((a, x) => a + x.stars * x.chance * INSPIRATIONS, 0),
    };
  });

  // ---- components
  const compatScore = 100 * Math.min(Math.max(compat.total, 0), REFERENCE.compatibility) / REFERENCE.compatibility;
  const skillSum = skills.reduce((s, e) => s + e.value, 0);
  const skillScore = 100 * Math.min(1, skillSum / REFERENCE.skills);
  const needSum = aptitudes.reduce((s, a) => s + a.need, 0);
  const aptScore = needSum > 0 ? (100 * aptitudes.reduce((s, a) => s + a.value, 0)) / needSum : null;
  const maxStatWeight = Math.max(...statKeys.map((k) => weights.stat[k]));
  // Best case: all six horses carry a 3★ spark in the most valued stat and it procs at both inspirations.
  const statMax = 3 * 6 * INSPIRATIONS * maxStatWeight;
  const statScore = statMax > 0 ? (100 * stats.reduce((s, e) => s + e.expectedStars * weights.stat[e.key], 0)) / statMax : null;

  const relevantSkills = skills.filter((s) => s.relevance.relevance !== "mismatch");
  const components: ComponentScore[] = [
    {
      key: "compatibility",
      label: "Compatibility",
      score: compatScore,
      weight: weights.compatibility,
      evidence: "approximation",
      notes: [
        `Total ${compat.total} (${compat.parents[0].total} + ${compat.parents[1].total} + parents pair ${compat.parentPair.value}).`,
        "Relation points are from game data; the way they are combined is a community-documented approximation.",
      ],
    },
    {
      key: "skills",
      label: "Skill sparks",
      score: skillScore,
      weight: weights.skills,
      evidence: "approximation",
      notes: [
        `${relevantSkills.length} usable skill group(s), ${skills.length - relevantSkills.length} ruled out by their conditions.`,
        weights.tierList
          ? `Valued by the community tier list for ${STYLE_NAME[sc.config.style]}; ${skills.filter((x) => x.tier && x.baseValue > 0).length} listed skill(s) present.`
          : "Valued by activation conditions only (tier list off).",
        ...(sc.cmActive ? [`${skills.filter((x) => x.cmBoost).length} skill(s) target this Champions Meeting (×${weights.cmBonus}).`] : []),
        "Each skill counts tier value × chance to inherit it at least once (uma.guide odds × affinity).",
      ],
    },
    {
      key: "aptitudeSparks",
      label: "Aptitude sparks",
      score: aptScore,
      weight: weights.aptitudeSparks,
      evidence: "approximation",
      notes: aptScore === null
        ? ["Target already has S in surface, distance and style, so aptitude sparks are not scored."]
        : aptitudes.map((a) => `${a.label}: ${a.stars}★ present, ${pct(a.chance)} to inherit at least one (need ${a.need})`),
    },
    {
      key: "statSparks",
      label: "Stat sparks",
      score: statScore,
      weight: weights.statSparks,
      evidence: "approximation",
      notes: stats.filter((s) => s.stars > 0).map((s) => `${STAT_LABEL[s.key]} ${s.stars}★ present, ~${s.expectedStars.toFixed(1)}★ expected over both inspirations`),
    },
  ];
  const active = components.filter((c) => c.score !== null && c.weight > 0);
  const weightSum = active.reduce((s, c) => s + c.weight, 0);
  const total = weightSum > 0 ? active.reduce((s, c) => s + (c.score as number) * c.weight, 0) / weightSum : 0;

  return { p1, p2, compat, skills, aptitudes, stats, components, total, reasons: explain(sc, compat, skills, aptitudes), warnings };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const STYLE_NAME: Record<string, string> = { nige: "Front Runner", senko: "Pace Chaser", sashi: "Late Surger", oikomi: "End Closer" };

function explain(sc: ScoringContext, compat: LineageCompat, skills: SkillEntry[], aptitudes: AptitudeEntry[]): string[] {
  const out: string[] = [];
  const symbols = compat.parents.map((p) => ["", "△", "○", "◎"][p.rank]).join(" / ");
  out.push(`Compatibility ${compat.total} (parents ${symbols}); higher affinity raises every spark's inheritance chance.`);
  const tiered = skills.filter((s) => s.tier && s.baseValue > 0).slice(0, 4);
  if (sc.weights.tierList && tiered.length)
    out.push(`Tier-list skills: ${tiered.map((s) => `${s.skill.name} (${s.tier!.tier}, ${pct(s.chance)})`).join(", ")}.`);
  const cm = skills.filter((s) => s.cmBoost).slice(0, 4);
  if (cm.length) out.push(`Targets this Champions Meeting: ${cm.map((s) => `${s.skill.name} (${pct(s.chance)})`).join(", ")}.`);
  else {
    const top = skills.filter((s) => s.relevance.relevance === "match").slice(0, 3);
    if (top.length) out.push(`Race-specific skill sparks: ${top.map((s) => `${s.skill.name} (${pct(s.chance)})`).join(", ")}.`);
  }
  for (const a of aptitudes) {
    if (a.need > 0 && a.stars > 0) out.push(`${a.label} aptitude sparks: ${a.stars}★, ${pct(a.chance)} to inherit at least one.`);
    if (a.need === 1 && a.stars === 0) out.push(`No ${a.label} sparks, but the target needs them.`);
  }
  if (sc.weights.compatibility === 0) out.push("Compatibility is weighted 0 in your settings.");
  return out;
}
