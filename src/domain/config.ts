import type { TargetContext } from "./conditions";
import type { GameData } from "./gameData";
import type { DistanceCategory, PlannerConfig, StyleKey, Surface } from "./types";

export const STYLES: { key: StyleKey; id: number; label: string }[] = [
  { key: "nige", id: 1, label: "Front Runner" },
  { key: "senko", id: 2, label: "Pace Chaser" },
  { key: "sashi", id: 3, label: "Late Surger" },
  { key: "oikomi", id: 4, label: "End Closer" },
];

export const DISTANCES: { key: DistanceCategory; id: number; label: string }[] = [
  { key: "short", id: 1, label: "Sprint" },
  { key: "mile", id: 2, label: "Mile" },
  { key: "middle", id: 3, label: "Medium" },
  { key: "long", id: 4, label: "Long" },
];

export const SURFACES: { key: Surface; id: number; label: string }[] = [
  { key: "turf", id: 1, label: "Turf" },
  { key: "dirt", id: 2, label: "Dirt" },
];

export const GROUND_CONDITIONS = [
  { id: 1, label: "Firm" },
  { id: 2, label: "Good" },
  { id: 3, label: "Soft" },
  { id: 4, label: "Heavy" },
];

export const APTITUDE_LETTERS = ["?", "G", "F", "E", "D", "C", "B", "A", "S"];
export const aptitudeLetter = (v: number) => APTITUDE_LETTERS[v] ?? "?";

/**
 * Distance category boundaries as used by the game's race categories
 * (Sprint ≤1400 m, Mile 1401–1800, Medium 1801–2400, Long ≥2401).
 * Documented in docs/DATA.md.
 */
export function distanceCategory(meters: number): DistanceCategory {
  if (meters <= 1400) return "short";
  if (meters <= 1800) return "mile";
  if (meters <= 2400) return "middle";
  return "long";
}

export const DEFAULT_CONFIG: PlannerConfig = {
  targetCardId: null,
  style: "senko",
  distance: "middle",
  distanceMeters: null,
  surface: "turf",
  groundCondition: null,
  courseId: null,
  cmId: null,
  season: null,
  weather: null,
  useBorrow: true,
  includeNonStandardVeterans: false,
};

/** Resolve the effective race description, letting a chosen course override manual fields. */
export function effectiveConfig(cfg: PlannerConfig, data: GameData): PlannerConfig {
  const course = cfg.courseId != null ? data.courses.get(cfg.courseId) : undefined;
  if (!course) return cfg;
  return {
    ...cfg,
    distanceMeters: course.distance,
    distance: distanceCategory(course.distance),
    surface: course.ground === 2 ? "dirt" : "turf",
  };
}

export function targetContext(cfg: PlannerConfig, data: GameData): TargetContext {
  const eff = effectiveConfig(cfg, data);
  const ctx: TargetContext = {
    running_style: STYLES.find((s) => s.key === eff.style)!.id,
    distance_type: DISTANCES.find((d) => d.key === eff.distance)!.id,
    ground_type: SURFACES.find((s) => s.key === eff.surface)!.id,
  };
  if (eff.groundCondition != null) ctx.ground_condition = eff.groundCondition;
  if (eff.season != null) ctx.season = eff.season;
  if (eff.weather != null) ctx.weather = eff.weather;
  if (eff.distanceMeters != null) ctx.is_basis_distance = eff.distanceMeters % 400 === 0 ? 1 : 0;
  const course = eff.courseId != null ? data.courses.get(eff.courseId) : undefined;
  if (course) {
    ctx.track_id = course.trackId;
    if (course.turn === 1 || course.turn === 2) ctx.rotation = course.turn;
    const layout = data.extras.courses[String(course.id)];
    if (layout) {
      ctx.slope_up = layout.up ? 1 : 0;
      ctx.slope_down = layout.down ? 1 : 0;
    }
  }
  return ctx;
}
