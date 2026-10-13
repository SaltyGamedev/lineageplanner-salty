// Interprets skill activation conditions from skill_data.condition_* strings.
// Variable meanings follow GameTora's condition reference (the project's
// authority for game mechanics).
// Syntax in the data: `@` separates OR-alternatives, `&` separates AND-terms,
// each term is `variable<op>value`. Only variables that the planner's target
// context actually determines are evaluated; every other variable (position,
// phase, corner, random triggers, ...) is treated as "may happen" so it never
// excludes a skill.

import type { Skill } from "./types";

export type Op = "==" | "!=" | ">=" | "<=" | ">" | "<";

export interface Term {
  variable: string;
  op: Op;
  value: number;
}

const TERM_RE = /^([a-z0-9_]+)(==|!=|>=|<=|>|<)(-?\d+)$/;

export function parseCondition(cond: string): Term[][] {
  if (!cond.trim()) return [];
  return cond.split("@").map((alt) =>
    alt
      .split("&")
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => {
        const m = TERM_RE.exec(raw);
        if (!m) return { variable: `unparsed:${raw}`, op: "==", value: 0 } as Term;
        return { variable: m[1], op: m[2] as Op, value: Number(m[3]) };
      }),
  );
}

function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case "==": return a === b;
    case "!=": return a !== b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case ">": return a > b;
    case "<": return a < b;
  }
}

/**
 * Values of condition variables fixed by the planner configuration, plus
 * whether the chosen course has uphill / downhill sections (1/0).
 */
export type TargetContext = Partial<Record<TargetVariable | "slope_up" | "slope_down", number>>;

export const TARGET_VARIABLES = [
  "running_style",
  "distance_type",
  "ground_type",
  "ground_condition",
  "track_id",
  "rotation",
  "is_basis_distance",
  "season",
  "weather",
] as const;
export type TargetVariable = (typeof TARGET_VARIABLES)[number];

const LABELS: Record<string, string> = {
  running_style: "running style",
  distance_type: "distance",
  ground_type: "surface",
  ground_condition: "track condition",
  track_id: "racecourse",
  rotation: "direction",
  is_basis_distance: "basis distance (multiple of 400 m)",
  slope: "slopes",
  season: "season",
  weather: "weather",
};

/** Variables that describe the race but that the planner cannot know (no data / not configured). */
const UNSUPPORTED_RACE_VARIABLES = ["slope", "up_slope", "down_slope", "season", "weather", "time"];

/**
 * Slope variables (GameTora: slope 0 none / 1 up / 2 down; *_slope_random pick a
 * point on an uphill/downhill). With a known course layout, a slope term can only
 * hold if the course has that kind of slope. Returns undefined when unknown.
 */
function slopeTerm(t: Term, ctx: TargetContext): boolean | undefined {
  if (ctx.slope_up === undefined || ctx.slope_down === undefined) return undefined;
  const up = ctx.slope_up === 1;
  const down = ctx.slope_down === 1;
  if (t.variable === "slope") {
    if (t.op !== "==") return undefined;
    return t.value === 1 ? up : t.value === 2 ? down : t.value === 0 ? true : undefined;
  }
  if (t.variable.startsWith("up_slope_random")) return up;
  if (t.variable.startsWith("down_slope_random")) return down;
  return undefined;
}

export type Relevance = "match" | "generic" | "mismatch";

export interface SkillRelevance {
  relevance: Relevance;
  /** Target properties that the skill requires and the target satisfies. */
  matched: string[];
  /** Target properties that rule the skill out. */
  blockers: string[];
  /** Race properties the skill depends on but the planner can't evaluate. */
  unknown: string[];
}

function evalAlternative(terms: Term[], ctx: TargetContext) {
  const matched: string[] = [];
  const blockers: string[] = [];
  const unknown: string[] = [];
  for (const t of terms) {
    const slope = slopeTerm(t, ctx);
    if (slope !== undefined) {
      // "no slope" (slope==0) is true somewhere on every course, so it does not make a skill race-specific.
      if (!slope) blockers.push(LABELS.slope);
      else if (!(t.variable === "slope" && t.value === 0)) matched.push(LABELS.slope);
      continue;
    }
    const known = (TARGET_VARIABLES as readonly string[]).includes(t.variable);
    const value = known ? ctx[t.variable as TargetVariable] : undefined;
    if (known && value !== undefined) {
      (compare(value, t.op, t.value) ? matched : blockers).push(LABELS[t.variable]);
    } else if (known || UNSUPPORTED_RACE_VARIABLES.some((v) => t.variable === v || t.variable.startsWith(`${v}_`))) {
      unknown.push(LABELS[t.variable] ?? t.variable);
    }
  }
  return { possible: blockers.length === 0, matched, blockers, unknown };
}

export function evaluateSkill(skill: Skill, ctx: TargetContext): SkillRelevance {
  const matched = new Set<string>();
  const blockers = new Set<string>();
  const unknown = new Set<string>();
  let anyPossible = false;
  let anySpecific = false;
  for (const block of skill.conditions) {
    const pre = parseCondition(block.pre);
    const cond = parseCondition(block.cond);
    // A block can fire if some precondition alternative and some condition alternative can both hold.
    const preAlts = pre.length ? pre : [[]];
    for (const p of preAlts) {
      for (const c of cond.length ? cond : [[]]) {
        const r = evalAlternative([...p, ...c], ctx);
        r.unknown.forEach((u) => unknown.add(u));
        if (r.possible) {
          anyPossible = true;
          if (r.matched.length) anySpecific = true;
          r.matched.forEach((m) => matched.add(m));
        } else {
          r.blockers.forEach((b) => blockers.add(b));
        }
      }
    }
  }
  if (skill.conditions.length === 0) anyPossible = true;
  const relevance: Relevance = !anyPossible ? "mismatch" : anySpecific ? "match" : "generic";
  return {
    relevance,
    matched: [...matched],
    blockers: relevance === "mismatch" ? [...blockers] : [],
    unknown: [...unknown],
  };
}
