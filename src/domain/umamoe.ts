// Optional lookup of a friend's current rental on uma.moe
// (https://uma.moe/api/docs). Needs the user's own uma.moe API key, sent as
// X-API-Key directly from the browser; nothing passes through this site.
// Field names follow uma.moe's inheritance records.

import type { GameData } from "./gameData";
import type { LineageMember, Veteran } from "./types";

type Json = Record<string, unknown>;

const ids = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && x > 0) : typeof v === "number" && v > 0 ? [v] : [];

function sparks(inh: Json, side: "main" | "left" | "right"): number[] {
  return ["blue", "pink", "green", "white"].flatMap((c) => ids(inh[`${side}_${c}_factors`]));
}

function memberOf(data: GameData, cardId: unknown, factorIds: number[], saddles: unknown): LineageMember | null {
  if (typeof cardId !== "number" || cardId <= 0) return null;
  return { cardId, charaId: data.charaIdOfCard(cardId), factorIds, winSaddleIds: ids(saddles) };
}

/** Converts one uma.moe search record into a borrowable veteran. */
export function rentalFromRecord(data: GameData, record: Json, trainerId: string, syntheticId: number): Veteran | null {
  const inh = record.inheritance as Json | undefined;
  if (!inh) return null;
  const main = memberOf(data, inh.main_parent_id, sparks(inh, "main"), inh.main_win_saddles);
  if (!main) return null;
  const seenAt = typeof record.last_updated === "string" ? record.last_updated : new Date().toISOString();
  return {
    ...main,
    trainedId: syntheticId,
    stats: { speed: 0, stamina: 0, power: 0, guts: 0, wiz: 0 },
    aptitudes: { turf: 0, dirt: 0, short: 0, mile: 0, middle: 0, long: 0, nige: 0, senko: 0, sashi: 0, oikomi: 0 },
    skillIds: [],
    rankScore: 0,
    runningStyle: 0,
    createdAt: seenAt,
    isLocked: false,
    useType: 0,
    parents: [
      memberOf(data, inh.parent_left_id, sparks(inh, "left"), inh.left_win_saddles),
      memberOf(data, inh.parent_right_id, sparks(inh, "right"), inh.right_win_saddles),
    ],
    borrowed: {
      trainerId,
      trainerName: typeof record.trainer_name === "string" ? record.trainer_name : undefined,
      source: "uma.moe",
      seenAt,
    },
  };
}

export async function fetchRental(data: GameData, trainerId: string, apiKey: string, syntheticId: number): Promise<Veteran> {
  const id = trainerId.replace(/\D/g, "");
  if (!id) throw new Error("Enter a trainer ID (numbers only).");
  const url = `https://uma.moe/api/v3/search?search_type=inheritance&limit=1&max_follower_num=1000&trainer_id=${id}`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (res.status === 401 || res.status === 403) throw new Error("uma.moe refused the request: check your API key.");
  if (!res.ok) throw new Error(`uma.moe request failed (${res.status}).`);
  const body = (await res.json()) as { items?: Json[] };
  const record = body.items?.[0];
  const v = record ? rentalFromRecord(data, record, id, syntheticId) : null;
  if (!v) throw new Error("No rental found for this trainer ID.");
  return v;
}
