#!/usr/bin/env python3
"""Download images once and keep them in the repo, so visitors never load them from GameTora.

  * card portraits -> OUT_DIR/cards/<card_id>.png
  * race banners for every race saddle (G1/G2/G3) -> OUT_DIR/races/<race_id>.png
    (the English banner, or the JP one when there is none)
  * Champions Meeting banners -> OUT_DIR/cm/<cm_id>.png (Global banner) or
    <cm_id>-jp.png (the JP banner, for upcoming meetings until Global has its
    own), for meetings that are live, upcoming or ended in the last 60 days.

Only files that don't exist yet are fetched, one request per second.

Usage: fetch_images.py GAME_DATA_JSON RACE_EXTRAS_JSON OUT_DIR
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request

URL = "https://gametora.com/images/umamusume/characters/thumb/chara_stand_{chara}_{card}.png"
RACE_URL = "https://media.gametora.com/umamusume/races/banners/{region}{race}.png"
CM_URL = "https://media.gametora.com/umamusume/events/cm/{region}banner_{res}.png"
RECENT = 60 * 24 * 3600
UA = "lineageplanner-salty asset sync (+https://github.com/SaltyGamedev/lineageplanner-salty)"
DELAY = 1.0


def download(url: str, path: str) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as res:
            body = res.read()
        if not body.startswith(b"\x89PNG"):
            raise ValueError("not a PNG")
        with open(path, "wb") as f:
            f.write(body)
        return True
    except (urllib.error.URLError, ValueError) as e:
        print(f"skip {url}: {e}", file=sys.stderr)
        return False
    finally:
        time.sleep(DELAY)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    extras = json.load(open(sys.argv[2], encoding="utf-8"))
    out = sys.argv[3]

    cards_dir = os.path.join(out, "cards")
    os.makedirs(cards_dir, exist_ok=True)
    cards = [c for c in data["cards"].values() if not os.path.exists(os.path.join(cards_dir, f"{c['id']}.png"))]
    got = sum(download(URL.format(chara=c["charaId"], card=c["id"]), os.path.join(cards_dir, f"{c['id']}.png")) for c in cards)
    print(f"portraits: {got} downloaded, {len(cards) - got} unavailable")

    race_dir = os.path.join(out, "races")
    os.makedirs(race_dir, exist_ok=True)
    # Races held at another venue some years (e.g. Takarazuka Kinen 1012/1025)
    # have no banner of their own: fetch the first race of each name and copy it.
    by_name: dict[str, list[int]] = {}
    for s in data["saddles"].values():
        if s.get("raceId"):
            by_name.setdefault(s["name"], []).append(s["raceId"])
    race_file = lambda r: os.path.join(race_dir, f"{r}.png")
    first = sorted(min(ids) for ids in by_name.values())
    missing = [r for r in first if not os.path.exists(race_file(r))]
    got = sum(any(download(RACE_URL.format(region=region, race=r), race_file(r)) for region in ("en/", "")) for r in missing)
    print(f"race banners: {got} downloaded, {len(missing) - got} unavailable")
    for ids in by_name.values():
        for r in ids:
            if not os.path.exists(race_file(r)) and os.path.exists(race_file(min(ids))):
                shutil.copyfile(race_file(min(ids)), race_file(r))

    cm_dir = os.path.join(out, "cm")
    os.makedirs(cm_dir, exist_ok=True)
    now = time.time()
    name = lambda m: f"{m['id']}-jp.png" if m.get("upcoming") else f"{m['id']}.png"
    wanted = [m for m in extras.get("championsMeetings", [])
              if m.get("resourceId") and (m.get("upcoming") or (m.get("end") or 0) >= now - RECENT)
              and not os.path.exists(os.path.join(cm_dir, name(m)))]
    got = sum(download(CM_URL.format(region="" if m.get("upcoming") else "en/", res=m["resourceId"]), os.path.join(cm_dir, name(m))) for m in wanted)
    print(f"CM banners: {got} downloaded, {len(wanted) - got} unavailable")


if __name__ == "__main__":
    main()
