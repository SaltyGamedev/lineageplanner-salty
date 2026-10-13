# Lineage Planner

A lineage planner for Uma Musume (Global). Import your veterans from [UmaExtractor](https://github.com/SaltyGamedev/UmaExtractor-salty), pick a trainee, a race and what you want it to inherit, and the planner finds the best pair of parents. It can include a friend's rental.

**Live:** https://saltygamedev.github.io/lineageplanner-salty/

* Trainee, race and parents are chosen in pop-ups with portraits. Upcoming Champions Meetings are one click away, with a course diagram.
* **Goals:** skills, race sparks and aptitude grades (for example Long S). For each goal you see **Inherit %** (chance the trainee gets it) and **Spark %** (chance it passes the spark on).
* **Spark filters:** minimum ★ of blue, pink or green sparks across the lineage.
* **Rental** on/off: friends' umas you rented before are read from your export (one per career).
* Community **tier list** per running style, for reference and quick goal suggestions.
* Everything stays in your browser. Re-import only when your roster changes.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```

* [docs/SCORING.md](docs/SCORING.md): how pairs are ranked, and every formula.
* [docs/DATA.md](docs/DATA.md): data sources, import format, rentals, privacy, licences.

Game data comes from the game's `master.mdb`. Race details and portraits come from GameTora (portraits are downloaded once and self-hosted). Both are refreshed daily by a GitHub Action and deployed to GitHub Pages.

## Licence

MIT © 2026 SaltyGamedev. Game data and art © Cygames; this is an unofficial fan tool.
