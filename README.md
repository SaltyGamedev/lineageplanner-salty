# Lineage Planner

A lineage planner and optimizer for Uma Musume (Global). Import your veterans from [UmaExtractor](https://github.com/SaltyGamedev/UmaExtractor-salty), pick a trainee and a race, and the planner ranks every valid pair of your veterans. Each score comes with a breakdown that marks every part as **verified**, **approximation** or **preference**.

* 7-node lineage tree. Each veteran's parents are fixed to it, as in the game.
* Click any horse to see what it contributes, why the lineage was recommended, and ranked alternatives.
* Pick an upcoming **Champions Meeting**: track, distance, season, weather and ground come from GameTora, and skills that target that race get extra weight.
* Skill sparks are valued by a **community tier list** per running style and by **inheritance chance** (uma.guide's odds × affinity). They are checked against each skill's activation conditions, with no double counting of ○/◎/gold variants.
* A **Loop** column estimates how likely your trainee is to pass a white spark on, for planning future parents.
* Compatibility uses the game's relation tables.
* Lock or exclude veterans, exclude characters, and change all weights.
* Browsers for veterans, skills (with the tier list and how much of it your roster covers) and characters.
* Save plans in the browser, export and import them as files, and compare plans side by side.
* Your roster stays in your browser (IndexedDB), so you only re-import when it changes.

## Use

1. Export your roster with UmaExtractor (JSON).
2. Open the site and click **Import export**.
3. Choose the trainee, running style, distance (or an exact course) and surface.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # static site in dist/
```

Game data is generated from the game's `master.mdb`, and race details come from GameTora. See [docs/DATA.md](docs/DATA.md). Both are refreshed daily by a GitHub Action and deployed to GitHub Pages.

* [docs/SCORING.md](docs/SCORING.md): every formula, and what is verified versus approximated.
* [docs/DATA.md](docs/DATA.md): data sources, import format, privacy, licences and known gaps.

## Layout

```
scripts/ingest/   master.mdb download + conversion (Python, no scoring)
public/data/      generated game data (committed)
src/domain/       pure TypeScript: import, compatibility, conditions, scoring, optimizer
src/state/        browser persistence (IndexedDB roster, localStorage settings/plans)
src/ui/           React components
tests/            vitest unit tests + a sample export fixture
```

## Licence

MIT © 2026 SaltyGamedev. Game data © Cygames; this is an unofficial fan tool.
