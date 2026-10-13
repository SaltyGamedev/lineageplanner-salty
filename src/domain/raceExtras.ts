// Race details that master.mdb does not carry, from GameTora's public data
// (scripts/ingest/fetch_gametora.py): the Champions Meeting schedule and which
// course layouts have uphill / downhill sections.

import type { GameData } from "./gameData";

export interface ChampionsMeeting {
  id: number;
  name: string;
  /** Unix seconds. */
  start: number;
  end: number;
  trackId: number;
  distance: number;
  /** 1 = turf, 2 = dirt */
  ground: number;
  /** 1 good … 4 bad */
  groundCondition: number | null;
  /** 1 spring, 2 summer, 3 autumn, 4 winter (5 = cherry blossom) */
  season: number | null;
  /** 1 sunny, 2 cloudy, 3 rainy, 4 snowy */
  weather: number | null;
  turn: number | null;
}

export interface CourseExtras {
  up: boolean;
  down: boolean;
  corners: number;
  length?: number;
  cornerSpans?: [number, number][];
  straightSpans?: [number, number][];
  /** [start, end, gradient × 10000] */
  slopeSpans?: [number, number, number][];
}

export interface RaceExtras {
  meta: { source: string; fetchedAt: string; files: string[] };
  championsMeetings: ChampionsMeeting[];
  courses: Record<string, CourseExtras>;
}

export const EMPTY_EXTRAS: RaceExtras = {
  meta: { source: "unavailable", fetchedAt: "", files: [] },
  championsMeetings: [],
  courses: {},
};

export const SEASONS: Record<number, string> = { 1: "Spring", 2: "Summer", 3: "Autumn", 4: "Winter", 5: "Spring (cherry blossom)" };
export const WEATHERS: Record<number, string> = { 1: "Sunny", 2: "Cloudy", 3: "Rainy", 4: "Snowy" };

/** The race_course_set id matching a meeting's track, distance and surface. */
export function meetingCourseId(data: GameData, cm: ChampionsMeeting): number | null {
  for (const c of data.courses.values()) {
    if (c.trackId === cm.trackId && c.distance === cm.distance && c.ground === cm.ground) return c.id;
  }
  return null;
}

/** The meeting running now, else the next one, else the most recent. */
export function defaultMeeting(extras: RaceExtras, now = Date.now() / 1000): ChampionsMeeting | null {
  const list = extras.championsMeetings;
  return list.find((m) => m.end >= now) ?? list.at(-1) ?? null;
}

export function meetingStatus(cm: ChampionsMeeting, now = Date.now() / 1000): "live" | "upcoming" | "past" {
  return now < cm.start ? "upcoming" : now > cm.end ? "past" : "live";
}

export async function loadRaceExtras(url = `${import.meta.env.BASE_URL}data/race-extras.json`): Promise<RaceExtras> {
  try {
    const res = await fetch(url);
    if (!res.ok) return EMPTY_EXTRAS;
    return (await res.json()) as RaceExtras;
  } catch {
    // The planner works without these details; slope/season/weather skills are then "depends on".
    return EMPTY_EXTRAS;
  }
}
