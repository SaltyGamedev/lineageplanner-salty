import { useState } from "react";
import type { GameData } from "../domain/gameData";
import { FactorType, type Veteran } from "../domain/types";
import { Portrait, Stars } from "./common";

const norm = (s: string) => s.toLowerCase().normalize("NFKD");

export function Roster({ data, own, rentals, excluded, onExcluded }: { data: GameData; own: Veteran[]; rentals: Veteran[]; excluded: number[]; onExcluded: (ids: number[]) => void }) {
  const [q, setQ] = useState("");
  const list = [...own, ...rentals].filter((v) => !q || norm(`${data.charaName(v.charaId)} ${data.cards.get(v.cardId)?.title ?? ""}`).includes(norm(q)));
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Roster</h2>
        <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="roster-grid">
        {list.map((v) => {
          const off = excluded.includes(v.trainedId);
          const sparks = v.factorIds.map((id) => data.factors.get(id)).filter(Boolean);
          const color = (t: FactorType) => (t === FactorType.Stat ? "blue" : t === FactorType.Aptitude ? "pink" : t === FactorType.Unique ? "green" : null);
          return (
            <div key={v.trainedId} className={`roster-card ${off ? "off" : ""}`}>
              <Portrait data={data} cardId={v.cardId} size={44} />
              <div className="roster-info">
                <b>{data.charaName(v.charaId)}</b> {v.borrowed && <em className="badge rental">rental</em>}
                <div className="roster-sparks">
                  {sparks.filter((f) => color(f!.type)).map((f) => (
                    <span key={f!.id} className={`mini chip-${color(f!.type)}`}>{f!.name} <Stars n={f!.stars} /></span>
                  ))}
                  <span className="muted small">{sparks.filter((f) => !color(f!.type)).length} white</span>
                </div>
              </div>
              <button className="link" onClick={() => onExcluded(off ? excluded.filter((x) => x !== v.trainedId) : [...excluded, v.trainedId])}>
                {off ? "Use" : "Exclude"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
