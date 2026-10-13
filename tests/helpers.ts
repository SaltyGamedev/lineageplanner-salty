import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GameData } from "../src/domain/gameData";
import { parseExport } from "../src/domain/importer";
import type { RaceExtras } from "../src/domain/raceExtras";
import type { RawGameData } from "../src/domain/types";

let cached: GameData | null = null;

/** The real generated data set committed in public/data. */
export function realData(): GameData {
  cached ??= new GameData(
    JSON.parse(readFileSync(resolve(__dirname, "../public/data/game-data.json"), "utf8")) as RawGameData,
    JSON.parse(readFileSync(resolve(__dirname, "../public/data/race-extras.json"), "utf8")) as RaceExtras,
  );
  return cached;
}

export function sampleExport(): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, "fixtures/umaextractor-sample.json"), "utf8"));
}

export function sampleVeterans() {
  return parseExport(sampleExport(), realData(), "sample").veterans;
}

/** Minimal synthetic data set for formula-level tests. */
export function tinyData(): GameData {
  const raw: RawGameData = {
    meta: { schema: 1, generatedAt: "", source: "test", mdbSha256: "" },
    charas: { 1: { id: 1, name: "A", color: null }, 2: { id: 2, name: "B", color: null }, 3: { id: 3, name: "C", color: null }, 4: { id: 4, name: "D", color: null } },
    cards: {},
    skills: {},
    factors: {},
    relations: {
      points: { 10: 5, 20: 3, 30: 7 },
      members: { 10: [1, 2], 20: [1, 2, 3], 30: [2, 3] },
      ranks: [[1, 0, 50], [2, 51, 150], [3, 151, 9999]],
    },
    saddles: {
      1: { id: 1, name: "G1 a", type: 3 }, 2: { id: 2, name: "G1 b", type: 3 },
      3: { id: 3, name: "G3", type: 1 }, 9: { id: 9, name: "G1 c", type: 3 },
    },
    tracks: {},
    courses: {},
    races: [],
  };
  return new GameData(raw);
}
