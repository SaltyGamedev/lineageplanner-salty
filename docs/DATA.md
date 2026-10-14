# Data: sources, provenance and limits

The planner uses two inputs, and they never mix:

| Input | Where it comes from | Where it lives |
|---|---|---|
| **Game data** (characters, cards, skills, sparks, compatibility tables, races, courses) | The game's own `master.mdb`, downloaded from the public Global CDN | `public/data/game-data.json`, committed and served statically |
| **Race details** (Champions Meeting schedule, course layouts) | [GameTora](https://gametora.com/umamusume)'s public data files | `public/data/race-extras.json`, committed and served statically |
| **Portraits** (card thumbnails) | Downloaded once from GameTora's image server | `public/img/cards/<card_id>.png`, committed and served from this site |
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
python3 scripts/ingest/fetch_images.py public/data/game-data.json public/img/cards
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
| `available_skill_set` | skills each card can learn from its own hints and potential levels (Loop: notable skills, "own" skills) |
| `single_mode_route`, `single_mode_route_race`, `single_mode_program` | career goals of each character's default route: turn, race options (goals sharing a `sort_id` are alternatives) and placement, or a fan/graded-race requirement |
| `skill_data` | rarity, group, activation conditions (`precondition_1/2`, `condition_1/2`) |
| `succession_factor`, `succession_factor_effect` | spark star count, type, group; effect target 41 gives the hinted skill |
| `succession_relation`, `succession_relation_member`, `succession_relation_rank` | compatibility groups, points and the △○◎ thresholds |
| `single_mode_wins_saddle`, `single_mode_program` | win saddles (for the shared-G1 bonus); for race saddles also the race, its date and the career years it runs in (`race_permission` 1 Junior, 2 Classic, 3 Classic and Senior, 4 Senior), used by the race-wins calendar |
| `race`, `race_course_set` | races, tracks, course distance, surface and direction |

The factor group to stat/aptitude mapping is checked against the factor names (text category 147): groups 1–5 are Speed…Wit, 11/12 are Turf/Dirt, 21–24 are Front Runner…End Closer, and 31–34 are Sprint…Long.

## Race details (GameTora)

`scripts/ingest/fetch_gametora.py` reads GameTora's data manifest and keeps only:

* **The Global Champions Meeting schedule:** name, dates, track, distance, surface, ground condition, season and weather. Picking a meeting fills in the race.
* **The next two meetings:** Global runs the JP meetings in the same order (Global CM 20 matches JP CM 20 exactly), so the next JP entries are added as `upcoming`, with no date, and are labelled "expected from the JP order" in the app. This is a schedule projection, not a game mechanic; nothing JP-only enters the calculations.
* **Banners:** downloaded once by `fetch_images.py` into `public/img/cm/` (the JP banner, `<id>-jp.png`, for upcoming meetings until Global has its own). Race banners for every G1/G2/G3 saddle go into `public/img/races/<race id>.png`; a race held at another venue some years reuses the banner of its first race id.
* **Per course:** whether the layout has an uphill and/or a downhill (used by slope conditions), plus its corner, straight and slope spans (used to draw the course diagram).

The refresh workflow runs it daily. A GameTora outage keeps the previous file. Course ids are the game's `race_course_set` ids, and a test checks that every meeting maps to a course in the game data.

Portraits are downloaded **once** by `scripts/ingest/fetch_images.py`. It fetches only cards without a local file, one request per second, so the daily refresh contacts GameTora only when a new card appears. The site then serves them itself. A missing image falls back to coloured initials.

## Roster import (UmaExtractor)

The export is the game's `trained_chara_array` written out as JSON. A bare array or `{ "trained_chara_array": [...] }` both work. For each veteran the importer reads:

* `card_id`, `rarity`, `rank_score`, `use_type`, `create_time`, `is_locked`
* stats, `proper_*` aptitudes, `skill_array`
* `factor_info_array` (the veteran's own sparks) and `win_saddle_id_array`
* `succession_chara_array`: the entries at **position 10 and 20** are the veteran's parents, which become grandparents in a new lineage. Positions 11/12/21/22 (great-grandparents) do not affect inheritance and are ignored.

A veteran's parents are part of the veteran. You cannot pick them separately, and the optimizer never does.

### Rentals (borrowed parents)

When a parent at position 10/20 has an `owner_viewer_id`, it was a friend's rental. The importer rebuilds it as a borrowable veteran, using that parent's own parents at positions 11/12 or 21/22. A friend offers one rental at a time, so only the most recently seen rental per friend is kept. It may be out of date if the friend has changed it since.

Optionally, the Rentals pop-up can fetch a friend's current rental from [uma.moe](https://uma.moe/api/docs) by trainer ID. This needs your own uma.moe API key, which stays in your browser and is sent only to uma.moe.

The importer warns rather than fails on unknown cards or sparks (newer than the game data), on missing parents, and on duplicates. It rejects a file only when it is not an export or contains no veterans.

### Privacy

Exports contain your friends' viewer IDs (in borrowed-parent fields). The app uses them only to group rentals by friend, and never sends your export anywhere. The test fixture in `tests/fixtures/` has those IDs zeroed.

### `use_type`

Almost every record has `use_type: 0`. Records with another value also carry an `owner_trained_chara_id`. What this means is **not verified**; they look like borrowed or rental entries. They are therefore left out by default.

## Licences

* Planner code: MIT (see `LICENSE`).
* `fetch_master.py` is an independent implementation. Its download protocol was learned by reading [UmaTools](https://github.com/daftuyda/UmaTools) (GPL-3.0), but no GPL code was copied.
* Game data is © Cygames. The JSON holds only the names, numbers and condition strings needed for planning, with no images or audio.
* `race-extras.json` contains facts (schedule, slope layout) derived from GameTora's data files, with attribution in `meta` and in the app footer. GameTora does not publish a data licence. If they object, remove the file and the planner falls back to "depends on …".
* Portraits are game art (© Cygames), downloaded once from GameTora and served from this site so GameTora's servers aren't hit by every visitor.
* Inheritance odds, the affinity split, the aptitude start boost and the spark generation model follow [uma.guide](https://uma.guide/roster-viewer/) (see `docs/SCORING.md`). The skill tier lists come from a community parenting sheet supplied by the project owner (`src/domain/tiers.ts`).

## Known gaps

* **Slopes, season and weather:** known for Champions Meetings and for any chosen course (slopes). Otherwise skills that depend on them show "depends on …" and are never ruled out. Whether a slope falls in a particular race phase is not checked.
* **Distance categories:** ≤1400 m Sprint, ≤1800 m Mile, ≤2400 m Medium, otherwise Long. A course you choose overrides the distance and surface.
* **Spark effect values** (`succession_factor_effect.value_*`) are not interpreted. Blue sparks are used only in filters.
