# Scoring

A lineage is the trainee plus **two veterans**. Each veteran brings along its two recorded parents (the grandparents). The optimizer scores **every** valid pair of owned veterans; there is no sampling and no pruning.

Every number in the app has one of three labels:

| Label | Meaning |
|---|---|
| **verified** | Read directly from game data or from your export. |
| **approximation** | Game data combined by a community-documented formula or by interpreting conditions. Not confirmed from game code. |
| **preference** | A weight, a reference value or the community tier list. You can change or switch these off. |

## Inheritance chances (approximation)

The game doesn't publish inheritance odds. The planner uses the community model from [uma.guide](https://uma.guide/guides/parenting-in-umamusume):

```
chance per inspiration = baseOdds(colour, ★) × (1 + affinity / 100)     (capped at 100%)
```

| Spark | ★1 | ★2 | ★3 |
|---|---|---|---|
| Blue (stat) | 70% | 80% | 90% |
| Pink (aptitude) | 2% | 3% | 5% |
| Green (unique) | 5% | 10% | 15% |
| Race | 1% | 2% | 3% |
| White (skill) & scenario | 3% | 6% | 9% |

* There are two inspirations per career, and every horse is rolled separately with its own affinity:
  * a parent P has affinity `rel(T,P) + Σ rel(T,P,G) + Σ sharedWins(P,G)`, which is its compatibility total;
  * a grandparent G has affinity `rel(T,P,G) + sharedWins(P,G)`.
* "Chance" for a skill or aptitude is the chance that **at least one** of its sparks procs during the career: `1 − Π (1 − p)²`.

## Rules (hard constraints, verified game rules)

* A parent cannot be the same character as the trainee.
* The two parents cannot be the same character.
* Your own constraints: excluded veterans, excluded characters, and locked veterans (at most 2, and every result must contain them).
* Non-standard entries (`use_type ≠ 0`) are skipped unless you enable them.

The ranked list reports how many veterans and pairs each rule excluded.

## Components

Each component is scaled to 0–100. The total is the weighted average of the components that apply. A component without a score (n/a) is dropped rather than counted as 0.

### Compatibility (approximation)

The relation groups and their points are verified. How they are combined follows the community-documented formula. For each parent P with grandparents G1, G2:

```
parent(P) = rel(T,P) + rel(T,P,G1) + rel(T,P,G2) + sharedWins(P,G1) + sharedWins(P,G2)
total     = parent(P1) + parent(P2) + rel(P1,P2)
```

`rel(...)` is the sum of the points of every relation group that contains all of the listed characters. `sharedWins` counts the win saddles both horses hold. The △○◎ symbols per parent use `succession_relation_rank`.

Score = `min(total, 200) / 200 × 100`. The value 200 is a reference (preference).

### Skill sparks (approximation)

* Every spark that hints a skill (white, race and unique sparks) is collected from all six horses.
* Sparks are **grouped by skill group**, so a ○, a ◎ and the gold version of the same skill are never counted twice.
* The activation conditions of the representative skill are evaluated against the race: style, distance category, surface, track condition, season, weather, course/track, direction, slopes and exact metres for `is_basis_distance`.
  * **match**: the skill specifically targets something about this race, and nothing rules it out.
  * **generic**: no condition about the race; it works anywhere.
  * **mismatch**: a condition rules it out (for example an End Closer skill for a Front Runner) → value 0.
  * Race details you leave unset never rule a skill out; they are listed as "depends on …". Slopes are known once a course is chosen (`slope==1` needs an uphill, `slope==2` a downhill; `*_slope_random` likewise). Variable meanings follow GameTora's condition reference.
* **Worth** of a usable skill (preference):
  * Tier list on (default): the community tier value for the running style (table below). A usable skill that is not on the list gets `match ? 1 : genericSkill` × `untieredSkill` (default 1 or 0.5, × 0.4).
  * Tier list off: `1` for match, `genericSkill` (default 0.5) for generic.
* **Champions Meeting bonus** (preference): with a meeting selected, skills whose matched conditions describe the race itself (distance, surface, track condition, course, direction, slopes, season, weather) are multiplied by `cmBonus` (default ×1.5). Matching only the running style doesn't count.
* Value per skill = worth × CM bonus × chance. Score = `min(Σ value / 4, 1) × 100`.

The skills table separates what is **present** (verified: the spark exists) from what is **usable** (approximation). It also shows a **Loop** column: the chance your trainee generates that white spark if it learns the skill, using uma.guide's current model `20% × 1.1ⁿ` (n = horses in the lineage carrying it as a white spark; 25% for ◎, 40% for gold). uma.guide notes the exact formula is not known.

### Community tier list (preference)

`src/domain/tiers.ts` holds one tier list per running style, taken from a community parenting sheet:

* The sheet prefers generic skills over style-specific ones, because they keep parents flexible.
* Skills within a tier are unordered.
* Entries are resolved to skill groups by their Global name. Skills that are JP-only so far are shown as "not on Global yet" and start counting once a data refresh adds them.
* The sheet's broader advice ("good medium/mile velocity", cross-style skills) is not encoded, because it doesn't name specific skills.

| Tier | Value |
|---|---|
| URA scenario (pseudo T0), T0 | 1.0 |
| T0.5 | 0.9 |
| T1 | 0.8 |
| T1.5 | 0.7 |
| T2 | 0.6 |
| T3 | 0.45 |
| Honourable mention | 0.35 |
| T4 / Extra-SP | 0.3 |
| T5 | 0.2 |

### Aptitude sparks (approximation)

These cover the trainee's surface, distance and style for the race. Need per aptitude:

* 1 if the trainee's aptitude is below A
* `aptitudeAlreadyA` (default 0.3) if it is already A
* 0 if it is S

Value = need × min(1, chance of at least one pink proc / 50%). Score = Σ value / Σ need × 100. If the trainee needs nothing (all S), the component is n/a. How many aptitude levels a proc gives is not modelled.

### Stat sparks (approximation)

Expected ★ = Σ stars × chance × 2 inspirations. Score = Σ (expected ★ × stat weight) / (3★ × 6 horses × 2 × max stat weight) × 100.

## Default weights

| Weight | Default |
|---|---|
| Compatibility | 20 (affinity also drives every chance above) |
| Skill sparks | 40 |
| Aptitude sparks | 25 |
| Stat sparks | 15 |
| Community tier list | on |
| Skill not on the tier list | 0.4 |
| Champions Meeting bonus | ×1.5 |
| Generic skill value | 0.5 |
| Aptitude spark when already A | 0.3 |
| Stat values (Spd/Sta/Pow/Gut/Wit) | 1 / 1 / 1 / 0.5 / 0.8 |

## Tree node rating (preference)

Each card in the tree shows a quick rating of that horse's own contribution:

`45 × min(1, Σ(skill worth × CM bonus × ★/3) / 2) + 35 × min(1, needed aptitude★ / 3) + 20 × min(1, weighted stat★ / 3)`

The rating is **excellent** at 75 or above, **good** at 50, **mediocre** at 25, and **poor** below that. It is only a visual aid; the lineage ranking uses the components above.
