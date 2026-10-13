import { EMPTY_EXTRAS, loadRaceExtras, type RaceExtras } from "./raceExtras";
import type { Card, Chara, Course, Factor, RawGameData, Saddle, Skill } from "./types";

/** Read-only indexed view over the generated game data. */
export class GameData {
  readonly meta: RawGameData["meta"];
  readonly charas = new Map<number, Chara>();
  readonly cards = new Map<number, Card>();
  readonly skills = new Map<number, Skill>();
  readonly factors = new Map<number, Factor>();
  readonly saddles = new Map<number, Saddle>();
  readonly courses = new Map<number, Course>();
  readonly tracks = new Map<number, string>();
  readonly races: RawGameData["races"];
  readonly relationPoints = new Map<number, number>();
  /** chara id -> relation groups (succession_relation_member.relation_type) it belongs to */
  readonly relationsByChara = new Map<number, number[]>();
  readonly relationRanks: [number, number, number][];
  /** Champions Meetings and course layouts from GameTora (empty when unavailable). */
  readonly extras: RaceExtras;

  constructor(raw: RawGameData, extras: RaceExtras = EMPTY_EXTRAS) {
    this.extras = extras;
    this.meta = raw.meta;
    for (const c of Object.values(raw.charas)) this.charas.set(c.id, c);
    for (const c of Object.values(raw.cards)) this.cards.set(c.id, c);
    for (const s of Object.values(raw.skills)) this.skills.set(s.id, s);
    for (const f of Object.values(raw.factors)) this.factors.set(f.id, f);
    for (const s of Object.values(raw.saddles)) this.saddles.set(s.id, s);
    for (const c of Object.values(raw.courses)) this.courses.set(c.id, c);
    for (const [id, name] of Object.entries(raw.tracks)) this.tracks.set(Number(id), name);
    for (const [type, pts] of Object.entries(raw.relations.points)) this.relationPoints.set(Number(type), pts);
    for (const [type, members] of Object.entries(raw.relations.members)) {
      for (const chara of members) {
        const list = this.relationsByChara.get(chara) ?? [];
        list.push(Number(type));
        this.relationsByChara.set(chara, list);
      }
    }
    this.races = raw.races;
    this.relationRanks = raw.relations.ranks;
  }

  charaIdOfCard(cardId: number): number | null {
    return this.cards.get(cardId)?.charaId ?? null;
  }

  charaName(charaId: number | null): string {
    if (charaId == null) return "Unknown";
    return this.charas.get(charaId)?.name ?? `Chara ${charaId}`;
  }

  cardLabel(cardId: number): string {
    const card = this.cards.get(cardId);
    return card ? `${card.title} ${card.name}`.trim() : `Card ${cardId}`;
  }

  private relationMemo = new Map<string, number>();

  /** Sum of relation points over every relation group containing all given characters. */
  relationSum(charaIds: number[]): number {
    if (charaIds.length === 0) return 0;
    const key = [...charaIds].sort((a, b) => a - b).join(",");
    const hit = this.relationMemo.get(key);
    if (hit !== undefined) return hit;
    const v = this.computeRelationSum(charaIds);
    this.relationMemo.set(key, v);
    return v;
  }

  private computeRelationSum(charaIds: number[]): number {
    const sets = charaIds.map((id) => new Set(this.relationsByChara.get(id) ?? []));
    let total = 0;
    for (const type of sets[0]) {
      if (sets.every((s) => s.has(type))) total += this.relationPoints.get(type) ?? 0;
    }
    return total;
  }

  /** succession_relation_rank: 1 = △, 2 = ○, 3 = ◎ */
  relationRank(value: number): number {
    for (const [rank, min, max] of this.relationRanks) if (value >= min && value <= max) return rank;
    return value < 0 ? 1 : (this.relationRanks.at(-1)?.[0] ?? 1);
  }
}

export async function loadGameData(url = `${import.meta.env.BASE_URL}data/game-data.json`): Promise<GameData> {
  const [res, extras] = await Promise.all([fetch(url), loadRaceExtras()]);
  if (!res.ok) throw new Error(`Could not load game data (${res.status} ${res.statusText})`);
  return new GameData((await res.json()) as RawGameData, extras);
}
