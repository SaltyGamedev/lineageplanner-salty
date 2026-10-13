// Community skill tier lists for parents (white sparks), one per running style.
//
// Source: a community parenting sheet supplied by the project owner (see
// docs/SCORING.md). The sheet prefers generic skills over style-specific ones,
// and skills within a tier are unordered. These tiers are opinions, so
// everything derived from them is labelled "preference".
//
// Entries list skill names as they appear in the Global game data. Names are
// resolved to skill groups at runtime, so ○/◎ variants and the gold version
// share one entry. Skills that are not in the Global data yet (JP-only) stay
// unresolved and are shown as such; they start counting once a data refresh
// adds them under the listed name.

import type { GameData } from "./gameData";
import type { StyleKey } from "./types";

export type Tier = "URA" | "T0" | "T0.5" | "T1" | "T1.5" | "T2" | "T3" | "T4" | "T5" | "HM" | "Extra";

export const TIERS: { tier: Tier; label: string; value: number }[] = [
  { tier: "URA", label: "URA scenario (pseudo T0)", value: 1 },
  { tier: "T0", label: "Tier 0", value: 1 },
  { tier: "T0.5", label: "Tier 0.5", value: 0.9 },
  { tier: "T1", label: "Tier 1", value: 0.8 },
  { tier: "T1.5", label: "Tier 1.5", value: 0.7 },
  { tier: "T2", label: "Tier 2", value: 0.6 },
  { tier: "T3", label: "Tier 3", value: 0.45 },
  { tier: "T4", label: "Tier 4", value: 0.3 },
  { tier: "T5", label: "Tier 5", value: 0.2 },
  { tier: "HM", label: "Honourable mention", value: 0.35 },
  { tier: "Extra", label: "Worth it with extra SP", value: 0.3 },
];
export const TIER_VALUE = Object.fromEntries(TIERS.map((t) => [t.tier, t.value])) as Record<Tier, number>;
export const TIER_ORDER = Object.fromEntries(TIERS.map((t, i) => [t.tier, i])) as Record<Tier, number>;

export interface TierEntry {
  tier: Tier;
  /** Label shown in the tier list (a skill or a family of skills). */
  label: string;
  /** Global skill names covered by this entry. */
  skills: string[];
  /** Japanese name, for skills that may not be on Global yet. */
  jp?: string;
  note?: string;
}

const GREENS = [
  "Right-Handed", "Left-Handed", "Firm Conditions", "Wet Conditions", "Spring Runner", "Summer Runner",
  "Fall Runner", "Winter Runner", "Standard Distance", "Non-Standard Distance",
];
const DISTANCE_SKILLS = [
  "Sprint Straightaways", "Sprint Corners", "Mile Straightaways", "Mile Corners",
  "Medium Straightaways", "Medium Corners", "Long Straightaways", "Long Corners",
];
const HESITANT = ["Hesitant Front Runners", "Hesitant Pace Chasers", "Hesitant Late Surgers", "Hesitant End Closers"];

const e = (tier: Tier, label: string, extra: Partial<TierEntry> = {}): TierEntry => ({ tier, label, skills: [label], ...extra });

/** Entries shared by every style list. */
const COMMON: TierEntry[] = [
  e("URA", "Racing Spirit: Stamina", { note: "Cheap 0.25 m/s with a stamina drain. Scenario-locked, so keep it in lineages from the start." }),
  e("T1", "Tail Held High", { note: "Very cheap and close to 100% consistent." }),
  e("T1", "Risky Business", { note: "Cheap 0.25 m/s with a stamina drain; best on Sprint and Mile for now." }),
  e("T3", "High Speed", { note: "3 s 0.15 m/s current-speed skill with a small heal." }),
  e("T3", "Earth's Blessing", { jp: "地の加護", note: "Grand Masters scenario skill." }),
  e("T3", "Middle Leg Adept", { jp: "中盤巧者", note: "Generic phase 1 velocity, only 1.8 s." }),
  e("HM", "Greens", { skills: GREENS, note: "Speed > Power > the rest. Race specific, so they matter most for a Champions Meeting." }),
  e("HM", "Straightaway Adept", { note: "Standard 3 s velocity, very easy to get." }),
  e("HM", "Downhill Speedster", { note: "Niche; carryover on some maps." }),
  e("HM", "Homestretch Haste", { note: "Consistent but short (2.4 s) and not mid-leg." }),
  e("HM", "Hesitant [X]", { skills: HESITANT, note: "Mostly Legend Race tech and very one-style meetings." }),
  e("HM", "Switch Over Pro", { jp: "切り替え上手", note: "Medium only; probably T0.5–T1 for Medium meetings." }),
  e("Extra", "Distance Straightaways/Corners", { skills: DISTANCE_SKILLS, note: "Take the ones the trainee has the aptitude for." }),
  e("Extra", "Unyielding Spirit", { note: "Very cheap early-race velocity." }),
  e("Extra", "Sprinting Gear", { note: "Pretty much always recommended for Sprint." }),
];

