// Loop planning: which uma to train next as a parent, from which pair, and
// which races she should run, so that every goal skill stays in every horse of
// the new parent's lineage ("an unbroken loop") and the loop keeps its affinity.
//
// A new parent T' trained from parents P1 and P2 later passes on her own sparks
// plus P1's and P2's (they become her grandparents). The loop holds a goal when
// P1 and P2 both carry its spark and T' generates it too.

import { distanceCategory } from "./config";
import type { GameData } from "./gameData";
import { SLOTS, createPlanContext, evaluate, factorGoalKeys, type Lineage } from "./goals";
import { GRADE_A, GRADE_S, procChance, startingGrade } from "./inheritance";
import { usable, validPair, type Constraints } from "./optimizer";
import { ACTIVE_RULES } from "./rules";
import { APTITUDE_BY_GROUP } from "./sparks";
import { resolveTierList, type ResolvedTierEntry } from "./tiers";
import { FactorType, type Aptitudes, type Card, type CareerGoal, type Goal, type LineageMember, type PlannerConfig, type StyleKey, type Veteran } from "./types";

const RULES = ACTIVE_RULES.independentTraining;

// ------------------------------------------------------------- candidates

export const STYLE_BY_ID: Record<number, StyleKey> = { 1: "nige", 2: "senko", 3: "sashi", 4: "oikomi" };

/** A card's best running style: its listed style, or the highest style aptitude. */
export function cardStyle(card: Card): StyleKey {
  const listed = STYLE_BY_ID[card.runningStyle];
  if (listed) return listed;
  const styles: StyleKey[] = ["nige", "senko", "sashi", "oikomi"];
  return styles.reduce((a, b) => (card.aptitudes[b] > card.aptitudes[a] ? b : a));
}

/** Tier-list skills (for the card's style) that the card can learn itself, best tier first. */
export function notableSkills(data: GameData, card: Card, style: StyleKey = cardStyle(card)): { entry: ResolvedTierEntry; skillId: number }[] {
  const tiers = resolveTierList(data, style);
  const order = new Map(tiers.entries.map((e, i) => [e, i]));
  const seen = new Set<ResolvedTierEntry>();
  const out: { entry: ResolvedTierEntry; skillId: number }[] = [];
  for (const id of card.skillIds ?? []) {
    const s = data.skills.get(id);
    const entry = s && tiers.byGroup.get(s.groupId || s.id);
    if (entry && !seen.has(entry)) {
      seen.add(entry);
      out.push({ entry, skillId: id });
    }
  }
  return out.sort((a, b) => (order.get(a.entry) ?? 0) - (order.get(b.entry) ?? 0));
}

/** Skill groups the card learns without help (its own hints and potential skills). */
export function ownSkillGroups(data: GameData, card: Card): Set<number> {
  const out = new Set<number>();
  for (const id of card.skillIds ?? []) {
    const s = data.skills.get(id);
    if (s) out.add(s.groupId || s.id);
  }
  return out;
}

// --------------------------------------------------------------- winning

/** Grade (1 G … 8 S) to the row/column of uma.guide's table: A and S share the first one. */
const aptIndex = (grade: number) => Math.min(6, Math.max(0, 7 - grade));

/** Independent Training win chance (0..1) from distance and surface aptitude, after the back-to-back penalty. */
export function winChance(distanceGrade: number, surfaceGrade: number, consecutive = 1): number {
  const base = RULES.winTableTop - RULES.winTableStep * (aptIndex(distanceGrade) + aptIndex(surfaceGrade));
  const penalty = RULES.consecutivePenalty.reduce((p, [count, pct]) => (consecutive >= count ? pct : p), 0);
  return Math.min(100, Math.max(0, base - penalty)) / 100;
}

/** Aptitudes at the start of the career: base grades raised by the pink ★ in the lineage. */
export function startAptitudes(card: Card, lineage: (LineageMember | null)[], data: GameData): Aptitudes {
  const stars: Partial<Record<keyof Aptitudes, number>> = {};
  for (const m of lineage) {
    for (const id of m?.factorIds ?? []) {
      const f = data.factors.get(id);
      if (!f || f.type !== FactorType.Aptitude) continue;
      const key = APTITUDE_BY_GROUP[f.groupId];
      if (key) stars[key] = (stars[key] ?? 0) + f.stars;
    }
  }
  const out = { ...card.aptitudes };
  for (const key of Object.keys(out) as (keyof Aptitudes)[]) out[key] = startingGrade(out[key], stars[key] ?? 0);
  return out;
}

