// Parser for UmaExtractor exports (https://github.com/SaltyGamedev/UmaExtractor-salty).
// The export is the game's `trained_chara_array` dumped to JSON. Only the
// fields the planner uses are read; everything else is ignored.

import type { GameData } from "./gameData";
import type { Aptitudes, ImportResult, LineageMember, Veteran } from "./types";

/** succession_chara_array positions: 10/20 are the veteran's parents; 11,12,21,22 their parents. */
export const PARENT_POSITIONS = [10, 20] as const;

type Json = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map(num).filter((x): x is number => x !== null) : [];
}

function factorIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => (f && typeof f === "object" ? num((f as Json).factor_id) : num(f)))
    .filter((x): x is number => x !== null);
}

function aptitudes(r: Json): Aptitudes {
  const g = (k: string) => num(r[k]) ?? 0;
  return {
    turf: g("proper_ground_turf"),
    dirt: g("proper_ground_dirt"),
    short: g("proper_distance_short"),
    mile: g("proper_distance_mile"),
    middle: g("proper_distance_middle"),
    long: g("proper_distance_long"),
    nige: g("proper_running_style_nige"),
    senko: g("proper_running_style_senko"),
    sashi: g("proper_running_style_sashi"),
    oikomi: g("proper_running_style_oikomi"),
  };
}

function member(raw: Json, data: GameData): LineageMember {
  const cardId = num(raw.card_id) ?? 0;
  return {
    cardId,
    charaId: num(raw.chara_id) ?? data.charaIdOfCard(cardId),
    factorIds: factorIds(raw.factor_info_array ?? raw.factor_id_array),
    winSaddleIds: numArray(raw.win_saddle_id_array),
    rarity: num(raw.rarity) ?? undefined,
    rank: num(raw.rank) ?? undefined,
  };
}

export class ImportError extends Error {}

/** Accepts the parsed JSON (array, or an object wrapping `trained_chara_array`). */
export function parseExport(input: unknown, data: GameData, sourceName = "export"): ImportResult {
  const list = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as Json).trained_chara_array)
      ? ((input as Json).trained_chara_array as unknown[])
      : null;
  if (!list) throw new ImportError("This file is not an UmaExtractor export: expected a list of trained characters.");

  const warnings: string[] = [];
  const veterans: Veteran[] = [];
  const unknownCards = new Set<number>();
  const unknownFactors = new Set<number>();
  const seen = new Set<number>();

  list.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      warnings.push(`Entry ${idx} is not an object and was skipped.`);
      return;
    }
    const r = entry as Json;
    const trainedId = num(r.trained_chara_id);
    const cardId = num(r.card_id);
    if (trainedId === null || cardId === null) {
      warnings.push(`Entry ${idx} has no trained_chara_id/card_id and was skipped.`);
      return;
    }
    if (seen.has(trainedId)) {
      warnings.push(`Duplicate veteran ${trainedId} skipped.`);
      return;
    }
    seen.add(trainedId);

    const base = member(r, data);
    const parentsRaw = Array.isArray(r.succession_chara_array) ? (r.succession_chara_array as Json[]) : [];
    const parents = PARENT_POSITIONS.map((pos) => {
      const p = parentsRaw.find((x) => x && num(x.position_id) === pos);
      return p ? member(p, data) : null;
    }) as [LineageMember | null, LineageMember | null];
    if (parents.some((p) => p === null)) warnings.push(`Veteran ${trainedId}: parent data missing in export.`);

    for (const m of [base, ...parents]) {
      if (!m) continue;
      if (!data.cards.has(m.cardId)) unknownCards.add(m.cardId);
      for (const f of m.factorIds) if (!data.factors.has(f)) unknownFactors.add(f);
    }

    const skillIds = Array.isArray(r.skill_array)
      ? (r.skill_array as Json[]).map((s) => num(s?.skill_id)).filter((x): x is number => x !== null)
      : [];

    veterans.push({
      ...base,
      trainedId,
      stats: {
        speed: num(r.speed) ?? 0,
        stamina: num(r.stamina) ?? 0,
        power: num(r.power) ?? 0,
        guts: num(r.guts) ?? 0,
        wiz: num(r.wiz) ?? 0,
      },
      aptitudes: aptitudes(r),
      skillIds,
      rankScore: num(r.rank_score) ?? 0,
      runningStyle: num(r.running_style) ?? 0,
      createdAt: typeof r.create_time === "string" ? r.create_time : "",
      isLocked: num(r.is_locked) === 1,
      useType: num(r.use_type) ?? 0,
      parents,
    });
  });

  if (unknownCards.size)
    warnings.push(`Cards not in the current game data (data may be outdated): ${[...unknownCards].join(", ")}.`);
  if (unknownFactors.size)
    warnings.push(`Sparks not in the current game data are ignored in scoring: ${[...unknownFactors].join(", ")}.`);
  if (veterans.length === 0) throw new ImportError("No usable veterans found in this file.");

  return { veterans, warnings, importedAt: new Date().toISOString(), sourceName };
}
