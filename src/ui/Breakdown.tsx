import type { GameData } from "../domain/gameData";
import { RANK_SYMBOL } from "../domain/compatibility";
import type { LineageEvaluation } from "../domain/scoring";
import type { ExclusionStats } from "../domain/optimizer";
import { aptitudeLetter } from "../domain/config";
import { sparkGenerationChance } from "../domain/inheritance";
import { TIERS } from "../domain/tiers";
import { Avatar, EvidenceTag, ScoreBar, Stars } from "./common";

export function ScoreBreakdown({ ev }: { ev: LineageEvaluation }) {
  return (
    <section className="panel breakdown">
      <div className="panel-head">
        <h2>Score breakdown</h2>
        <span className="total">{ev.total.toFixed(1)}</span>
      </div>
      <div className="components">
        {ev.components.map((c) => (
          <div key={c.key} className={`component ${c.score === null || c.weight === 0 ? "inactive" : ""}`}>
            <div className="component-head">
              <b>{c.label}</b>
              <EvidenceTag evidence={c.evidence} />
              <span className="muted small">weight {c.weight}</span>
            </div>
            <ScoreBar value={c.score} />
            <ul className="notes">{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="muted small">
        Total = weighted average of the components that apply. Components without a score (n/a) are left out instead of counted as zero.
      </p>
      {ev.warnings.length > 0 && <ul className="warnings">{ev.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
    </section>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span className="tier tier-none" title="Not on the community tier list for this style">–</span>;
  return <span className={`tier tier-${tier.replace(".", "_")}`} title={TIERS.find((t) => t.tier === tier)?.label}>{tier}</span>;
}

export function SkillTable({ data, ev }: { data: GameData; ev: LineageEvaluation }) {
  if (!ev.skills.length) return null;
  const memberName = (slot: string) => {
    const parent = slot.startsWith("p1") ? ev.p1 : ev.p2;
    return data.charaName(slot.length === 2 ? parent.charaId : (parent.parents[Number(slot[3]) - 1]?.charaId ?? null));
  };
  return (
    <section className="panel">
      <h2>Skill sparks in this lineage <EvidenceTag evidence="approximation" /></h2>
      <p className="muted small">
        Present = verified. Fit comes from the skill's activation conditions; tier from the community list for this style
        <EvidenceTag evidence="preference" />. Chance = at least one source procs over the two inspirations, using uma.guide's
        base odds × (1 + affinity/100). "Loop" = chance your trainee generates this white spark if it learns the skill
        (20% × 1.1ⁿ, n = horses carrying it; gold doubles the base).
      </p>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr><th>Skill</th><th>Tier</th><th>Fits race</th><th>Sources</th><th className="num">Chance</th><th className="num">Loop</th></tr>
          </thead>
          <tbody>
            {ev.skills.map((s) => (
              <tr key={s.skill.id} className={s.relevance.relevance === "mismatch" ? "muted" : ""}>
                <td title={s.skill.desc}>
                  {s.skill.name}
                  {s.cmBoost && <span className="cm-tag" title="Targets the selected Champions Meeting">CM</span>}
                </td>
                <td><TierBadge tier={s.tier?.tier ?? null} /></td>
                <td>
                  <span className={`rel rel-${s.relevance.relevance}`}>
                    {s.relevance.relevance === "match" ? `yes: ${s.relevance.matched.join(", ")}` : s.relevance.relevance === "generic" ? "any race" : `no: ${s.relevance.blockers.join(", ")}`}
                  </span>
                  {s.relevance.unknown.length > 0 && <span className="muted small"> · depends on {s.relevance.unknown.join(", ")}</span>}
                </td>
                <td className="small">
                  {s.sources.map((src, i) => (
                    <span key={i} className="src" title={`${pct(src.chance)} per inspiration`}>
                      {memberName(src.slot)} <Stars n={src.stars} />
                    </span>
                  ))}
                </td>
                <td className="num">{pct(s.chance)}</td>
                <td className="num" title={s.whiteAppearances ? `${s.whiteAppearances} horse(s) carry it as a white spark` : "Not a white spark here"}>
                  {s.whiteAppearances ? pct(sparkGenerationChance(s.whiteAppearances)) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface RankingProps {
  data: GameData;
  ranked: LineageEvaluation[];
  stats: ExclusionStats;
  current: LineageEvaluation | null;
  onPick: (pair: [number, number]) => void;
}

export function Rankings({ data, ranked, stats, current, onPick }: RankingProps) {
  const reasons = Object.entries(stats.byReason);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Ranked lineages</h2>
        <span className="muted small">{stats.pairsEvaluated} pairs from {stats.candidates} usable veterans, all scored</span>
      </div>
      {reasons.length > 0 && (
        <details className="excl">
          <summary>Excluded: {reasons.reduce((s, [, n]) => s + n, 0)}</summary>
          <ul>{reasons.map(([r, n]) => <li key={r}>{r}: {n}</li>)}</ul>
        </details>
      )}
      <ol className="ranking">
        {ranked.map((ev, i) => {
          const isCurrent = current && current.p1.trainedId === ev.p1.trainedId && current.p2.trainedId === ev.p2.trainedId;
          return (
            <li key={`${ev.p1.trainedId}-${ev.p2.trainedId}`}>
              <button className={isCurrent ? "sel" : ""} onClick={() => onPick([ev.p1.trainedId, ev.p2.trainedId])}>
                <span className="rank-no">{i + 1}</span>
                <span className="rank-pair">
                  {[ev.p1, ev.p2].map((p) => (
                    <span key={p.trainedId} className="rank-member">
                      <Avatar data={data} charaId={p.charaId} size={26} />
                      <span>
                        {data.charaName(p.charaId)}
                        <small className="muted"> {p.parents.map((g) => (g ? data.charaName(g.charaId) : "?")).join(" + ")}</small>
                      </span>
                    </span>
                  ))}
                </span>
                <span className="rank-compat">{ev.compat.parents.map((p) => RANK_SYMBOL[p.rank]).join("")} {ev.compat.total}</span>
                <span className="rank-mini">
                  {ev.components.map((c) => (
                    <span key={c.key} title={`${c.label}: ${c.score == null ? "n/a" : c.score.toFixed(0)}`} style={{ height: `${Math.max(2, c.score ?? 0)}%` }} className={`mini mini-${c.key}`} />
                  ))}
                </span>
                <span className="rank-total">{ev.total.toFixed(1)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function AptitudeSummary({ ev }: { ev: LineageEvaluation }) {
  return (
    <div className="apt-summary">
      {ev.aptitudes.map((a) => (
        <span key={a.key} className={a.need === 0 ? "muted" : a.stars > 0 ? "ok" : "warn"} title={`${a.stars}★ of ${a.label} sparks; ${Math.round(a.chance * 100)}% chance to inherit at least one`}>
          {a.label} {aptitudeLetter(a.targetValue)} · {a.stars}★ {Math.round(a.chance * 100)}%
        </span>
      ))}
    </div>
  );
}
