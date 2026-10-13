import { describe, expect, it } from "vitest";
import { lineageCompat, parentCompat, sharedWins } from "../src/domain/compatibility";
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
    expect(d.relationRank(0)).toBe(1);
    expect(d.relationRank(50)).toBe(1);
    expect(d.relationRank(51)).toBe(2);
    expect(d.relationRank(151)).toBe(3);
  });

  it("matches values probed from master.mdb", () => {
    const d = realData();
    expect(d.relationSum([1001, 1002])).toBe(27); // Special Week – Silence Suzuka
    expect(d.relationSum([1001, 1007])).toBe(33); // Special Week – Gold Ship (checked with SQL)
    expect(d.relationSum([1001, 1002, 1010])).toBe(9); // SW – Suzuka – Taiki Shuttle (checked with SQL)
    expect(d.relationSum([1001, 1002, 1014])).toBe(16); // SW – Suzuka – El Condor Pasa
  });
});

describe("lineage compatibility (approximation formula)", () => {
  const mk = (id: number, chara: number, saddles: number[], parents: [number, number[]][]): Veteran => ({
    trainedId: id, cardId: chara * 100 + 1, charaId: chara, factorIds: [], winSaddleIds: saddles,
    stats: { speed: 0, stamina: 0, power: 0, guts: 0, wiz: 0 },
    aptitudes: { turf: 7, dirt: 1, short: 1, mile: 1, middle: 7, long: 1, nige: 1, senko: 7, sashi: 1, oikomi: 1 },
    skillIds: [], rankScore: 0, runningStyle: 2, createdAt: "", isLocked: false, useType: 0,
    parents: parents.map(([c, s]) => ({ cardId: c * 100 + 1, charaId: c, factorIds: [], winSaddleIds: s })) as unknown as Veteran["parents"],
  });

  it("combines pair, trios, shared wins and the parent pair", () => {
    const d = tinyData();
    const p1 = mk(1, 2, [1, 2, 3], [[3, [2, 3, 9]], [4, []]]);
    const p2 = mk(2, 3, [], [[1, []], [2, []]]);
    const a = parentCompat(d, 1, p1);
    // rel(1,2)=8, rel(1,2,3)=3, wins(p1,g1)=2, rel(1,2,4)=0, wins=0
    expect(a.total).toBe(13);
    const b = parentCompat(d, 1, p2);
    // rel(1,3)=3, rel(1,3,1)=3 (dup chara is a set member), rel(1,3,2)=3
    expect(b.total).toBe(9);
    const l = lineageCompat(d, 1, p1, p2);
    expect(l.parentPair.value).toBe(10);
    expect(l.total).toBe(13 + 9 + 10);
    expect(l.complete).toBe(true);
  });

  it("marks compatibility incomplete when a character is unknown", () => {
    const d = tinyData();
    const p1 = mk(1, 2, [], [[3, []], [4, []]]);
    p1.parents[0]!.charaId = null;
    const l = lineageCompat(d, 1, p1, mk(2, 3, [], [[1, []], [2, []]]));
    expect(l.complete).toBe(false);
  });

  it("counts shared win saddles once each", () => {
    expect(sharedWins({ cardId: 0, charaId: 1, factorIds: [], winSaddleIds: [1, 2, 2, 5] }, { cardId: 0, charaId: 2, factorIds: [], winSaddleIds: [2, 5, 5, 7] })).toBe(2);
  });

  it("works on the real sample export", () => {
    const vets = sampleVeterans();
    const opera = vets.find((v) => v.trainedId === 2292)!;
    const res = parentCompat(realData(), 1001, opera);
    expect(res.terms).toHaveLength(5);
    expect(res.total).toBeGreaterThan(0);
  });
});