const LATE_BACK: TierEntry[] = [
  e("URA", "Racing Spirit: Power", { note: "Cheap 4 s velocity, only obtainable from parents." }),
  e("T0", "Uma Stan"),
  e("T0", "Nimble Navigator", { note: "Becomes an anti-block skill as better accelerations appear." }),
  e("T0.5", "Opening Leg Adept", { jp: "序盤巧者", note: "Early-race velocity is rare; breaks PDM." }),
  e("T1.5", "Slipstream"),
  e("T1.5", "Playtime's Over"),
  e("T2", "Ramp Up", { note: "Helps overtakes and breaks PDM." }),
  e("T4", "Restraint", { note: "Expensive for what it does." }),
  e("HM", "Racing Spirit: Mood", { note: "Wit check; very good for Team Trials." }),
];

export const TIER_LISTS: Record<StyleKey, TierEntry[]> = {
  nige: [
    ...COMMON,
    e("T0", "Dodging Danger", { note: "Lane combo: have all of them." }),
    e("T0", "Prudent Positioning", { note: "Lane combo." }),
    e("T0", "Ignited Spirit WIT", { note: "Lane combo." }),
    e("T0", "Groundwork"),
    e("T1", "Firm Resolve", { note: "Free 0.25 m/s but map dependent; not mid-leg." }),
    e("T1", "Mad Dash", { note: "2.7 s 0.25 m/s mid-leg, drains 4%." }),
    e("T1", "Opening Leg Adept", { jp: "序盤巧者", note: "Early-race velocity secures position for mid race." }),
    e("T1.5", "Front Runner Straightaways/Corners", { skills: ["Front Runner Straightaways", "Front Runner Corners"], note: "Cheap 3 s velocity; ◎ is a good SP dump." }),
    e("T2", "Playtime's Over"),
    e("T2", "Fast-Paced"),
    e("T2", "Leader's Pride"),
    e("T2", "Early Lead", { note: "Cheap and compulsory." }),
    e("T3", "Slipstream", { note: "Good after a bad start." }),
    e("T3", "Ramp Up", { note: "Good after a bad start." }),
    e("T5", "Front Runner Savvy", { note: "Groundwork fodder." }),
    e("T5", "Restraint", { note: "Expensive Groundwork fodder." }),
    e("HM", "Racing Spirit: Mood", { note: "Wit check; very good for Team Trials." }),
    e("HM", "Uma Stan", { note: "Very recent tech for fronts." }),
    e("HM", "No Hesitation", { jp: "迷いなし", note: "Long-distance accel." }),
    e("HM", "Goin' First", { jp: "一番乗り", note: "Medium starting accel." }),
    e("HM", "Swift Takeoff", { jp: "急発進", note: "Sprint starting accel." }),
    e("HM", "Ocean's Blessing", { jp: "海の加護", note: "Only matters for top Legend Race play." }),
    e("Extra", "Speed Eater", { note: "Mile; one of the most overtuned skills." }),
    e("Extra", "Productive Plan", { note: "Mile-only early-race velocity." }),
  ],
  senko: [
    ...COMMON,
    ...LATE_BACK,
    e("T0.5", "Decisive Blow", { jp: "決定打", note: "Consistent final-straight 0.25 m/s." }),
    e("T0.5", "Restless Step", { jp: "逸る足取り", note: "Early-race velocity; breaks PDM." }),
    e("T1", "Aggressive", { jp: "アグレッシブ", note: "2.4 s 0.25 m/s mid-leg, 2% drain." }),
    e("T1.5", "Pace Chaser Straightaways/Corners", { skills: ["Pace Chaser Straightaways", "Pace Chaser Corners"], note: "Cheap 3 s velocity; ◎ is a good SP dump." }),
    e("T1.5", "Head-On", { note: "Borderline compulsory on Sprint and Mile." }),
    e("T2", "Leap Premonition", { jp: "飛躍の予感" }),
    e("T2", "Latch On"),
    e("T2", "On the Attack"),
    e("T4", "Groundwork", { note: "Needs three good greens to be worth it." }),
    e("T4", "Shrewd Step"),
    e("HM", "My True Strength", { note: "Compulsory for Long, nothing else." }),
    e("HM", "Corner Adept"),
    e("HM", "Prudent/IS WIT", { skills: ["Prudent Positioning", "Ignited Spirit WIT"], note: "Possibly useful in recent Legend Races." }),
    e("HM", "Ocean's Blessing", { jp: "海の加護", note: "Only matters for top Sprint Legend Race play." }),
    e("Extra", "Speed Eater", { note: "Strong on Mile when fronts are rare." }),
    e("Extra", "Productive Plan", { note: "Mile-only early-race velocity." }),
    e("Extra", "All Set", { note: "Long heal; needs an accel on the ace." }),
  ],
  sashi: [
    ...COMMON,
    ...LATE_BACK,
    e("T0.5", "Pedal to the Metal", { note: "Consistent final-straight 0.25 m/s." }),
    e("T0.5", "Unrestrained Passion", { jp: "溢れる情熱", note: "Early-race velocity; breaks PDM." }),
    e("T1", "Full Throttle", { note: "2.4 s 0.25 m/s mid-leg, 2% drain." }),
    e("T1.5", "Slick Surge", { note: "Borderline compulsory on Sprint and Mile." }),
    e("T1.5", "Late Surger Straightaways/Corners", { skills: ["Late Surger Straightaways", "Late Surger Corners"], note: "Cheap 3 s velocity; ◎ is a good SP dump." }),
    e("T1.5", "1,500,000 CC", { note: "Cheap, but not every map." }),
    e("T1.5", "Preliminary Preparation", { jp: "下準備", note: "Consistent 2.4 s velocity; breaks PDM." }),
    e("T2", "Start the Charge", { jp: "進出開始" }),
    e("T2", "Latch On"),
    e("T2", "Position Pilfer", { note: "Consistent 2.4 s mid-leg." }),
    e("T3", "Fearless"),
    e("T3", "Outer Swell", { note: "Situational 3 s." }),
    e("HM", "Scramble", { note: "Compulsory for Long, but a support card usually has the gold." }),
    e("HM", "Corner Adept"),
    e("HM", "Groundwork", { note: "Very recent tech." }),
    e("HM", "Pressure"),
    e("Extra", "Leap Forward"),
    e("Extra", "Free-Spirited", { note: "Long-only heal." }),
  ],
  oikomi: [
    ...COMMON,
    ...LATE_BACK,
    e("T0.5", "Boiling Blood", { jp: "たぎる血潮", note: "Consistent final-straight 0.25 m/s." }),
    e("T1", "Straightaway Spurt", { note: "The defining End Closer accel." }),
    e("T1", "No Reluctance", { jp: "惜しみなし", note: "2.4 s 0.25 m/s mid-leg, 2% drain." }),
    e("T1.5", "End Closer Straightaways/Corners", { skills: ["End Closer Straightaways", "End Closer Corners"], note: "Cheap 3 s velocity; ◎ is a good SP dump." }),
    e("T2", "Sufficient Thrust", { jp: "推力十分" }),
    e("T2", "Masterful Gambit", { note: "Consistent 3 s late-race velocity." }),
    e("T2", "Sharp Steps", { note: "Accel; realistically Sprint and Mile only." }),
    e("T3", "Breakin' Out"),
    e("T4", "Early Start", { note: "Only relevant for discounts." }),
    e("HM", "Groundwork", { note: "Very recent tech." }),
    e("Extra", "Leap Forward"),
    e("Extra", "Free-Spirited", { note: "Long-only heal." }),
  ],
};

