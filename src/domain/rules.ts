// The parenting rules the planner applies, as one versioned data set.
//
// Only mechanics live on the Global server are included; JP-only content and
// superseded rules are left out (they are not kept here "for completeness").
// When Global changes a rule, add a new rule set with its effective date and
// point ACTIVE_RULES at it; tests pin the current values.

export type EvidenceLabel = "confirmed" | "strong-empirical" | "estimate" | "hypothesis";

export interface RuleSource {
  evidence: EvidenceLabel;
  source: string;
  /** When the rule took effect on Global, if known. */
  effective?: string;
  note?: string;
}

const GUIDE = "Crazyfellow's Parenting & Gene Guide (https://docs.google.com/document/d/1Q3IJKbtkplmuY-PAJMNjYiLtasv0eU0aIBEqp8_C3tg/edit)";

export const GLOBAL_2026_06_24 = {
  id: "global-2026-06-24",
  server: "Global",
  /** Rules are checked against Global content up to this date. */
  checkedThrough: "2026-10-14",

  compatibility: {
    /** Affinity per G1 won by both horses (each race counted once). */
    g1Points: 3,
    /** win_saddle_type values that count: only G1 (3). G2/G3 (1, 2) and titles (0) don't. */
    countedSaddleTypes: [3] as readonly number[],
    /** Shared G1s between the two parents count too. */
    parentPairOverlap: true,
    source: {
      evidence: "confirmed",
      effective: "2026-06-24",
      source: `${GUIDE}, ch. 1 "How can you control these points?"`,
      note: "Global compatibility overhaul. Replaces the legacy +1 per shared G1/G2/G3 and title bonuses.",
    } satisfies RuleSource,
  },

  inheritance: {
    /** Inspirations per career. */
    inspirations: 2,
    /** Base chance per inspiration at 0 affinity, by ★1/★2/★3. */
    baseOdds: {
      blue: [0.7, 0.8, 0.9],
      pink: [0.01, 0.03, 0.05],
      green: [0.05, 0.1, 0.15],
      race: [0.01, 0.02, 0.03],
      white: [0.03, 0.06, 0.09],
    } as Record<"blue" | "pink" | "green" | "race" | "white", [number, number, number]>,
    source: {
      evidence: "strong-empirical",
      source: `${GUIDE}, bonus chapter "Inheritance chances" (Polaris, patent formula)`,
      note: "chance = base × (1 + individual affinity / 100)",
    } satisfies RuleSource,
  },

  sparkGeneration: {
    /** Base chance the trainee generates a white/race spark, by version bought. */
    base: { white: 0.2, double: 0.25, gold: 0.4, race: 0.2 },
    /** Multiplier per lineage horse carrying the same spark. */
    growth: 1.1,
    source: {
      evidence: "estimate",
      source: `${GUIDE}, ch. 4 (aoneko, fitted to Team Trials data)`,
      note: "base × 1.1ⁿ, n = horses in the lineage with that spark",
    } satisfies RuleSource,
  },

  aptitude: {
    /** Points needed for +1, +2, +3, +4 grades. */
    pointSteps: [1, 4, 7, 10] as readonly number[],
    /** The career-start boost never goes above A (7); S only comes mid-run. */
    startCapGrade: 7,
    /** Hidden points a mid-run red-gene proc gives (distribution unknown). */
    procPoints: { min: 1, max: 5 },
    startSource: {
      evidence: "strong-empirical",
      source: `${GUIDE}, ch. 3 "Red Gene mechanics"`,
      note: "Pink ★ across parents and grandparents count as points at the start of the career.",
    } satisfies RuleSource,
    procSource: {
      evidence: "hypothesis",
      source: `${GUIDE}, ch. 3 "Hidden Red Gene values"`,
      note: "Inferred by the guide's author without statistics; shown as a range.",
    } satisfies RuleSource,
  },

  /** Independent Training races: the result comes from aptitudes, not stats or skills. */
  independentTraining: {
    /** Win % at distance A+/surface A+; each grade below A on either axis takes off `winTableStep`. */
    winTableTop: 110,
    winTableStep: 10,
    /** [races in a row, win % taken off] — racing back to back without a rest. */
    consecutivePenalty: [[3, 10], [4, 25], [5, 35], [6, 50]] as readonly (readonly [number, number])[],
    /** Planner setting, not a game rule: affinity an extra race must beat (racing less helps the rating). */
    extraRaceCost: 1,
    source: {
      evidence: "strong-empirical",
      source: "uma.guide, Independent Training guide (https://uma.guide/guides/independent-training)",
      note: "Win table by distance × surface aptitude and the consecutive-race penalty. Style aptitude is not used.",
    } satisfies RuleSource,
  },
} as const;

export type RuleSet = typeof GLOBAL_2026_06_24;

/** The rule set every calculation uses. */
export const ACTIVE_RULES: RuleSet = GLOBAL_2026_06_24;

export const EVIDENCE_TEXT: Record<EvidenceLabel, string> = {
  confirmed: "Confirmed",
  "strong-empirical": "Strong empirical finding",
  estimate: "Estimate",
  hypothesis: "Hypothesis",
};
