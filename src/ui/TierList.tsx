import { useMemo, useState } from "react";
import { STYLES } from "../domain/config";
import { evaluateSkill, type TargetContext } from "../domain/conditions";
import type { GameData } from "../domain/gameData";
import { TIERS, resolveTierList, type Tier } from "../domain/tiers";
import { FactorType, type Skill, type StyleKey, type Veteran } from "../domain/types";
import { TierBadge } from "./Breakdown";
import { EvidenceTag } from "./common";

interface Props {
  data: GameData;
  veterans: Veteran[];
  style: StyleKey;
  ctx: TargetContext | null;
}

/** The community tier list for one style, with how much of it the roster already carries. */
export function TierListView({ data, veterans, style: initialStyle, ctx }: Props) {
  const [style, setStyle] = useState<StyleKey>(initialStyle);
  const list = resolveTierList(data, style);

  // skill group -> white sparks in the roster (veteran's own, or via its parents)
  const carriers = useMemo(() => {
    const map = new Map<number, { own: number; viaParent: number; bestStars: number }>();
    for (const v of veterans) {
      [v, ...v.parents].forEach((m, i) => {
        for (const id of m?.factorIds ?? []) {
          const f = data.factors.get(id);
          if (!f || f.type !== FactorType.Skill || f.skillId == null) continue;
          const skill = data.skills.get(f.skillId);
          if (!skill) continue;
          const g = skill.groupId || skill.id;
          const c = map.get(g) ?? { own: 0, viaParent: 0, bestStars: 0 };
          if (i === 0) c.own++;
          else c.viaParent++;
          c.bestStars = Math.max(c.bestStars, f.stars);
          map.set(g, c);
        }
      });
    }
    return map;
  }, [data, veterans]);

  // Representative skill per group, to evaluate its conditions for the current race.
  const repByGroup = useMemo(() => {
    const m = new Map<number, Skill>();
    for (const s of data.skills.values()) {
      if (s.rarity > 2) continue;
      const g = s.groupId || s.id;
      const prev = m.get(g);
      if (!prev || s.rarity < prev.rarity) m.set(g, s);
    }
    return m;
  }, [data]);

  const byTier = new Map<Tier, typeof list.entries>();
  for (const e of list.entries) byTier.set(e.tier, [...(byTier.get(e.tier) ?? []), e]);

  return (
    <section className="panel tierlist">
      <div className="panel-head">
        <h2>Community tier list <EvidenceTag evidence="preference" /></h2>
        <div className="seg">
          {STYLES.map((s) => (
            <button key={s.key} className={style === s.key ? "on" : ""} onClick={() => setStyle(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>
      <p className="muted small">
        White skills worth carrying on parents, from a community parenting sheet. It prefers generic skills, which keep
        parents flexible, over style-specific ones, and skills within a tier are unordered. The planner values skill sparks by this list when
        "Value skills by the community tier list" is on. Skills marked "not on Global yet" count once a data refresh
        adds them.
      </p>
      {TIERS.filter((t) => byTier.has(t.tier)).map((t) => (
        <div key={t.tier} className="tier-group">
          <h3><TierBadge tier={t.tier} /> {t.label} <span className="muted small">value {t.value}</span></h3>
          <ul className="tier-entries">
            {byTier.get(t.tier)!.map((e) => {
              const counts = e.groupIds.map((g) => carriers.get(g)).filter(Boolean) as { own: number; viaParent: number; bestStars: number }[];
              const own = counts.reduce((a, c) => a + c.own, 0);
              const via = counts.reduce((a, c) => a + c.viaParent, 0);
              const rels = ctx ? e.groupIds.map((g) => repByGroup.get(g)).filter(Boolean).map((s) => evaluateSkill(s!, ctx).relevance) : [];
              const fits = rels.includes("match") ? "match" : rels.includes("generic") ? "generic" : rels.length ? "mismatch" : null;
              return (
                <li key={e.label} className={e.groupIds.length ? "" : "unresolved"}>
                  <div className="tier-name">
                    <b>{e.label}</b>
                    {e.jp && <span className="muted small"> {e.jp}</span>}
                    {!e.groupIds.length && <span className="tag">not on Global yet</span>}
                    {fits && (
                      <span className={`rel rel-${fits}`}>
                        {fits === "match" ? "targets your race" : fits === "generic" ? "any race" : "ruled out for your race"}
                      </span>
                    )}
                  </div>
                  {e.note && <div className="muted small">{e.note}</div>}
                  {e.skills.length > 1 && (
                    <div className="muted small">
                      {e.skills.join(", ")}
                      {e.missing.length > 0 && ` (not found: ${e.missing.join(", ")})`}
                    </div>
                  )}
                  <div className={`carry ${own ? "ok" : via ? "" : "warn"}`}>
                    {own
                      ? `${own} veteran(s) carry it${via ? `, plus ${via} of their parents` : ""}`
                      : via
                        ? `Only on parents of your veterans (${via})`
                        : e.groupIds.length ? "Not in your roster" : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
