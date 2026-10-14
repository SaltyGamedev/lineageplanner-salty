# How the planner ranks lineages

A lineage is the trainee plus **two veterans**. Each veteran brings its two recorded parents (the grandparents); they can't be chosen separately. The optimizer scores **every** valid pair:

* every pair of your own veterans;
* with **Rental** on: each own veteran × each friend's rental. The game allows one rental per career, so never two.

Game rules: a parent can't be the trainee's character, and the two parents must be different characters. Veterans you exclude on the Roster tab are skipped.

All chances below are **approximations**. The game doesn't publish them.

## Rule set: Global, as of 14 October 2026

Only mechanics live on the **Global** server are used. JP-only content (skills, scenarios, mechanics) and superseded rules are left out on purpose. The game data comes from the Global `master.mdb`, so a JP-only skill can't enter a recommendation.

| Rule | Effective | Evidence | Source |
|---|---|---|---|
| Relation groups and points, ◎○△ thresholds | – | **Confirmed** (game data) | Global `master.mdb` |
| Shared G1 wins: +3 each, counted once, parent-to-parent overlap counts; G2/G3 and titles don't | 24 Jun 2026 (Global compatibility overhaul) | **Confirmed** (patch notes as reported) | [Crazyfellow's guide](https://docs.google.com/document/d/1Q3IJKbtkplmuY-PAJMNjYiLtasv0eU0aIBEqp8_C3tg/edit), ch. 1 |
| Per-horse affinity split (parent vs grandparent links) | – | **Strong empirical finding** | uma.guide planner; Crazyfellow ch. 1 |
| Inheritance odds = base × (1 + affinity/100), base table below | – | **Strong empirical finding** (patent formula, tested by Polaris) | Crazyfellow, bonus chapter |
| Spark generation = base × 1.1ⁿ (20% / 25% / 40% / race 20%) | – | **Estimate** (fitted to large datasets) | Crazyfellow ch. 4 (aoneko) |
| Career-start aptitude boost from pink ★ (1/4/7/10 → +1…+4, max A) | – | **Strong empirical finding** | Crazyfellow ch. 3 |
| Mid-run red gene: each proc gives 1–5 hidden points, points → grades as above, per inspiration | – | **Hypothesis** (the guide infers it, no statistics) | Crazyfellow ch. 3 |

All of these values live in one versioned rule set, [`src/domain/rules.ts`](../src/domain/rules.ts) (`global-2026-06-24`), and tests pin them. When Global changes a rule, add a new set with its effective date instead of editing constants across the code.

Superseded and not used: the legacy compatibility system (+1 per shared G1/G2/G3 and title bonuses), obsolete since 24 June 2026.

## Goals and filters

* **Goals** are what you want the trainee to get: a skill hint (white or a unique skill's inherited version) or a race spark. Only goals get an Inherit % and Spark %, and only goals count in Hits, All inherited and All sparks.
* **Aptitude targets** (an aptitude grade such as Long S) and **spark filters** are about sparks, not goals. They show in a separate Sparks box.
  * Aptitude targets rank pairs **first**: by the mean chance (low end) of reaching them, rounded to the whole percent shown. Pairs with the same % are ordered by the chosen objective.
  * You pick how pairs are ordered, because goals can conflict:
    * **Most goals** (default): the expected number of goals passed on (Σ Inherit %).
    * Goals marked **!** (priority) come first: pairs are ordered by the expected number of **!** goals passed on, then by the objective. The list shows this in its own **!** column, and Hits stays a plain count.
    * **All goals**: the chance that every goal is inherited.
    * **Affinity**: the lineage total.
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
  rel(T,P1) + rel(T,P2) + Σ rel(T,P,G) + rel(P1,P2) + Σ race(P,G) + race(P1,P2)
```

The tree shows each parent's **own** affinity (the parent formula without its two `rel(T,P,G)` trio links, which appear on the grandparents), as uma.guide does. The parent's sparks still roll at the full value; hover the number to see both.

One known difference from uma.guide: its saddle table has no entry for **Kawasaki Kinen** (a newer dirt G1), so it never counts that race as a shared win. The game data lists it as a G1 saddle, so the planner does count it, giving 3 more per pair that both won it.

Each link also reports which shared G1s it counts (hover a parent's or grandparent's number in the tree).

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

**Aptitude goals:** pink ★ of that aptitude across the six horses raise the starting grade (≥1★ +1, ≥4★ +2, ≥7★ +3, ≥10★ +4, never above A; S only comes mid-run). At each of the two inspirations, every pink spark of that aptitude rolls; each proc gives 1–5 hidden points, the turn's points add up, and grades follow the same 1/4/7/10 steps. How the 1–5 points are distributed is unknown, so aptitude goals show a **range**: the low end assumes every proc rolls 1 point, the high end 5. Ranking and "All inherited" use the low end.

## Spark generation (Spark %)

The chance that your trainee generates the white or race spark itself, if it learns the skill or wins the race: base × 1.1ⁿ, where n is the number of the six horses carrying that spark.
* Skill base: 20% for ○, 25% for ◎, 40% for gold. Click the ○/◎/G mark on a goal to choose which version your trainee buys.
* Race base: 20%.
* Unique skills and aptitudes have no Spark %.

## Race fit

The goal picker marks skills that target the selected race ("race ✓") or can't trigger in it (✗). This comes from the skill's activation conditions (`src/domain/conditions.ts`), evaluated against the style, distance, surface, ground, season, weather, course, direction and slopes. Race details come from GameTora's Champions Meeting schedule and course layouts.
