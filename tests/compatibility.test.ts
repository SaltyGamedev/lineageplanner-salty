import { describe, expect, it } from "vitest";
import { lineageCompat, sharedG1Wins } from "../src/domain/compatibility";
import type { Veteran } from "../src/domain/types";
import { realData, sampleVeterans, tinyData } from "./helpers";

describe("relation sums (verified tables)", () => {
  it("sums every group containing all characters", () => {
    const d = tinyData();
    expect(d.relationSum([1, 2])).toBe(8); // groups 10 + 20
    expect(d.relationSum([1, 2, 3])).toBe(3); // only group 20
    expect(d.relationSum([2, 3])).toBe(10); // 20 + 30
    expect(d.relationSum([1, 4])).toBe(0);
  });

  it("maps totals to ranks via succession_relation_rank", () => {
    const d = tinyData();
    expect(d.relationRank(50)).toBe(1);
    expect(d.relationRank(51)).toBe(2);
    expect(d.relationRank(151)).toBe(3);
  });

  it("matches values probed from master.mdb", () => {
    const d = realData();
    expect(d.relationSum([1001, 1002])).toBe(27); // Special Week – Silence Suzuka
    expect(d.relationSum([1001, 1007])).toBe(33); // Special Week – Gold Ship
    expect(d.relationSum([1001, 1002, 1010])).toBe(9);
  });
});

export const mkVet = (id: number, chara: number, saddles: number[], parents: [number, number[]][]): Veteran => ({
  trainedId: id, cardId: chara * 100 + 1, charaId: chara, factorIds: [], winSaddleIds: saddles,
  stats: { speed: 0, stamina: 0, power: 0, guts: 0, wiz: 0 },
  aptitudes: { turf: 7, dirt: 1, short: 1, mile: 1, middle: 7, long: 1, nige: 1, senko: 7, sashi: 1, oikomi: 1 },
  skillIds: [], rankScore: 0, runningStyle: 2, createdAt: "", isLocked: false, useType: 0,
  parents: parents.map(([c, s]) => ({ cardId: c * 100 + 1, charaId: c, factorIds: [], winSaddleIds: s })) as unknown as Veteran["parents"],
});

describe("affinity (uma.guide model)", () => {
  it("splits affinity per horse, with G1 wins ×3 and the parent pair", () => {
    const d = tinyData();
    const p1 = mkVet(1, 2, [1, 2, 3], [[3, [2, 3, 9]], [4, []]]);
    const p2 = mkVet(2, 3, [], [[1, []], [2, []]]);
    const l = lineageCompat(d, 1, p1, p2);
    // p1: rel(1,2)=8; gp1 rel(1,2,3)=3 + shared G1 {2}×3 = 6; gp2 0; pair rel(2,3)=10 → 24
    expect(l.parents[0]).toMatchObject({ affinity: 24, grandparents: [6, 0] });
    // p2: rel(1,3)=3; gp1 is the trainee's character → 0; gp2 rel(1,3,2)=3; pair 10 → 16
    expect(l.parents[1]).toMatchObject({ affinity: 16, grandparents: [0, 3] });
    // lineage total: 8 + 3 + trios (3 + 3) + pair 10
    expect(l.total).toBe(27);
  });

  it("counts only shared G1 wins", () => {
    const d = tinyData();
    const m = (w: number[]) => ({ cardId: 0, charaId: 1, factorIds: [], winSaddleIds: w });
    expect(sharedG1Wins(d, m([1, 2, 3, 9]), m([1, 3, 9, 9]))).toBe(2);
  });

  it("marks compatibility incomplete when a character is unknown", () => {
    const d = tinyData();
    const p1 = mkVet(1, 2, [], [[3, []], [4, []]]);
    p1.parents[0]!.charaId = null;
    expect(lineageCompat(d, 1, p1, mkVet(2, 3, [], [[1, []], [2, []]])).complete).toBe(false);
  });

  it("works on the real sample export", () => {
    const vets = sampleVeterans();
    const l = lineageCompat(realData(), 1001, vets[0], vets[1]);
    expect(l.total).toBeGreaterThan(0);
    expect(l.parents[0].affinity).toBeGreaterThanOrEqual(l.parents[0].grandparents[0]);
  });
});