export const APT_KEYS: (keyof Aptitudes)[] = ["turf", "dirt", "short", "mile", "middle", "long", "nige", "senko", "sashi", "oikomi"];

/** Distribution of hidden red-gene points one inspiration gives (index = points). */
function inspirationPoints(procs: number[]): number[] {
  const { min, max } = ACTIVE_RULES.aptitude.procPoints;
  let dist = [1];
  for (const p of procs) {
    const next = new Array(dist.length + max).fill(0);
    dist.forEach((q, pts) => {
      next[pts] += q * (1 - p);
      for (let k = min; k <= max; k++) next[pts + k] += (q * p) / (max - min + 1);
    });
    dist = next;
  }
  return dist;
}

/**
 * Expected aptitudes in each career year (Junior, Classic, Senior), as
 * fractional grades. Junior: the starting grade (pink ★ of the six horses,
 * max A). Each later year adds the expected grades from that year's
 * inspiration: every pink spark of the aptitude procs at its slot's affinity
 * and gives 1–5 hidden points (spread evenly: the real spread is unknown),
 * points turn into grades by the 1/4/7/10 steps, up to S.
 */
export function aptitudesByYear(data: GameData, card: Card, l: Lineage): Aptitudes[] {
  const pinks: Partial<Record<keyof Aptitudes, number[]>> = {};
  for (const slot of SLOTS) {
    const m = l.members[slot];
    for (const id of m?.factorIds ?? []) {
      const f = data.factors.get(id);
      if (!f || f.type !== FactorType.Aptitude) continue;
      const key = APTITUDE_BY_GROUP[f.groupId];
      if (key) (pinks[key] ??= []).push(procChance(FactorType.Aptitude, f.stars, l.affinity[slot]));
    }
  }
  const start = startAptitudes(card, Object.values(l.members), data);
  const years = [start, { ...start }, { ...start }];
  for (const key of APT_KEYS) {
    const dist = inspirationPoints(pinks[key] ?? []);
    const steps = ACTIVE_RULES.aptitude.pointSteps;
    const gain = steps.reduce((a, step) => a + dist.reduce((q, p, pts) => q + (pts >= step ? p : 0), 0), 0);
    years[1][key] = Math.min(GRADE_S, start[key] + gain);
    years[2][key] = Math.min(GRADE_S, start[key] + 2 * gain);
  }
  return years;
}

// -------------------------------------------------------------- calendar

export const turnOf = (year: number, month: number, half: number) => (year - 1) * 24 + (month - 1) * 2 + half;
export const slotOfTurn = (turn: number) => ({ year: Math.ceil(turn / 24), month: Math.floor(((turn - 1) % 24) / 2) + 1, half: ((turn - 1) % 2) + 1 });
const DEBUT_TURN = 12;
const LAST_TURN = 72;

export interface RaceOption {
  turn: number;
  raceId: number;
  name: string;
  /** G1 saddle won with it (null for races that give no G1 saddle). */
  saddleId: number | null;
  distance: number;
  ground: number;
}

/** Every G1 a career can run, by turn. */
export function g1Calendar(data: GameData): Map<number, RaceOption[]> {
  const out = new Map<number, RaceOption[]>();
  for (const s of data.saddles.values()) {
    if (s.type !== 3 || s.raceId == null || !s.years?.length) continue;
    const race = data.raceById.get(s.raceId);
    const course = race ? data.courses.get(race.courseId) : undefined;
    if (!course) continue;
    for (const year of s.years) {
      const turn = turnOf(year, s.month!, s.half!);
      out.set(turn, [...(out.get(turn) ?? []), { turn, raceId: s.raceId, name: s.name, saddleId: s.id, distance: course.distance, ground: course.ground }]);
    }
  }
  return out;
}

/** The G1 saddle a race gives, if any. */
function saddleOfRace(data: GameData, raceId: number): number | null {
  for (const s of data.saddles.values()) if (s.type === 3 && s.raceId === raceId) return s.id;
  return null;
}

export interface GoalSlot {
  goal: CareerGoal;
  options: RaceOption[];
}

