import { useMemo, useState } from "react";
import { STYLES } from "../domain/config";
import type { GameData } from "../domain/gameData";
import { goalKey } from "../domain/goals";
import { rosterSparks } from "../domain/roster";
import { TIERS, resolveTierList, type Tier } from "../domain/tiers";
import type { Goal, StyleKey, Veteran } from "../domain/types";
import { TierBadge } from "./common";

interface Props {
  data: GameData;
  pool: Veteran[];
  style: StyleKey;
  goals: Goal[];
  onGoals: (g: Goal[]) => void;
}

/** The community tier list per style, for reference; click a skill to make it a goal. */
export function TierListView({ data, pool, style: initialStyle, goals, onGoals }: Props) {
  const [style, setStyle] = useState<StyleKey>(initialStyle);
  const list = resolveTierList(data, style);
  const owned = useMemo(() => rosterSparks(data, pool), [data, pool]);
  const isGoal = (g: number) => goals.some((x) => goalKey(x) === `skill:${g}`);
  const toggle = (groupIds: number[]) => {
    const on = groupIds.every(isGoal);
    const rest = goals.filter((x) => !(x.kind === "skill" && groupIds.includes(x.groupId)));
    onGoals(on ? rest : [...rest, ...groupIds.map((groupId): Goal => ({ kind: "skill", groupId, priority: 1, sparkTier: "white" }))]);
  };

  const byTier = new Map<Tier, typeof list.entries>();
  for (const e of list.entries) byTier.set(e.tier, [...(byTier.get(e.tier) ?? []), e]);

  return (
    <section className="panel tierlist">
      <div className="panel-head">
        <h2>Tier list</h2>
        <div className="seg">
          {STYLES.map((s) => (
            <button key={s.key} className={style === s.key ? "on" : ""} onClick={() => setStyle(s.key)}>{s.label.split(" ")[0]}</button>
          ))}
        </div>
      </div>
      <p className="muted small">Community parenting sheet: generic skills first, unordered within a tier. Click a skill to add it as a goal.</p>
      {TIERS.filter((t) => byTier.has(t.tier)).map((t) => (
        <div key={t.tier} className="tier-group">
          <h3><TierBadge tier={t.tier} /> {t.label}</h3>
          <div className="tier-entries">
            {byTier.get(t.tier)!.map((e) => {
              const count = e.groupIds.reduce((a, g) => a + (owned.get(`skill:${g}`)?.count ?? 0), 0);
              const on = e.groupIds.length > 0 && e.groupIds.every(isGoal);
              return (
                <button key={e.label} className={`tier-entry ${on ? "on" : ""}`} disabled={!e.groupIds.length} onClick={() => toggle(e.groupIds)} title={e.note}>
                  <b>{e.label}</b>
                  {e.jp && <span className="muted small"> {e.jp}</span>}
                  <span className="muted small">{e.groupIds.length ? (count ? `${count} in roster` : "not in roster") : "not on Global yet"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
