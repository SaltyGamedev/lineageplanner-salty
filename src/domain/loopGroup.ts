// Fixed loops: a group of umas trained in rotation, each one from two others,
// all running the same G1s.
//
// Why 4: the trainee's lineage has two parents and four grandparents, and a
// grandparent of the trainee's own character adds nothing (no relation, no
// race bonus). With 4 umas the trainee T can take parents P1, P2 whose own
// parents are (P2, X) and (P1, X), X the fourth uma: every slot is another
// loop member. With 3, two grandparent slots are T herself.
//
// Why the same races: a shared G1 is +3 for each of the 5 race pairs of the
// lineage (each parent with its two grandparents, and the two parents). In the
// 4-loop those pairs are P1–P2 three times and P1–X, P2–X once, so a G1 that
// every member wins adds 15 affinity to every run.

import { lineageCompat } from "./compatibility";
import type { GameData } from "./gameData";
import { planRaces, RACE_PLANS, type ScheduledRace } from "./loop";
import { usable, validPair, type Constraints } from "./optimizer";
import { ACTIVE_RULES } from "./rules";
import type { Card, PlannerConfig, Veteran } from "./types";

const RULES = ACTIVE_RULES.independentTraining;

export interface GroupMember {
  card: Card;
  races: ScheduledRace[];
  /** G1 saddle -> chance she wins it in her plan. */
  wins: Map<number, number>;
}

export interface GroupRun {
  trainee: Card;
  parents: [Card, Card];
  /** The member whose horses are the other grandparents (null in a 3-loop). */
  fourth: Card | null;
  relations: number;
  races: number;
  total: number;
}

export interface LoopGroup {
  members: GroupMember[];
  runs: GroupRun[];
  /** Mean lineage affinity of a run once the loop is going. */
  affinity: number;
  relations: number;
  races: number;
  /** Mean race affinity with the same number of races but schedules that don't line up (the comparison). */
  independentRaces: number;
  /** G1s every member plans to run. */
  sharedG1s: number;
}

/** Expected G1s two members both win. */
const shared = (a: GroupMember, b: GroupMember) => {
  let s = 0;
  for (const [id, p] of a.wins) s += p * (b.wins.get(id) ?? 0);
  return s;
};

const winsOf = (races: ScheduledRace[]) => {
  const m = new Map<number, number>();
  for (const r of races) if (r.saddleId != null) m.set(r.saddleId, Math.max(m.get(r.saddleId) ?? 0, r.win));
  return m;
};

/** A stand-in veteran for the relation part of the affinity formula (no race wins: those are added as expectations). */
const stub = (chara: number, parents: (number | null)[]): Veteran =>
  ({ charaId: chara, cardId: 0, factorIds: [], winSaddleIds: [], parents: parents.map((c) => (c == null ? null : { charaId: c, cardId: 0, factorIds: [], winSaddleIds: [] })) }) as unknown as Veteran;

/**
 * The best run for `t` once the loop is going: parents from the others, their
 * parents from the rest of the group. Relations come from the game's relation
 * tables, races from the members' plans (3 per expected shared G1 and pair).
 */
function bestRun(data: GameData, t: GroupMember, others: GroupMember[]): GroupRun {
  let best: GroupRun | null = null;
  const options: [GroupMember, GroupMember, GroupMember | null][] = [];
  if (others.length === 2) options.push([others[0], others[1], null]);
  else for (let x = 0; x < others.length; x++) {
    const rest = others.filter((_, i) => i !== x);
    options.push([rest[0], rest[1], others[x]]);
  }
  for (const [p1, p2, x] of options) {
    const c = (m: GroupMember | null) => m?.card.charaId ?? null;
    // P1's parents: P2 and X (or T in a 3-loop); P2's: P1 and X.
    const gp = x ?? t;
    const compat = lineageCompat(data, t.card.charaId, stub(p1.card.charaId, [c(p2), c(gp)]), stub(p2.card.charaId, [c(p1), c(gp)]));
    const pp = shared(p1, p2);
    const races = 3 * (3 * pp + (x ? shared(p1, x) + shared(p2, x) : 0));
    const run: GroupRun = { trainee: t.card, parents: [p1.card, p2.card], fourth: x?.card ?? null, relations: compat.total, races, total: compat.total + races };
    if (!best || run.total > best.total) best = run;
  }
  return best!;
}