/** Lower-case, alphanumerics only, without ○ ◎ × variant marks. */
export const normalizeSkillName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ResolvedTierEntry extends TierEntry {
  groupIds: number[];
  /** Names from `skills` that are not in the game data. */
  missing: string[];
}

export interface ResolvedTierList {
  style: StyleKey;
  entries: ResolvedTierEntry[];
  /** Best tier per skill group (an entry can appear in several tiers through families). */
  byGroup: Map<number, ResolvedTierEntry>;
}

const cache = new WeakMap<GameData, Map<StyleKey, ResolvedTierList>>();

export function resolveTierList(data: GameData, style: StyleKey): ResolvedTierList {
  let perData = cache.get(data);
  if (!perData) cache.set(data, (perData = new Map()));
  const hit = perData.get(style);
  if (hit) return hit;

  const groupsByName = new Map<string, Set<number>>();
  for (const s of data.skills.values()) {
    // Unique skills (rarity ≥ 3) can share names with their inherited version; tier lists are about white sparks.
    if (s.rarity > 2) continue;
    const key = normalizeSkillName(s.name);
    const set = groupsByName.get(key) ?? new Set<number>();
    set.add(s.groupId || s.id);
    groupsByName.set(key, set);
  }

  const entries: ResolvedTierEntry[] = TIER_LISTS[style].map((entry) => {
    const groupIds = new Set<number>();
    const missing: string[] = [];
    for (const name of entry.skills) {
      const groups = groupsByName.get(normalizeSkillName(name));
      if (groups) groups.forEach((g) => groupIds.add(g));
      else missing.push(name);
    }
    return { ...entry, groupIds: [...groupIds], missing };
  });
  entries.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.label.localeCompare(b.label));

  const byGroup = new Map<number, ResolvedTierEntry>();
  for (const entry of entries) {
    for (const g of entry.groupIds) {
      const prev = byGroup.get(g);
      if (!prev || TIER_VALUE[entry.tier] > TIER_VALUE[prev.tier]) byGroup.set(g, entry);
    }
  }
  const resolved = { style, entries, byGroup };
  perData.set(style, resolved);
  return resolved;
}