/** The career's race goals with their race details (other goal types stay as notes). */
export function raceGoals(data: GameData, charaId: number): { races: GoalSlot[]; notes: CareerGoal[] } {
  const goals = data.careerGoals.get(charaId) ?? [];
  const races: GoalSlot[] = [];
  const notes: CareerGoal[] = [];
  for (const goal of goals) {
    if (goal.type !== 1 || !goal.options.length) {
      if (!(goal.type === 1 && goal.turn === DEBUT_TURN)) notes.push(goal);
      continue;
    }
    const options = goal.options.flatMap((o) => {
      const course = o.courseId != null ? data.courses.get(o.courseId) : undefined;
      return course ? [{ turn: o.turn, raceId: o.raceId, name: o.name, saddleId: saddleOfRace(data, o.raceId), distance: course.distance, ground: course.ground }] : [];
    });
    if (options.length) races.push({ goal, options });
  }
  return { races, notes };
}

export function goalNote(g: CareerGoal): string {
  if (g.type === 3) return `Reach ${g.value.toLocaleString()} fans`;
  if (g.type === 2) return `Top ${g.value} in ${g.count} graded races`;
  return "Scenario goal";
}

// -------------------------------------------------------------- schedule

export interface ScheduledRace extends RaceOption {
  goal: boolean;
  /** Placement the goal asks for (goal races only). */
  placement?: number;
  /** Races in a row including this one. */
  consecutive: number;
  win: number;
  /** Lineage horses that also won this G1: each shared win is +3 affinity with them. */
  sharedWith: number;
}

export interface Schedule {
  races: ScheduledRace[];
  /** Expected affinity from shared G1 wins with the partners. */
  expectedAffinity: number;
  /** Expected shared G1s with each partner, in the order given. */
  expectedShared: number[];
  extraRaces: number;
  notes: CareerGoal[];
}

const MAX_RUN = 6;

/** How much racing the schedule allows: the affinity an extra race has to be worth. */
export type RacePlan = "most" | "balanced" | "few";
export const RACE_PLANS: { key: RacePlan; label: string; cost: number; title: string }[] = [
  { key: "most", label: "Most affinity", cost: 1, title: "Any G1 worth at least 1 expected affinity" },
  { key: "balanced", label: "Balanced", cost: 3, title: "Races worth about one shared win or more" },
  { key: "few", label: "Few races", cost: 6, title: "Only races both parents won and she likely wins; better for the rating" },
];


/**
 * The races that maximise expected affinity with `partners` (each G1 they won
 * and she wins is +3 with each of them), with the career's goal races fixed.
 * Dynamic programming over turns; the state is how many races in a row she has
 * run, since back-to-back races lower the win chance. Each extra race costs
 * `raceCost` affinity points, so a race has to be worth it.
 */
export function planSchedule(
  data: GameData,
  card: Card,
  apt: Aptitudes | Aptitudes[],
  partners: (LineageMember | null)[],
  raceCost: number = RULES.extraRaceCost,
): Schedule {
  const wonBy = (saddle: number | null) => (saddle == null ? 0 : partners.filter((p) => p?.winSaddleIds.includes(saddle)).length);
  const { races, notes } = planRaces(data, card, apt, wonBy, raceCost);
  const expectedShared = partners.map((p) =>
    races.reduce((a, r) => a + (r.saddleId != null && p?.winSaddleIds.includes(r.saddleId) ? r.win : 0), 0),
  );
  const expectedAffinity = expectedShared.reduce((a, n) => a + n * 3, 0);
  return { races, expectedAffinity, expectedShared, extraRaces: races.filter((r) => !r.goal).length, notes };
}

/**
 * The race plan for any value per G1: `weight(saddle)` is how many lineage
 * horses (possibly fractional: their chance to have won it) she shares a win
 * of that G1 with; each shared win is +3 affinity.
 */
