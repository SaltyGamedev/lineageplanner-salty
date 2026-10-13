# Data: sources, provenance and limits

The planner uses two inputs, and they never mix:

| Input | Where it comes from | Where it lives |
|---|---|---|
| **Game data** (characters, cards, skills, sparks, compatibility tables, races, courses) | The game's own `master.mdb`, downloaded from the public Global CDN | `public/data/game-data.json`, committed and served statically |
| **Race details** (Champions Meeting schedule, course slopes) | [GameTora](https://gametora.com/umamusume)'s public data files | `public/data/race-extras.json`, committed and served statically |
| **Your roster** (owned veterans) | An export from [UmaExtractor](https://github.com/SaltyGamedev/UmaExtractor-salty) | Your browser only (IndexedDB). It is never uploaded. |

## Game data pipeline

```
uma.moe /api/ver ──► resource version
CDN root manifest ──► Windows manifest ──► master manifest ──► master.mdb.lz4
        scripts/ingest/fetch_master.py  (verifies size + xxhash64, sqlite quick_check)
master.mdb ──► scripts/ingest/build_data.py ──► public/data/game-data.json
```

* The ingest step only copies tables into plain JSON. It does not score anything or interpret mechanics. All interpretation lives in `src/domain/`.
* IDs are the game's own IDs (card id, chara id, skill id, factor id, saddle id), so saved plans and cached rosters keep working after a refresh.
* `meta` records the generation time, the resource version and the SHA-256 of the source `master.mdb`.
* `.github/workflows/refresh-data.yml` runs daily. It rebuilds and redeploys only when the resource version changes; you can also trigger it by hand with `force`.

Running it locally:

```sh
pip install -r scripts/ingest/requirements.txt
python3 scripts/ingest/fetch_master.py /tmp/master.mdb      # prints the resource version
python3 scripts/ingest/build_data.py /tmp/master.mdb public/data/game-data.json --resource-version <v>
python3 scripts/ingest/fetch_gametora.py public/data/race-extras.json
```

### Tables used

| Table | Used for |
|---|---|
| `text_data` categories 4/5/6 | card full name, card title, character name |
| `text_data` 47/48 | skill name / description |
| `text_data` 147 | spark (factor) names |
| `text_data` 111/32/35 | saddle (win) names, race names, track short names |
| `chara_data` | character colour (used for the initials avatars) |
| `card_data`, `card_rarity_data`, `skill_set` | base aptitudes (1 = G … 8 = S) and unique skill |
| `skill_data` | rarity, group, activation conditions (`precondition_1/2`, `condition_1/2`) |
| `succession_factor`, `succession_factor_effect` | spark star count, type, group; effect target 41 gives the hinted skill |
| `succession_relation`, `succession_relation_member`, `succession_relation_rank` | compatibility groups, points and the △○◎ thresholds |
| `single_mode_wins_saddle` | win saddles (for the shared-wins bonus) |
| `race`, `race_course_set` | races, tracks, course distance, surface and direction |

The factor group to stat/aptitude mapping is checked against the factor names (text category 147): groups 1–5 are Speed…Wit, 11/12 are Turf/Dirt, 21–24 are Front Runner…End Closer, and 31–34 are Sprint…Long.

## Race details (GameTora)

`scripts/ingest/fetch_gametora.py` reads GameTora's data manifest and keeps only:

* **The Global Champions Meeting schedule:** name, dates, track, distance, surface, ground condition, season and weather. Picking a meeting fills in the race and turns on the CM skill bonus.
* **Per course:** whether the layout has an uphill and/or a downhill, and the number of corners. Slope conditions use this.

The refresh workflow runs it daily. A GameTora outage keeps the previous file. Course ids are the game's `race_course_set` ids, and a test checks that every meeting maps to a course in the game data.

Character portraits are loaded straight from GameTora's image server (`chr_icon_<chara>.png`). They are not copied into this repository. If an image fails, the app shows the coloured initials, and you can switch portraits off in the footer.

## Roster import (UmaExtractor)

The export is the game's `trained_chara_array` written out as JSON. A bare array or `{ "trained_chara_array": [...] }` both work. For each veteran the importer reads:

* `card_id`, `rarity`, `rank_score`, `use_type`, `create_time`, `is_locked`
* stats, `proper_*` aptitudes, `skill_array`
* `factor_info_array` (the veteran's own sparks) and `win_saddle_id_array`
* `succession_chara_array`: the entries at **position 10 and 20** are the veteran's parents, which become grandparents in a new lineage. Positions 11/12/21/22 (great-grandparents) do not affect inheritance and are ignored.

A veteran's parents are part of the veteran. You cannot pick them separately, and the optimizer never does.

The importer warns rather than fails on unknown cards or sparks (newer than the game data), on missing parents, and on duplicates. It rejects a file only when it is not an export or contains no veterans.

### Privacy

Exports contain your friends' viewer IDs (in borrowed-parent fields). The app never sends your export anywhere. The test fixture in `tests/fixtures/` has those IDs zeroed.

### `use_type`

Almost every record has `use_type: 0`. Records with another value also carry an `owner_trained_chara_id`. What this means is **not verified**; they look like borrowed or rental entries. They are therefore left out by default, and you can include them with the toggle in the Weights panel.

## Licences

* Planner code: MIT (see `LICENSE`).
* `fetch_master.py` is an independent implementation. Its download protocol was learned by reading [UmaTools](https://github.com/daftuyda/UmaTools) (GPL-3.0), but no GPL code was copied.
* Game data is © Cygames. The JSON holds only the names, numbers and condition strings needed for planning, with no images or audio.
* `race-extras.json` contains facts (schedule, slope layout) derived from GameTora's data files, with attribution in `meta` and in the app footer. GameTora does not publish a data licence. If they object, remove the file and the planner falls back to "depends on …".
* Portraits are hotlinked from GameTora, not redistributed.
* Inheritance odds and the white-spark generation model come from [uma.guide](https://uma.guide/guides/parenting-in-umamusume). The skill tier lists come from a community parenting sheet supplied by the project owner (`src/domain/tiers.ts`).

## Known gaps

* **Slopes, season and weather:** known for Champions Meetings and for any chosen course (slopes). Otherwise skills that depend on them show "depends on …" and are never ruled out. Whether a slope falls in a particular race phase is not checked.
* **Distance categories:** ≤1400 m Sprint, ≤1800 m Mile, ≤2400 m Medium, otherwise Long. A course you choose overrides the distance and surface.
* **Spark effect values** (`succession_factor_effect.value_*`) are not interpreted, because how they map is unclear. Sparks are valued by star count only.
