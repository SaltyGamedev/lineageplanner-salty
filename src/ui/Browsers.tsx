import { useMemo, useState } from "react";
import { aptitudeLetter } from "../domain/config";
import { evaluateSkill, type TargetContext } from "../domain/conditions";
import type { GameData } from "../domain/gameData";
import { veteranExclusion, type Constraints } from "../domain/optimizer";
import { sparkColor } from "../domain/sparks";
import { TIER_ORDER, resolveTierList } from "../domain/tiers";
import { FactorType, type Card, type PlannerConfig, type StyleKey, type Veteran } from "../domain/types";
import { TierBadge } from "./Breakdown";
import { AptBadge, Avatar, Empty, SparkChip, Stars } from "./common";

const norm = (s: string) => s.toLowerCase().normalize("NFKD");

// ---------------------------------------------------------------- veterans

interface VetProps {
  data: GameData;
  veterans: Veteran[];
  config: PlannerConfig;
  constraints: Constraints;
  onConstraints: (c: Constraints) => void;
}

export function VeteranBrowser({ data, veterans, config, constraints, onConstraints }: VetProps) {
  const [q, setQ] = useState("");
  const [onlyUsable, setOnlyUsable] = useState(false);
  const [sparkFilter, setSparkFilter] = useState("");
  const targetChara = config.targetCardId != null ? data.charaIdOfCard(config.targetCardId) : null;

  const rows = useMemo(() => {
    const query = norm(q);
    const sq = norm(sparkFilter);
    return veterans
      .map((v) => ({ v, reason: targetChara != null ? veteranExclusion(v, targetChara, config, constraints) : null }))
      .filter(({ v, reason }) => {
        if (onlyUsable && reason) return false;
        if (query) {
          const hay = norm(`${data.charaName(v.charaId)} ${data.cards.get(v.cardId)?.title ?? ""} ${v.parents.map((p) => (p ? data.charaName(p.charaId) : "")).join(" ")}`);
          if (!hay.includes(query)) return false;
        }
        if (sq) {
          const all = [v, ...v.parents].flatMap((m) => m?.factorIds ?? []);
          if (!all.some((id) => norm(data.factors.get(id)?.name ?? "").includes(sq))) return false;
        }
        return true;
      })
      .sort((a, b) => data.charaName(a.v.charaId).localeCompare(data.charaName(b.v.charaId)) || b.v.rankScore - a.v.rankScore);
  }, [veterans, q, sparkFilter, onlyUsable, data, config, constraints, targetChara]);

  if (!veterans.length) return <Empty title="No veterans imported">Import an UmaExtractor export from the header to see your roster.</Empty>;

  const toggle = (list: "locked" | "excluded", id: number) => {
    const has = constraints[list].includes(id);
    const next = has ? constraints[list].filter((x) => x !== id) : [...constraints[list], id];
    onConstraints({ ...constraints, [list]: list === "locked" ? next.slice(-2) : next });
  };

  return (
    <section className="panel browser">
      <div className="filters">
        <input type="search" placeholder="Search name, title or grandparent…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input type="search" placeholder="Has spark (e.g. Speed, Long, Corner)…" value={sparkFilter} onChange={(e) => setSparkFilter(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={onlyUsable} onChange={(e) => setOnlyUsable(e.target.checked)} /> Only usable for current trainee
        </label>
        <span className="muted small">{rows.length} / {veterans.length}</span>
      </div>
      <table className="grid vets">
        <thead>
          <tr>
            <th>Veteran</th><th>Aptitudes</th><th>Sparks (own)</th><th>Grandparents</th><th className="num">Rank</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ v, reason }) => {
            const own = v.factorIds.map((id) => data.factors.get(id)).filter((f) => f && f.type !== FactorType.Skill && f.type !== FactorType.Race && f.type !== FactorType.Scenario);
            const whites = v.factorIds.filter((id) => {
              const t = data.factors.get(id)?.type;
              return t === FactorType.Skill || t === FactorType.Race;
            }).length;
            return (
              <tr key={v.trainedId} className={reason ? "excluded" : ""}>
                <td>
                  <div className="cell-id">
                    <Avatar data={data} charaId={v.charaId} size={32} />
                    <div>
                      <div>{data.charaName(v.charaId)}</div>
                      <small className="muted">{data.cards.get(v.cardId)?.title} · #{v.trainedId}</small>
                      {reason && <small className="excl-reason">{reason}</small>}
                    </div>
                  </div>
                </td>
                <td>
                  <AptBadge label="Surf" value={v.aptitudes[config.surface]} />
                  <AptBadge label="Dist" value={v.aptitudes[config.distance]} />
                  <AptBadge label="Style" value={v.aptitudes[config.style]} />
                </td>
                <td>
                  {own.map((f) => f && (
                    <SparkChip key={f.id} color={sparkColor(f)} title={f.name}>{f.name} <Stars n={f.stars} /></SparkChip>
                  ))}
                  {whites > 0 && <span className="muted small"> +{whites} white</span>}
                </td>
                <td className="small">{v.parents.map((p) => (p ? data.charaName(p.charaId) : "—")).join(" / ")}</td>
                <td className="num">{v.rankScore}</td>
                <td className="actions">
                  <button className={constraints.locked.includes(v.trainedId) ? "on" : ""} onClick={() => toggle("locked", v.trainedId)} title="Lock: must appear in results (max 2)">🔒</button>
                  <button className={constraints.excluded.includes(v.trainedId) ? "on danger" : ""} onClick={() => toggle("excluded", v.trainedId)} title="Exclude from results">⊘</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ------------------------------------------------------------------ skills

export function SkillBrowser({ data, veterans, ctx, style }: { data: GameData; veterans: Veteran[]; ctx: TargetContext | null; style: StyleKey }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "owned" | "match" | "tier">("owned");
  const tiers = resolveTierList(data, style);

  // skill id -> veterans whose lineage (veteran or its parents) carries a spark hinting it
  const owners = useMemo(() => {
    const map = new Map<number, { vet: Veteran; stars: number; own: boolean }[]>();
    for (const v of veterans) {
      [v, ...v.parents].forEach((m, i) => {
        for (const id of m?.factorIds ?? []) {
          const f = data.factors.get(id);
          if (f?.skillId == null) continue;
          const list = map.get(f.skillId) ?? [];
          list.push({ vet: v, stars: f.stars, own: i === 0 });
          map.set(f.skillId, list);
        }
      });
    }
    return map;
  }, [data, veterans]);

  const rows = useMemo(() => {
    const query = norm(q);
    return [...data.skills.values()]
      .map((s) => ({ s, rel: ctx ? evaluateSkill(s, ctx) : null, own: owners.get(s.id) ?? [], tier: s.rarity <= 2 ? (tiers.byGroup.get(s.groupId || s.id) ?? null) : null }))
      .filter(({ s, rel, own, tier }) => {
        if (query && !norm(`${s.name} ${s.desc}`).includes(query)) return false;
        if (filter === "owned" && !own.length) return false;
        if (filter === "match" && rel?.relevance !== "match") return false;
        if (filter === "tier" && !tier) return false;
        return true;
      })
      .sort((a, b) => b.own.length - a.own.length || (a.tier ? TIER_ORDER[a.tier.tier] : 99) - (b.tier ? TIER_ORDER[b.tier.tier] : 99) || a.s.name.localeCompare(b.s.name))
      .slice(0, 300);
  }, [data, q, filter, owners, ctx, tiers]);

  return (
    <section className="panel browser">
      <div className="filters">
        <input type="search" placeholder="Search skills…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(["owned", "match", "tier", "all"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)} disabled={f === "match" && !ctx}>
              {f === "owned" ? "In my roster" : f === "match" ? "Targets my race" : f === "tier" ? "On tier list" : "All"}
            </button>
          ))}
        </div>
        <span className="muted small">{rows.length} shown{rows.length === 300 ? " (first 300)" : ""}</span>
      </div>
      {!rows.length ? (
        <Empty title="No skills match" />
      ) : (
        <table className="grid">
          <thead><tr><th>Skill</th><th>Tier</th><th>For current race</th><th>Sparks in roster</th></tr></thead>
          <tbody>
            {rows.map(({ s, rel, own, tier }) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                  <div className="muted small">{s.desc}</div>
                  <details className="cond">
                    <summary>Conditions</summary>
                    {s.conditions.length ? s.conditions.map((c, i) => (
                      <code key={i}>{c.pre && <>pre: {c.pre}<br /></>}{c.cond}</code>
                    )) : <span className="muted">none</span>}
                  </details>
                </td>
                <td><TierBadge tier={tier?.tier ?? null} /></td>
                <td>
                  {rel ? (
                    <>
                      <span className={`rel rel-${rel.relevance}`}>
                        {rel.relevance === "match" ? `yes: ${rel.matched.join(", ")}` : rel.relevance === "generic" ? "any race" : `no: ${rel.blockers.join(", ")}`}
                      </span>
                      {rel.unknown.length > 0 && <div className="muted small">depends on {rel.unknown.join(", ")}</div>}
                    </>
                  ) : <span className="muted small">choose a trainee</span>}
                </td>
                <td className="small">
                  {own.slice(0, 6).map((o, i) => (
                    <div key={i}>
                      {data.charaName(o.vet.charaId)} {!o.own && <span className="muted">(via parent)</span>} <Stars n={o.stars} />
                    </div>
                  ))}
                  {own.length > 6 && <div className="muted">+{own.length - 6} more</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// -------------------------------------------------------------- characters

interface CharaProps {
  data: GameData;
  veterans: Veteran[];
  config: PlannerConfig;
  constraints: Constraints;
  onConstraints: (c: Constraints) => void;
  onTarget: (cardId: number) => void;
}

export function CharacterBrowser({ data, veterans, config, constraints, onConstraints, onTarget }: CharaProps) {
  const [q, setQ] = useState("");
  const target = config.targetCardId != null ? data.cards.get(config.targetCardId) : undefined;
  const cardsByChara = useMemo(() => {
    const m = new Map<number, Card[]>();
    for (const c of data.cards.values()) m.set(c.charaId, [...(m.get(c.charaId) ?? []), c]);
    return m;
  }, [data]);
  const owned = useMemo(() => {
    const m = new Map<number, number>();
    for (const v of veterans) if (v.charaId != null) m.set(v.charaId, (m.get(v.charaId) ?? 0) + 1);
    return m;
  }, [veterans]);
  const rows = useMemo(
    () =>
      [...data.charas.values()]
        .filter((c) => cardsByChara.has(c.id) && (!q || norm(c.name).includes(norm(q))))
        .map((c) => ({ c, pair: target && target.charaId !== c.id ? data.relationSum([target.charaId, c.id]) : null }))
        .sort((a, b) => (b.pair ?? -1) - (a.pair ?? -1) || a.c.name.localeCompare(b.c.name)),
    [data, cardsByChara, q, target],
  );
  const toggleExclude = (id: number) =>
    onConstraints({
      ...constraints,
      excludedCharas: constraints.excludedCharas.includes(id) ? constraints.excludedCharas.filter((x) => x !== id) : [...constraints.excludedCharas, id],
    });

  return (
    <section className="panel browser">
      <div className="filters">
        <input type="search" placeholder="Search characters…" value={q} onChange={(e) => setQ(e.target.value)} />
        {target && <span className="muted small">Pair points with {target.name} (relation groups only; trio and win bonuses depend on the lineage)</span>}
      </div>
      <div className="chara-grid">
        {rows.map(({ c, pair }) => (
          <div key={c.id} className={`chara-card ${constraints.excludedCharas.includes(c.id) ? "excluded" : ""}`}>
            <div className="cell-id">
              <Avatar data={data} charaId={c.id} size={40} />
              <div>
                <b>{c.name}</b>
                <div className="muted small">{owned.get(c.id) ?? 0} owned veteran(s){pair != null && ` · pair ${pair}`}</div>
              </div>
            </div>
            <div className="card-list">
              {(cardsByChara.get(c.id) ?? []).map((card) => (
                <button key={card.id} className="link" onClick={() => onTarget(card.id)} title="Use as trainee">
                  {card.title || card.name}
                  <span className="muted small">
                    {" "}{aptitudeLetter(card.aptitudes.turf)}{aptitudeLetter(card.aptitudes.dirt)} ·{" "}
                    {(["short", "mile", "middle", "long"] as const).map((k) => aptitudeLetter(card.aptitudes[k])).join("")}
                  </span>
                </button>
              ))}
            </div>
            <button className={`small-btn ${constraints.excludedCharas.includes(c.id) ? "on danger" : ""}`} onClick={() => toggleExclude(c.id)}>
              {constraints.excludedCharas.includes(c.id) ? "Excluded as parent" : "Exclude as parent"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