export function planRaces(
  data: GameData,
  card: Card,
  apt: Aptitudes | Aptitudes[],
  wonBy: (saddle: number | null) => number,
  raceCost: number = RULES.extraRaceCost,
): { races: ScheduledRace[]; notes: CareerGoal[] } {
  const byYear = Array.isArray(apt) ? apt : [apt, apt, apt];
  const { races: goals, notes } = raceGoals(data, card.charaId);
  const calendar = g1Calendar(data);
  const chance = (r: RaceOption, run: number) => {
    const a = byYear[Math.ceil(r.turn / 24) - 1];
    return winChance(a[distanceCategory(r.distance)], r.ground === 2 ? a.dirt : a.turf, run);
  };

  // A goal with options on different turns is pinned to its best option.
  const goalAt = new Map<number, { slot: GoalSlot; options: RaceOption[] }>();
  for (const slot of goals) {
    const best = [...slot.options].sort((a, b) => wonBy(b.saddleId) * chance(b, 1) - wonBy(a.saddleId) * chance(a, 1))[0];
    const options = slot.options.filter((o) => o.turn === best.turn);
    goalAt.set(best.turn, { slot, options });
  }

  // A G1 saddle counts once: extras never repeat a goal race's saddle, and when
  // the plan picks one saddle in two years, the turn with the lower win chance
  // is blocked and the plan is redone.
  const goalSaddles = new Set<number | null>([...goalAt.values()].flatMap((g) => g.options.map((o) => o.saddleId)).filter((id) => id != null));
  const blocked = new Set<string>();
  const solve = () => {
    // value[t][run] = best expected value from turn t on, having run `run` races in a row before t.
    type Choice = { race: RaceOption | null; next: number; gain: number };
    const value: number[][] = Array.from({ length: LAST_TURN + 2 }, () => new Array(MAX_RUN + 1).fill(0));
    const choice: Choice[][] = Array.from({ length: LAST_TURN + 2 }, () => new Array(MAX_RUN + 1));
    for (let t = LAST_TURN; t >= 1; t--) {
      const goal = goalAt.get(t);
      const extras =
        t > DEBUT_TURN
          ? (calendar.get(t) ?? []).filter((r) => wonBy(r.saddleId) > 0 && !goalSaddles.has(r.saddleId) && !blocked.has(`${t}:${r.saddleId}`))
          : [];
      for (let run = 0; run <= MAX_RUN; run++) {
        const nextRun = Math.min(run + 1, MAX_RUN);
        const options: Choice[] = [];
        const raceGain = (r: RaceOption) => chance(r, run + 1) * 3 * wonBy(r.saddleId);
        if (goal) {
          for (const r of goal.options) options.push({ race: r, next: nextRun, gain: raceGain(r) });
        } else {
          options.push({ race: null, next: 0, gain: 0 });
          for (const r of extras) options.push({ race: r, next: nextRun, gain: raceGain(r) - raceCost });
        }
        let best = options[0];
        for (const o of options) if (o.gain + value[t + 1][o.next] > best.gain + value[t + 1][best.next]) best = o;
        value[t][run] = best.gain + value[t + 1][best.next];
        choice[t][run] = best;
      }
    }
    const out: ScheduledRace[] = [];
    let run = 0;
    for (let t = 1; t <= LAST_TURN; t++) {
      const c = choice[t][run];
      if (c.race) {
        const isGoal = goalAt.has(t);
        out.push({ ...c.race, goal: isGoal, placement: isGoal ? goalAt.get(t)!.slot.goal.value : undefined, consecutive: run + 1, win: chance(c.race, run + 1), sharedWith: wonBy(c.race.saddleId) });
      }
      run = c.next;
    }
    return out;
  };

  let races = solve();
  for (let i = 0; i < 20; i++) {
    const bySaddle = new Map<number, ScheduledRace[]>();
    for (const r of races) if (!r.goal && r.saddleId != null) bySaddle.set(r.saddleId, [...(bySaddle.get(r.saddleId) ?? []), r]);
    const dupes = [...bySaddle.values()].filter((list) => list.length > 1);
    if (!dupes.length) break;
    for (const list of dupes) {
      const keep = list.reduce((a, b) => (b.win > a.win ? b : a));
      for (const r of list) if (r !== keep) blocked.add(`${r.turn}:${r.saddleId}`);
    }
    races = solve();
  }

  return { races, notes };
}

// ---------------------------------------------------------------- setups

export interface LoopGoal {
  key: string;
  label: string;
  /** Carried by each parent's own sparks. */
  inP1: boolean;
  inP2: boolean;
  /** The new parent can learn it herself (her own hints). */
  ownSkill: boolean;
  /** Chance she gets the skill: certain when it's her own, else the chance it's inherited. */
  learn: number;
  /** Chance she generates its spark (null: can't, e.g. a unique skill). */
  spark: number | null;
  /** Chance the goal is in all three horses of her lineage afterwards. */
  kept: number;
}

