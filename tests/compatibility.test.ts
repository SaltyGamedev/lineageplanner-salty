import { describe, expect, it } from "vitest";
import { lineageCompat, sharedG1Wins } from "../src/domain/compatibility";
import { mkVet, realData, sampleVeterans, tinyData } from "./helpers";

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


describe("affinity (uma.guide model)", () => {
  it("reproduces uma.guide's numbers for a real lineage", async () => {
    // Special Week ← Mejiro Ryan (Oguri Cap, Mayano Top Gun) × T.M. Opera O (Oguri Cap, Agnes Digital).
    // uma.guide shows 350 / 156 / 174 / 56 56 52 67. Agnes Digital is 70 here: uma.guide's saddle table
    // has no Kawasaki Kinen (a G1 both won), so it counts one shared G1 fewer (3 points).
    const d = realData();
    const id = (name: string) => [...d.charas.values()].find((c) => c.name === name)!.id;
    const ryan = mkVet(1, id("Mejiro Ryan"), [], [[id("Oguri Cap"), []], [id("Mayano Top Gun"), []]]);
    const op = mkVet(2, id("T.M. Opera O"), [], [[id("Oguri Cap"), []], [id("Agnes Digital"), []]]);
    const l = lineageCompat(d, 1001, ryan, op);
    // Without shared wins only the relation terms remain.
    expect(l.parents[0].own).toBe(26 + 19);
    expect(l.parents[1].own).toBe(35 + 19);
    expect(l.parents[0].grandparents).toEqual([23, 17]);
    expect(l.parents[1].grandparents).toEqual([19, 19]);
    expect(l.total).toBe(26 + 35 + 23 + 17 + 19 + 19 + 19);
  });

  it("splits affinity per horse, with G1 wins ×3 and the parent pair", () => {
    const d = tinyData();
    const p1 = mkVet(1, 2, [1, 2, 3], [[3, [2, 3, 9]], [4, []]]);
    const p2 = mkVet(2, 3, [], [[1, []], [2, []]]);
    const l = lineageCompat(d, 1, p1, p2);
    // p1: rel(1,2)=8; gp1 rel(1,2,3)=3 + shared G1 {2}×3 = 6; gp2 0; pair rel(2,3)=10 → 24; own = 24 − trios 3
    expect(l.parents[0]).toMatchObject({ affinity: 24, own: 21, grandparents: [6, 0] });
    // p2: rel(1,3)=3; gp1 is the trainee's character → 0; gp2 rel(1,3,2)=3; pair 10 → 16; own = 16 − 3
    expect(l.parents[1]).toMatchObject({ affinity: 16, own: 13, grandparents: [0, 3] });
    // lineage total: 8 + 3 + trios (3 + 3) + pair 10 + G1 race bonuses (3)
    expect(l.total).toBe(30);
  });

  it("counts only shared G1 wins, each once (current Global rules since 24 June 2026)", () => {
    const d = tinyData();
    const m = (w: number[]) => ({ cardId: 0, charaId: 1, factorIds: [], winSaddleIds: w });
    expect(sharedG1Wins(d, m([]), m([1]))).toBe(0);
    expect(sharedG1Wins(d, m([1]), m([1]))).toBe(1);
    expect(sharedG1Wins(d, m([1, 2, 3, 9]), m([1, 3, 9, 9]))).toBe(2); // duplicate 9 counts once
    // Regression: G2/G3 and titles no longer add compatibility.
    expect(sharedG1Wins(d, m([3, 4, 5]), m([3, 4, 5]))).toBe(0);
  });

  it("counts parent-to-parent G1 overlap", () => {
    const d = tinyData();
    const a = mkVet(1, 2, [1, 2], [[4, []], [4, []]]);
    const b = mkVet(2, 3, [1, 2], [[4, []], [4, []]]);
    const c = mkVet(3, 3, [], [[4, []], [4, []]]);
    const shared = lineageCompat(d, 1, a, b);
    const none = lineageCompat(d, 1, a, c);
    expect(shared.total - none.total).toBe(2 * 3);
    expect(shared.parents[0].affinity - none.parents[0].affinity).toBe(2 * 3);
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
