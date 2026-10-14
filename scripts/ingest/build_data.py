#!/usr/bin/env python3
"""Convert a game master.mdb into the normalized JSON the planner loads.

Ingestion is deliberately separate from the optimizer: this script only reads
game tables and writes plain data with stable game IDs. Nothing here scores
or interprets mechanics.

Usage: python build_data.py MASTER_MDB OUTPUT_JSON [--resource-version V] [--app-version V]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# text_data categories (Global master.mdb)
TXT_CHARA_NAME = 6
TXT_CARD_FULL = 4
TXT_CARD_TITLE = 5
TXT_RACE_NAME = 32
TXT_TRACK_SHORT = 35
TXT_SKILL_NAME = 47
TXT_SKILL_DESC = 48
TXT_SADDLE_NAME = 111
TXT_FACTOR_NAME = 147

RACE_GRADES = {100: "G1", 200: "G2", 300: "G3"}


def texts(con: sqlite3.Connection, category: int) -> dict[int, str]:
    return {i: t for i, t in con.execute('select "index", text from text_data where category=?', (category,))}


def build(mdb: Path, meta_extra: dict) -> dict:
    con = sqlite3.connect(f"file:{mdb}?mode=ro", uri=True)
    q = con.execute

    chara_names = texts(con, TXT_CHARA_NAME)
    charas = {}
    for cid, color in q("select id, ui_color_main from chara_data"):
        if cid in chara_names:
            charas[cid] = {"id": cid, "name": chara_names[cid], "color": f"#{color}" if color else None}

    card_full, card_title = texts(con, TXT_CARD_FULL), texts(con, TXT_CARD_TITLE)
    skill_sets = {row[0]: [v for v in row[1::2] if v] for row in q("select * from skill_set")}
    # Skills a card can learn from its own hints and potential levels (available_skill_set_id = card id).
    learnable = defaultdict(list)
    for set_id, skill_id in q("select available_skill_set_id, skill_id from available_skill_set order by id"):
        learnable[set_id].append(skill_id)
    cards = {}
    for cid, chara_id, default_rarity, style in q("select id, chara_id, default_rarity, running_style from card_data"):
        apt = q(
            """select proper_ground_turf, proper_ground_dirt,
                      proper_distance_short, proper_distance_mile, proper_distance_middle, proper_distance_long,
                      proper_running_style_nige, proper_running_style_senko, proper_running_style_sashi,
                      proper_running_style_oikomi, skill_set
               from card_rarity_data where card_id=? order by rarity desc limit 1""",
            (cid,),
        ).fetchone()
        if not apt:
            continue
        keys = ["turf", "dirt", "short", "mile", "middle", "long", "nige", "senko", "sashi", "oikomi"]
        unique = next(iter(skill_sets.get(apt[10], [])), None)
        cards[cid] = {
            "id": cid,
            "charaId": chara_id,
            "name": chara_names.get(chara_id, card_full.get(cid, str(cid))),
            "title": card_title.get(cid, ""),
            "defaultRarity": default_rarity,
            "runningStyle": style,
            "aptitudes": dict(zip(keys, apt[:10])),
            "uniqueSkillId": unique,
            "skillIds": learnable.get(cid, []),
        }

    skill_names, skill_desc = texts(con, TXT_SKILL_NAME), texts(con, TXT_SKILL_DESC)
    skills = {}
    for sid, rarity, group_id, icon, grade, cat, pre1, cond1, pre2, cond2 in q(
        """select id, rarity, group_id, icon_id, grade_value, skill_category,
                  precondition_1, condition_1, precondition_2, condition_2 from skill_data"""
    ):
        if sid not in skill_names:
            continue
        blocks = [{"pre": p or "", "cond": c or ""} for p, c in ((pre1, cond1), (pre2, cond2)) if c]
        skills[sid] = {
            "id": sid,
            "name": skill_names[sid],
            "desc": skill_desc.get(sid, ""),
            "rarity": rarity,
            "groupId": group_id,
            "iconId": icon,
            "gradeValue": grade,
            "category": cat,
            "conditions": blocks,
        }

    factor_names = texts(con, TXT_FACTOR_NAME)
    effects = defaultdict(list)
    for group, effect_id, target, v1, v2 in q(
        "select factor_group_id, effect_id, target_type, value_1, value_2 from succession_factor_effect order by id"
    ):
        effects[group].append([effect_id, target, v1, v2])
    factors = {}
    for fid, group, rarity, ftype in q("select factor_id, factor_group_id, rarity, factor_type from succession_factor"):
        eff = effects.get(group, [])
        skill_hint = next((v1 for _, target, v1, _ in eff if target == 41), None)
        factors[fid] = {
            "id": fid,
            "groupId": group,
            "type": ftype,
            "stars": rarity,
            "name": factor_names.get(fid, str(fid)),
            "targets": sorted({t for _, t, _, _ in eff}),
            "skillId": skill_hint,
        }

    relation_points = {t: p for t, p in q("select relation_type, relation_point from succession_relation")}
    relation_members = defaultdict(list)
    for t, chara in q("select relation_type, chara_id from succession_relation_member order by id"):
        relation_members[t].append(chara)
    relation_ranks = [list(r) for r in q("select relation_rank, rank_value_min, rank_value_max from succession_relation_rank order by relation_rank")]

    saddle_names = texts(con, TXT_SADDLE_NAME)
    saddles = {
        sid: {"id": sid, "name": saddle_names.get(sid, str(sid)), "type": stype}
        for sid, stype in q("select id, win_saddle_type from single_mode_wins_saddle")
    }
    # Race saddles (G3/G2/G1) map to one race. Record its date and the career
    # years it can be run in: race_permission 1 = Junior, 2 = Classic,
    # 3 = Classic and Senior, 4 = Senior.
    years_of = {1: [1], 2: [2], 3: [2, 3], 4: [3]}
    slots = defaultdict(list)
    for sid, instance, perm, month, half in q(
        "select s.id, s.race_instance_id_1, p.race_permission, p.month, p.half"
        " from single_mode_wins_saddle s join single_mode_program p on p.race_instance_id = s.race_instance_id_1"
        " where s.win_saddle_type in (1, 2, 3)"
    ):
        for year in years_of.get(perm, []):
            slots[sid].append((year, month, half, instance // 100))
    for sid, options in slots.items():
        _, month, half, race = min(options)
        years = sorted({y for y, m, h, _ in options if (m, h) == (month, half)})
        saddles[sid].update(raceId=race, years=years, month=month, half=half)

    tracks = texts(con, TXT_TRACK_SHORT)
    courses = {
        cid: {"id": cid, "trackId": track, "distance": dist, "ground": ground, "turn": turn}
        for cid, track, dist, ground, turn in q("select id, race_track_id, distance, ground, turn from race_course_set")
    }
    race_names = texts(con, TXT_RACE_NAME)
    races, seen = [], set()
    for rid, grade, course in q("select id, grade, course_set from race order by id"):
        name = race_names.get(rid)
        if grade not in RACE_GRADES or not name or course not in courses or (name, course) in seen:
            continue
        seen.add((name, course))
        races.append({"id": rid, "name": name, "grade": RACE_GRADES[grade], "courseId": course})

    # Career goals from each character's default route (scenario 0, no branch
    # condition). Goals that share a sort_id are alternatives ("Oaks or Derby").
    # condition_type 1 = place in a given race (condition_id is a program id);
    # 3 = reach a fan count; 2 = place in a number of graded races; the rest
    # (fans with extra rules, scenario finals) are kept as a plain note.
    # race_type 1-3 are the scenario finals after turn 72 and are left out.
    race_of_program = dict(q("select id, race_instance_id / 100 from single_mode_program"))
    course_of_race = dict(q("select id, course_set from race"))
    career_goals = {}
    for chara_id, race_set in q("select chara_id, race_set_id from single_mode_route where scenario_id = 0 and condition_set_id = 0"):
        goals = {}
        for sort_id, turn, ctype, cid, v1, v2 in q(
            "select sort_id, turn, condition_type, condition_id, condition_value_1, condition_value_2"
            " from single_mode_route_race where race_set_id = ? and race_type = 0 order by sort_id, turn, id",
            (race_set,),
        ):
            goal = goals.setdefault(sort_id, {"turn": turn, "type": ctype, "value": v1, "count": v2, "options": []})
            race = race_of_program.get(cid) if ctype == 1 else None
            if race and race in race_names:
                goal["options"].append({"turn": turn, "raceId": race, "name": race_names[race], "courseId": course_of_race.get(race)})
        if chara_id in charas and goals:
            career_goals[chara_id] = list(goals.values())

    digest = hashlib.sha256(mdb.read_bytes()).hexdigest()
    return {
        "meta": {
            "schema": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "Global master.mdb (public game CDN)",
            "mdbSha256": digest,
            **meta_extra,
        },
        "charas": charas,
        "cards": cards,
        "skills": skills,
        "factors": factors,
        "relations": {"points": relation_points, "members": relation_members, "ranks": relation_ranks},
        "saddles": saddles,
        "tracks": tracks,
        "courses": courses,
        "races": races,
        "careerGoals": career_goals,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mdb", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--resource-version")
    ap.add_argument("--app-version")
    args = ap.parse_args()
    extra = {k: v for k, v in (("resourceVersion", args.resource_version), ("appVersion", args.app_version)) if v}
    data = build(args.mdb, extra)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    counts = {k: len(v) for k, v in data.items() if k != "meta" and hasattr(v, "__len__")}
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