export interface LoopSetup {
  target: Card;
  lineage: Lineage;
  goals: LoopGoal[];
  /** Chance every goal stays in every horse (the loop stays unbroken). */
  unbroken: number;
  /** Expected number of goals kept everywhere. */
  keptExpected: number;
  /** Goals both parents already carry. */
  covered: number;
  /** Affinity she would have as a parent for the best next loop uma, with P1/P2 as her grandparents (before races). */
  nextAffinity: number;
  nextTarget: Card | null;
  /** Expected aptitudes per career year (Junior, Classic, Senior). */
  aptitudes: Aptitudes[];
  /** Quick estimate of the shared-G1 affinity her parents' wins allow (no back-to-back penalty). */
  potential: number;
  /** Filled for the top setups. */
  schedule?: Schedule;
  advice?: AptitudeAdvice[];
}

const goalInMember = (data: GameData, m: LineageMember | null, key: string) =>
  !!m && m.factorIds.some((id) => factorGoalKeys(data, id).includes(key));

/**
 * Affinity of a parent of chara `parent` (with grandparents g1, g2) for trainee `next`:
 * her link with the trainee and the two trios. Race bonuses come from the schedule.
 */
function parentLinkAffinity(data: GameData, next: number, parent: number, gps: (number | null)[]): number {
  if (next === parent) return 0;
  let a = data.relationSum([next, parent]);
  for (const g of gps) if (g != null && g !== next && g !== parent) a += data.relationSum([next, parent, g]);
  return a;
}

/** loop: keep every goal in every horse first; affinity: most affinity now + next + race plan first. */
export type LoopObjective = "loop" | "affinity";

export interface LoopResult {
  setups: LoopSetup[];
  pairs: number;
}

/**
 * Ranks every (loop uma, parent pair) for the skill goals: loop kept unbroken
 * first, then the expected number of goals kept, then affinity now plus the
 * affinity she brings to the next loop uma. Race schedules are planned for the
 * top `limit` setups and add their expected G1 affinity to the order.
 */
export function optimizeLoop(
  data: GameData,
  loopCards: number[],
  own: Veteran[],
  borrowed: Veteran[],
  config: PlannerConfig,
  goals: Goal[],
  constraints: Constraints,
  {
    limit = 20,
    raceCost = RULES.extraRaceCost as number,
    objective = "loop",
  }: { limit?: number; raceCost?: number; objective?: LoopObjective } = {},
): LoopResult {
  const skillGoals = goals.filter((g) => g.kind !== "aptitude");
  const cards = loopCards.map((id) => data.cards.get(id)).filter((c): c is Card => !!c);
  const all: LoopSetup[] = [];
  let pairs = 0;
  for (const target of cards) {
    const cfg = { ...config, targetCardId: target.id, style: cardStyle(target) };
    const pc = createPlanContext(data, cfg, skillGoals, []);
    const own_ = ownSkillGroups(data, target);
    const mine = own.filter((v) => usable(v, target.charaId, pc.config, constraints));
    const rentals = config.useBorrow ? borrowed.filter((v) => usable(v, target.charaId, pc.config, constraints)) : [];
    const others = cards.filter((c) => c.charaId !== target.charaId);
    const consider = (p1: Veteran, p2: Veteran) => {
      if (!validPair(p1, p2)) return;
      pairs++;
      const l = evaluate(pc, p1, p2);
      const lg: LoopGoal[] = l.goals.map((r) => {
        const isOwn = r.goal.kind === "skill" && own_.has(r.goal.groupId);
        const learn = isOwn ? 1 : r.inherit;
        const spark = r.spark == null ? null : learn * r.spark;
        const inP1 = goalInMember(data, p1, r.key);
        const inP2 = goalInMember(data, p2, r.key);
        return { key: r.key, label: r.label, inP1, inP2, ownSkill: isOwn, learn, spark, kept: inP1 && inP2 && spark != null ? spark : 0 };
      });
      let nextAffinity = 0;
      let nextTarget: Card | null = null;
      for (const n of others) {
        const a = parentLinkAffinity(data, n.charaId, target.charaId, [p1.charaId, p2.charaId]);
        if (nextTarget == null || a > nextAffinity) [nextAffinity, nextTarget] = [a, n];
      }
      const aptitudes = aptitudesByYear(data, target, l);
      all.push({
        target,
        lineage: l,
        aptitudes,
        potential: racePotential(data, aptitudes, [p1, p2]),
        goals: lg,
        unbroken: lg.length ? lg.reduce((a, g) => a * g.kept, 1) : 0,
        keptExpected: lg.reduce((a, g) => a + g.kept, 0),
        covered: lg.filter((g) => g.inP1 && g.inP2).length,
        nextAffinity,
        nextTarget,
      });
    };
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) consider(mine[i], mine[j]);
      for (const r of rentals) consider(mine[i], r);
    }
  }
  const base = (s: LoopSetup) => s.lineage.compat.total + s.nextAffinity + (s.schedule?.expectedAffinity ?? s.potential);
  // Loop chances are products of several Spark %, so tiny gaps are noise:
  // compare them in steps of 15% (relative), then let affinity decide.
  const loopStep = (s: LoopSetup) => (s.unbroken > 0 ? Math.floor(Math.log(s.unbroken) / Math.log(1.15)) : -Infinity);
  const order =
    objective === "affinity"
      ? (x: LoopSetup, y: LoopSetup) => base(y) - base(x) || y.covered - x.covered || y.keptExpected - x.keptExpected
      : (x: LoopSetup, y: LoopSetup) => y.covered - x.covered || loopStep(y) - loopStep(x) || base(y) - base(x) || y.keptExpected - x.keptExpected;
  all.sort(order);
  const top = all.slice(0, limit * (objective === "affinity" ? 6 : 3));
  for (const s of top) {
    const partners = [s.lineage.p1, s.lineage.p2];
    s.schedule = planSchedule(data, s.target, s.aptitudes, partners, raceCost);
  }
  top.sort(order);
  for (const s of top.slice(0, limit)) {
    s.advice = aptitudeAdvice(data, s.target, s.aptitudes, [s.lineage.p1, s.lineage.p2], raceCost, s.schedule!);
  }
  return { setups: top.slice(0, limit), pairs };
}