function score(data: GameData, members: GroupMember[]) {
  const runs = members.map((t) => bestRun(data, t, members.filter((m) => m !== t)));
  const mean = (f: (r: GroupRun) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  return { runs, affinity: mean((r) => r.total), relations: mean((r) => r.relations), races: mean((r) => r.races) };
}

/**
 * Plans one race schedule per member so they share as many G1 wins as they
 * can: each member values a G1 by how likely the others are to win it too,
 * and plans again until the plans settle (career goals stay fixed, the
 * back-to-back penalty applies, every extra race must beat `raceCost`).
 * Members race with their base aptitudes; pink sparks in the loop only help.
 */
export function planGroup(data: GameData, cards: Card[], raceCost: number = RULES.extraRaceCost): LoopGroup {
  // What each member could win of every G1 (no penalty): the others value a G1 by this.
  const could = cards.map((card) => winsOf(planRaces(data, card, card.aptitudes, () => 1, 0).races));
  const members: GroupMember[] = cards.map((card, i) => {
    const weight = (saddle: number | null) => (saddle == null ? 0 : could.reduce((a, w, j) => a + (j === i ? 0 : (w.get(saddle) ?? 0)), 0));
    const races = planRaces(data, card, card.aptitudes, weight, raceCost).races;
    return { card, races, wins: winsOf(races) };
  });
  const s = score(data, members);
  const all = members[0] ? [...members[0].wins.keys()].filter((id) => members.every((m) => (m.wins.get(id) ?? 0) > 0)) : [];
  return { members, ...s, independentRaces: unalignedRaces(data, members, could), sharedG1s: all.length };
}

/**
 * The comparison for "same schedule": each member keeps her goal races and the
 * same number of extra G1s, but picks them at random among the G1s she can win
 * (mean of a few fixed draws), so the schedules don't line up.
 */
function unalignedRaces(data: GameData, members: GroupMember[], could: Map<number, number>[]): number {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const draws = 12;
  let total = 0;
  for (let d = 0; d < draws; d++) {
    const shuffled = members.map((m, i) => {
      const goals = m.races.filter((r) => r.goal && r.saddleId != null);
      const extra = m.races.length - goals.length;
      const pool = [...could[i].entries()].filter(([id]) => !goals.some((g) => g.saddleId === id));
      for (let k = pool.length - 1; k > 0; k--) {
        const j = Math.floor(rand() * (k + 1));
        [pool[k], pool[j]] = [pool[j], pool[k]];
      }
      const wins = new Map<number, number>(goals.map((g) => [g.saddleId!, g.win]));
      for (const [id, p] of pool.slice(0, extra)) wins.set(id, p);
      return { card: m.card, races: [], wins };
    });
    total += score(data, shuffled).races;
  }
  return total / draws;
}

function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i < items.length; i++) yield* combinations(items, k, i + 1, [...acc, items[i]]);
}

/** Every group of `size` loop umas (different characters), best mean affinity first. */
export function bestGroups(data: GameData, loopCards: number[], { size = 4, raceCost = RACE_PLANS[1].cost, limit = 10 } = {}): LoopGroup[] {
  const cards = loopCards.map((id) => data.cards.get(id)).filter((c): c is Card => !!c);
  const out: LoopGroup[] = [];
  for (const group of combinations(cards, size)) {
    if (new Set(group.map((c) => c.charaId)).size < size) continue;
    out.push(planGroup(data, group, raceCost));
  }
  return out.sort((a, b) => b.affinity - a.affinity).slice(0, limit);
}

/** A run you can start now: a group member trained from two of your veterans of the other members. */
export interface StartRun {
  trainee: Card;
  p1: Veteran;
  p2: Veteran;
  /** Lineage affinity of this run, with the veterans' real parents and G1 wins. */
  affinity: number;
  /** Grandparents that are other loop umas too (4 once the loop is going). */
  inLoop: number;
}

/**
 * The best runs to start the group with the veterans you have: any member as
 * the trainee, parents among your veterans (and rentals) of the other members,
 * scored with their real parents and wins. Her own race plan in the group
 * makes her a parent the next runs share G1s with.
 */
export function startRuns(
  group: LoopGroup,
  data: GameData,
  own: Veteran[],
  rentals: Veteran[],
  config: PlannerConfig,
  constraints: Constraints,
  limit = 5,
): StartRun[] {
  const charas = new Set(group.members.map((m) => m.card.charaId));
  const out: StartRun[] = [];
  for (const { card: t } of group.members) {
    const ok = (v: Veteran) => v.charaId != null && charas.has(v.charaId) && usable(v, t.charaId, config, constraints);
    const mine = own.filter(ok);
    const rent = config.useBorrow ? rentals.filter(ok) : [];
    const consider = (p1: Veteran, p2: Veteran) => {
      if (!validPair(p1, p2)) return;
      const inLoop = [...p1.parents, ...p2.parents].filter((g) => g?.charaId != null && g.charaId !== t.charaId && charas.has(g.charaId)).length;
      out.push({ trainee: t, p1, p2, affinity: lineageCompat(data, t.charaId, p1, p2).total, inLoop });
    };
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) consider(mine[i], mine[j]);
      for (const r of rent) consider(mine[i], r);
    }
  }
  return out.sort((a, b) => b.affinity - a.affinity || b.inLoop - a.inLoop).slice(0, limit);
}
