# How the planner ranks lineages

A lineage is the trainee plus **two veterans**. Each veteran brings its two recorded parents (the grandparents); they can't be chosen separately. The optimizer scores **every** valid pair:

* every pair of your own veterans;
* with **Rental** on: each own veteran × each friend's rental. The game allows one rental per career, so never two.

Game rules: a parent can't be the trainee's character, and the two parents must be different characters. Veterans you exclude on the Roster tab are skipped.

All chances below are **approximations** from the community model used by [uma.guide](https://uma.guide/roster-viewer/) (lineage planner and [parenting guide](https://uma.guide/guides/parenting-in-umamusume)). The game doesn't publish them.

## Goals and filters

* **Goals** are what you want the trainee to get: a skill hint (white or a unique skill's inherited version), a race spark, or an aptitude grade (for example Long S).
  * Pairs are ordered by the priority-weighted mean of the goals' **Inherit** chances, which is the same as ordering by the expected number of goals passed on. A goal marked **!** counts ×3; aptitude goals start at ×3.
  * Without goals, pairs are ranked by affinity.
  * Next to the order, the planner shows combined chances, which are small when you pick many goals. Goals roll independently, so they multiply:
    * **All inherited** = Π Inherit %.
    * **All sparks** = Π Spark % over the goals that have one (it assumes the trainee also learns those skills).
    * **Hits / Expected** = Σ Inherit %, for example 5.2 of 8.
* **Spark filters** set a minimum total ★ of a blue, pink or green spark across the six inherited horses. Pairs below it are dropped. If no pair passes, the best ones are shown and flagged.
* The **tier list** (`src/domain/tiers.ts`, from a community parenting sheet) is reference only. It is shown in the pickers, and "Suggest from tier list" adds the top tiers your roster carries.

## Affinity

Relation groups and points are read from the game data (`succession_relation*`). Per horse, following uma.guide's planner:

```
parent P (other parent Q, grandparents G1, G2):
  rel(T,P) + rel(T,P,G1) + rel(T,P,G2) + race(P,G1) + race(P,G2) + rel(P,Q) + race(P,Q)
grandparent G of P:
  rel(T,P,G) + race(P,G)
lineage total (◎○△):
  rel(T,P1) + rel(T,P2) + Σ rel(T,P,G) + rel(P1,P2)
```

`rel(...)` sums the points of every relation group that contains all the listed characters. `race(A,B)` = 3 × the G1 races both horses won. A horse of the trainee's own character adds nothing.

## Inheritance (Inherit %)

Chance per inspiration = base × (1 + affinity / 100), capped at 100%:

| Spark | ★1 | ★2 | ★3 |
|---|---|---|---|
| Blue | 70% | 80% | 90% |
| Pink | 1% | 3% | 5% |
| Green | 5% | 10% | 15% |
| White / scenario | 3% | 6% | 9% |
| Race | 1% | 2% | 3% |

There are two inspirations per career. For skill and race goals, Inherit = 1 − Π(1 − p)² over every matching spark of the six horses.

**Aptitude goals:** pink ★ of that aptitude across the six horses raise the starting grade (≥1★ +1, ≥4★ +2, ≥7★ +3, ≥10★ +4, never above A). Each pink proc at an inspiration then adds one grade. Inherit = chance of at least the needed number of procs.

## Spark generation (Spark %)

The chance that your trainee generates the white or race spark itself, if it learns the skill or wins the race: base × 1.1ⁿ, where n is the number of the six horses carrying that spark.
* Skill base: 20% for ○, 25% for ◎, 40% for gold. Click the ○/◎/G mark on a goal to choose which version your trainee buys.
* Race base: 20%.
* Unique skills and aptitudes have no Spark %.

## Race fit

The goal picker marks skills that target the selected race ("race ✓") or can't trigger in it (✗). This comes from the skill's activation conditions (`src/domain/conditions.ts`), evaluated against the style, distance, surface, ground, season, weather, course, direction and slopes. Race details come from GameTora's Champions Meeting schedule and course layouts.
