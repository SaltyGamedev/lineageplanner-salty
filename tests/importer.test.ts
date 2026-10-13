import { describe, expect, it } from "vitest";
import { ImportError, parseExport } from "../src/domain/importer";
import { realData, sampleExport } from "./helpers";

describe("UmaExtractor import", () => {
  it("parses veterans with their fixed parents", () => {
    const { veterans, warnings } = parseExport(sampleExport(), realData(), "s");
    expect(veterans).toHaveLength(5);
    const opera = veterans.find((v) => v.trainedId === 2292)!;
    expect(opera.charaId).toBe(1015);
    expect(opera.parents.map((p) => p?.cardId)).toEqual([100701, 106901]); // positions 10 and 20 only
    expect(opera.factorIds).toContain(10150201);
    expect(opera.winSaddleIds).toEqual([6, 10, 11, 12, 13, 14, 18, 34]);
    expect(opera.aptitudes.middle).toBe(7);
    expect(opera.stats.wiz).toBe(1268);
    expect(warnings.filter((w) => w.includes("parent data missing"))).toHaveLength(0);
  });

  it("keeps use_type for non-standard entries", () => {
    const { veterans } = parseExport(sampleExport(), realData());
    expect(veterans.find((v) => v.trainedId === 3869)!.useType).toBe(1);
  });

  it("accepts a wrapped trained_chara_array", () => {
    const { veterans } = parseExport({ trained_chara_array: sampleExport() }, realData());
    expect(veterans).toHaveLength(5);
  });

  it("warns about missing parents and unknown ids instead of failing", () => {
    const data = [
      { trained_chara_id: 1, card_id: 999901, factor_info_array: [{ factor_id: 123 }], succession_chara_array: [] },
    ];
    const { veterans, warnings } = parseExport(data, realData());
    expect(veterans[0].parents).toEqual([null, null]);
    expect(veterans[0].charaId).toBeNull();
    expect(warnings.join(" ")).toMatch(/parent data missing/);
    expect(warnings.join(" ")).toMatch(/999901/);
    expect(warnings.join(" ")).toMatch(/123/);
  });

  it("rejects files that are not exports", () => {
    expect(() => parseExport({ foo: 1 }, realData())).toThrow(ImportError);
    expect(() => parseExport([], realData())).toThrow(ImportError);
  });

  it("skips duplicates and malformed entries", () => {
    const one = (sampleExport() as unknown[])[0];
    const { veterans, warnings } = parseExport([one, one, 5, {}], realData());
    expect(veterans).toHaveLength(1);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
});
