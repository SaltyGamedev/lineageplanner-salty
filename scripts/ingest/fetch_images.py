#!/usr/bin/env python3
"""Download card portraits once and keep them in the repo (public/img/cards/<card_id>.png).

Only cards without a local file are fetched, one request per second, so the
daily refresh touches GameTora only when a new card appears.

Usage: fetch_images.py GAME_DATA_JSON OUT_DIR
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = "https://gametora.com/images/umamusume/characters/thumb/chara_stand_{chara}_{card}.png"
UA = "lineageplanner-salty asset sync (+https://github.com/SaltyGamedev/lineageplanner-salty)"
DELAY = 1.0


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    missing = [c for c in data["cards"].values() if not os.path.exists(os.path.join(out, f"{c['id']}.png"))]
    fetched = failed = 0
    for card in missing:
        url = URL.format(chara=card["charaId"], card=card["id"])
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as res:
                body = res.read()
            if not body.startswith(b"\x89PNG"):
                raise ValueError("not a PNG")
            with open(os.path.join(out, f"{card['id']}.png"), "wb") as f:
                f.write(body)
            fetched += 1
        except (urllib.error.URLError, ValueError) as e:
            print(f"skip {card['id']}: {e}", file=sys.stderr)
            failed += 1
        time.sleep(DELAY)
    print(f"{fetched} portraits downloaded, {failed} unavailable, {len(data['cards']) - len(missing)} already present")


if __name__ == "__main__":
    main()
