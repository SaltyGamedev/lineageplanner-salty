// Shapes of the generated game data (scripts/ingest/build_data.py) and of
// the planner's own domain objects. Game IDs are kept as-is so data can be
// refreshed without breaking saved plans.

export type Aptitudes = {
  turf: number;
  dirt: number;
  short: number;
  mile: number;
  middle: number;
  long: number;
  nige: number;
  senko: number;
  sashi: number;
  oikomi: number;
};

export interface GameMeta {
  schema: number;
  generatedAt: string;
  source: string;
  mdbSha256: string;
  resourceVersion?: string;
  appVersion?: string;
}

export interface Chara {
  id: number;
  name: string;
  color: string | null;
}

export interface Card {
  id: number;
  charaId: number;
  name: string;
  title: string;
  defaultRarity: number;
  runningStyle: number;
  aptitudes: Aptitudes;
  uniqueSkillId: number | null;
}

export interface SkillCondition {
  pre: string;
  cond: string;
}

export interface Skill {
  id: number;
  name: string;
  desc: string;
  rarity: number;
  groupId: number;
  iconId: number;
  gradeValue: number;
  category: number;
  conditions: SkillCondition[];
}

/** succession_factor.factor_type */
export enum FactorType {
  Stat = 1,
  Aptitude = 2,
  Unique = 3,
  Skill = 4,
  Race = 5,
  Scenario = 6,
  Other = 7,
}

export interface Factor {
  id: number;
  groupId: number;
  type: FactorType;
  stars: number;
  name: string;
  /** succession_factor_effect.target_type values for this factor group. */
  targets: number[];
  /** Skill hinted by this factor (effect target 41), if any. */
  skillId: number | null;
}

export interface Saddle {
  id: number;
  name: string;
  type: number;
}

export interface Course {
  id: number;
  trackId: number;
  distance: number;
  /** 1 = turf, 2 = dirt */
  ground: number;
  /** 1 = right, 2 = left, 4 = straight */
  turn: number;
}

export interface Race {
  id: number;
  name: string;
  grade: string;
  courseId: number;
}

export interface RawGameData {
  meta: GameMeta;
  charas: Record<string, Chara>;
  cards: Record<string, Card>;
  skills: Record<string, Skill>;
  factors: Record<string, Factor>;
  relations: {
    points: Record<string, number>;
    members: Record<string, number[]>;
    ranks: [number, number, number][];
  };
  saddles: Record<string, Saddle>;
  tracks: Record<string, string>;
  courses: Record<string, Course>;
  races: Race[];
}

// ---------------------------------------------------------------- veterans

/** One horse inside a lineage: a veteran or one of its recorded parents. */
export interface LineageMember {
  cardId: number;
  /** Resolved from game data; null if the card is unknown to the data set. */
  charaId: number | null;
  factorIds: number[];
  winSaddleIds: number[];
  rarity?: number;
  rank?: number;
}

/** Where a borrowable (friend's rental) veteran came from. */
export interface BorrowInfo {
  /** The friend's trainer (viewer) id. Stays in the browser. */
  trainerId: string;
  trainerName?: string;
  source: "export" | "uma.moe";
  /** When this rental was seen (veteran creation time, or uma.moe update time). */
  seenAt: string;
}

/** A trained horse (own, or a friend's rental), with its two fixed parents. */
export interface Veteran extends LineageMember {
  /** Own veterans: trained_chara_id. Borrowed veterans: a negative synthetic id. */
  trainedId: number;
  stats: { speed: number; stamina: number; power: number; guts: number; wiz: number };
  aptitudes: Aptitudes;
  skillIds: number[];
  rankScore: number;
  runningStyle: number;
  createdAt: string;
  isLocked: boolean;
  /** 0 for normally trained veterans; other values are not documented (see docs/DATA.md). */
  useType: number;
  /** The veteran's own parents (export positions 10 and 20). They become grandparents. */
  parents: [LineageMember | null, LineageMember | null];
  /** Set for a friend's rental. */
  borrowed?: BorrowInfo;
}

export interface ImportResult {
  veterans: Veteran[];
  /** Friends' umas you rented before, rebuilt from your veterans' parent records. */
  borrowed: Veteran[];
  warnings: string[];
  importedAt: string;
  sourceName: string;
}

// ------------------------------------------------------------------ config

export type DistanceCategory = "short" | "mile" | "middle" | "long";
export type Surface = "turf" | "dirt";
export type StyleKey = "nige" | "senko" | "sashi" | "oikomi";

export interface PlannerConfig {
  targetCardId: number | null;
  style: StyleKey;
  distance: DistanceCategory;
  /** Optional exact distance in metres (enables is_basis_distance checks). */
  distanceMeters: number | null;
  surface: Surface;
  /** 1 good, 2 slightly heavy, 3 heavy, 4 bad; null = not specified. */
  groundCondition: number | null;
  /** Optional race_course_set id; fixes track, rotation, distance and surface. */
  courseId: number | null;
  /** Champions Meeting this plan targets (GameTora id); its track details are copied into the fields above. */
  cmId: number | null;
  /** 1 spring … 4 winter (5 cherry blossom); null = not specified. */
  season: number | null;
  /** 1 sunny, 2 cloudy, 3 rainy, 4 snowy; null = not specified. */
  weather: number | null;
  /** Allow one friend's rental as a parent. */
  useBorrow: boolean;
  includeNonStandardVeterans: boolean;
}

export type Priority = 1 | 3;

/** What the user wants this lineage to pass on. */
export type Goal =
  /** A skill hint (white, or a unique skill's inherited version). groupId = skill group. */
  | { kind: "skill"; groupId: number; priority: Priority; sparkTier: "white" | "double" | "gold" }
  /** A race spark. groupId = factor group. */
  | { kind: "race"; groupId: number; priority: Priority }
  /** Reach an aptitude grade (7 = A, 8 = S) in surface/distance/style. */
  | { kind: "aptitude"; key: AptitudeKeyT; grade: number; priority: Priority };

export type AptitudeKeyT = keyof Aptitudes;

/** Minimum total ★ of one spark across the six inherited horses (hard requirement). */
export interface SparkFilter {
  color: "blue" | "pink" | "green";
  /** Factor group (blue 1–5, pink 11–34, green = the unique skill's factor group). */
  groupId: number;
  minStars: number;
}

export type Evidence = "verified" | "approximation" | "preference";
