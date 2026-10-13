#!/usr/bin/env python3
"""Fetch race details that master.mdb does not carry, from GameTora's public data files.

Writes public/data/race-extras.json with:
  * championsMeetings: the Global Champions Meeting schedule (track, distance,
    surface, ground condition, season, weather) – used to preset the race.
  * courses: per course id, whether the layout has uphill / downhill sections
    (used to evaluate `slope` / `*_slope_random` skill conditions) and the
    corner / straight / slope spans used to draw the course diagram.

Only facts needed for planning are kept. Source attribution and the URLs of
the files used are written into `meta`. Standard library only.

Usage: fetch_gametora.py OUT_JSON
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone

BASE = "https://gametora.com/data"
MANIFEST = f"{BASE}/manifests/umamusume.json"
UA = "lineageplanner-salty data refresh (+https://github.com/SaltyGamedev/lineageplanner-salty)"


def get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def data_url(manifest: dict, name: str) -> str:
    if name not in manifest:
        raise SystemExit(f"GameTora manifest has no entry {name!r}")
    return f"{BASE}/umamusume/{name}.{manifest[name]}.json"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    out = sys.argv[1]
    manifest = get_json(MANIFEST)
    cm_url = data_url(manifest, "en/events/champions-meeting")
    tracks_url = data_url(manifest, "racetracks")

    meetings = []
    for cm in get_json(cm_url):
        race = cm.get("race") or {}
        meetings.append({
            "id": cm["id"],
            "name": cm["name"],
            "start": cm["start"],
            "end": cm["end"],
            "trackId": race["track"],
            "distance": race["distance"],
            "ground": race["ground"],
            "groundCondition": race.get("condition"),
            "season": race.get("season"),
            "weather": race.get("weather"),
            "turn": race.get("turn"),
        })
    meetings.sort(key=lambda m: m["start"])

    courses = {}
    for track in get_json(tracks_url):
        for c in track["courses"]:
            slopes = c.get("slopes") or []
            courses[str(c["id"])] = {
                "up": any(s["slope"] > 0 for s in slopes),
                "down": any(s["slope"] < 0 for s in slopes),
                "corners": len(c.get("corners") or []),
                # Geometry for the course diagram: [start, end] metres; slopes add the gradient (×10000).
                "length": c.get("length") or c.get("distance"),
                "cornerSpans": [[k["start"], k["end"]] for k in c.get("corners") or []],
                "straightSpans": [[k["start"], k["end"]] for k in c.get("straights") or []],
                "slopeSpans": [[k["start"], k["end"], k["slope"]] for k in slopes],
            }

    doc = {
        "meta": {
            "source": "GameTora (gametora.com) public data files",
            "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "files": [cm_url, tracks_url],
        },
        "championsMeetings": meetings,
        "courses": courses,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{len(meetings)} Champions Meetings, {len(courses)} courses -> {out}")


if __name__ == "__main__":
    main()