// ---------------------------------------------------------------- advice

/** Shared G1s her parents won, without the race-in-a-row penalty: a quick upper bound for ranking by affinity. */
export function racePotential(data: GameData, byYear: Aptitudes[], partners: (LineageMember | null)[]): number {
  const counts = new Map<number, number>();
  for (const p of partners) for (const id of new Set(p?.winSaddleIds ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  let total = 0;
  for (const [id, n] of counts) {
    const s = data.saddles.get(id);
    const race = s?.type === 3 && s.raceId != null ? data.raceById.get(s.raceId) : undefined;
    const course = race ? data.courses.get(race.courseId) : undefined;
    if (!s?.years?.length || !course) continue;
    const dist = distanceCategory(course.distance);
    const best = Math.max(...s.years.map((y) => winChance(byYear[y - 1][dist], course.ground === 2 ? byYear[y - 1].dirt : byYear[y - 1].turf)));
    total += 3 * n * best;
  }
  return total;
}

export interface AptitudeAdvice {
  key: "turf" | "dirt" | "short" | "mile" | "middle" | "long";
  /** Expected affinity the race plan would gain with this aptitude at A from the start. */
  gain: number;
  /** G1s her parents won on this surface or distance. */
  races: number;
}

/** What raising one surface/distance aptitude to A would add to the race plan, best first. */
export function aptitudeAdvice(data: GameData, card: Card, byYear: Aptitudes[], partners: (LineageMember | null)[], raceCost: number, plan: Schedule): AptitudeAdvice[] {
  const keys: AptitudeAdvice["key"][] = ["dirt", "turf", "short", "mile", "middle", "long"];
  const won = new Set(partners.flatMap((p) => p?.winSaddleIds ?? []));
  const out: AptitudeAdvice[] = [];
  for (const key of keys) {
    if (byYear.every((a) => a[key] >= GRADE_A)) continue;
    const raised = byYear.map((a) => ({ ...a, [key]: Math.max(a[key], GRADE_A) }));
    const gain = planSchedule(data, card, raised, partners, raceCost).expectedAffinity - plan.expectedAffinity;
    let races = 0;
    for (const id of won) {
      const s = data.saddles.get(id);
      const race = s?.type === 3 && s.raceId != null ? data.raceById.get(s.raceId) : undefined;
      const course = race ? data.courses.get(race.courseId) : undefined;
      if (!course) continue;
      if (key === "dirt" ? course.ground === 2 : key === "turf" ? course.ground !== 2 : distanceCategory(course.distance) === key) races++;
    }
    if (gain >= 1) out.push({ key, gain, races });
  }
  return out.sort((a, b) => b.gain - a.gain);
}
