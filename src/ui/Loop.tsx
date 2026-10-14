// Loop planner: pick the umas you'd like to keep training as parents; it finds
// which one to train next, from which pair, and which races she should run.

import { useMemo, useState } from "react";
import { effectiveConfig, targetContext } from "../domain/config";
import { RANK_SYMBOL } from "../domain/compatibility";
import type { GameData } from "../domain/gameData";
import { goalKey } from "../domain/goals";
import {
  RACE_PLANS,
  cardStyle,
  goalNote,
  notableSkills,
  optimizeLoop,
  raceGoals,
  slotOfTurn,
  type LoopResult,
  type LoopSetup,
  type RacePlan,
  type ScheduledRace,
} from "../domain/loop";
import { resolveTierList } from "../domain/tiers";
import type { Goal, PlannerConfig, SparkFilter, Veteran } from "../domain/types";
import { Empty, Grade, Modal, Portrait, Spinner, TierBadge, pct, pctFine } from "./common";
import { GoalPicker, TraineePicker } from "./pickers";
import { MONTHS, RaceBanner, YEARS } from "./RaceWins";

interface Props {
  data: GameData;
  own: Veteran[];
  rentals: Veteran[];
  config: PlannerConfig;
  onConfig: (c: PlannerConfig) => void;
  goals: Goal[];
  onGoals: (g: Goal[]) => void;
  filters: SparkFilter[];
  onFilters: (f: SparkFilter[]) => void;
  excluded: number[];
  loopCards: number[];
  onLoopCards: (ids: number[]) => void;
}

const APT_ROWS: [string, ("turf" | "dirt" | "short" | "mile" | "middle" | "long" | "nige" | "senko" | "sashi" | "oikomi")[]][] = [
  ["Surface", ["turf", "dirt"]],
  ["Distance", ["short", "mile", "middle", "long"]],
  ["Style", ["nige", "senko", "sashi", "oikomi"]],
];

export function Loop({ data, own, rentals, config, onConfig, goals, onGoals, filters, onFilters, excluded, loopCards, onLoopCards }: Props) {
  const [picking, setPicking] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [plan, setPlan] = useState<RacePlan>("balanced");
  const [result, setResult] = useState<LoopResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const skillGoals = goals.filter((g) => g.kind !== "aptitude");
  const first = loopCards.length ? data.cards.get(loopCards[0]) : undefined;

  const run = () => {
    setBusy(true);
    setResult(null);
    // Let the spinner paint before the (about a second) search.
    setTimeout(() => {
      const cost = RACE_PLANS.find((p) => p.key === plan)!.cost;
      setResult(optimizeLoop(data, loopCards, own, rentals, config, skillGoals, { excluded }, { limit: 20, raceCost: cost }));
      setSelected(0);
      setBusy(false);
    }, 30);
  };

  const setup = result?.setups[selected];
  const removeCard = (id: number) => {
    onLoopCards(loopCards.filter((x) => x !== id));
    setResult(null);
  };

  return (
    <div className="planner loop">
      <section className="panel">
        <div className="panel-head">
          <h2>Loop umas</h2>
          <button className="primary small-btn" onClick={() => setPicking(true)}>+ Add uma</button>
        </div>
        <p className="muted small">The umas you'd like to keep training as parents. Each card shows its unique skill and the tier-list skills it can learn itself.</p>
        {loopCards.length === 0 ? (
          <p className="muted small">No umas yet: add two or more.</p>
        ) : (
          <div className="loop-cards">
            {loopCards.map((id) => <LoopCard key={id} data={data} cardId={id} onRemove={() => removeCard(id)} />)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Loop goals</h2>
          <button className="primary small-btn" onClick={() => setGoalOpen(true)} disabled={!first}>+ Goal</button>
        </div>
        {skillGoals.length === 0 ? (
          <p className="muted small">Add the skills every horse in the loop should carry. They are shared with the Planner.</p>
        ) : (
          <div className="node-sparks loop-goals">
            {skillGoals.map((g) => (
              <span key={goalKey(g)} className={`mini chip-${g.kind === "race" ? "race" : "white"}`}>
                {labelOf(data, g)}
                <button className="link" aria-label="Remove goal" onClick={() => onGoals(goals.filter((x) => goalKey(x) !== goalKey(g)))}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="loop-controls">
          <label className="switch">
            <input type="checkbox" checked={config.useBorrow} onChange={(e) => onConfig({ ...config, useBorrow: e.target.checked })} />
            <span>Rental</span>
          </label>
          <div className="seg" role="group" aria-label="Races">
            {RACE_PLANS.map((p) => (
              <button key={p.key} className={plan === p.key ? "on" : ""} title={p.title} onClick={() => setPlan(p.key)}>{p.label}</button>
            ))}
          </div>
          <button className="primary" onClick={run} disabled={busy || loopCards.length === 0 || skillGoals.length === 0}>Find best loop</button>
        </div>
      </section>

      {busy && <Spinner label="Scoring every uma and pair…" />}
      {result && !result.setups.length && <Empty title="No valid setup">Add more umas or turn on the rental.</Empty>}
      {result && result.setups.length > 0 && (
        <>
          <LoopRanking data={data} result={result} selected={selected} onSelect={setSelected} />
          {setup && <SetupDetail data={data} s={setup} />}
        </>
      )}

      {picking && (
        <TraineePicker
          data={data}
          value={null}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            if (!loopCards.includes(id)) onLoopCards([...loopCards, id]);
            setResult(null);
            setPicking(false);
          }}
        />
      )}
      {goalOpen && first && (
        <GoalPicker
          data={data}
          pool={[...own, ...rentals]}
          style={cardStyle(first)}
          ctx={targetContext(effectiveConfig({ ...config, targetCardId: first.id, style: cardStyle(first) }, data), data)}
          traineeApt={first.aptitudes}
          goals={goals}
          filters={filters}
          onGoals={onGoals}
          onFilters={onFilters}
          onClose={() => setGoalOpen(false)}
        />
      )}
    </div>
  );
}

export function LoopRanking({ data, result, selected, onSelect }: { data: GameData; result: LoopResult; selected: number; onSelect: (i: number) => void }) {
  return (
    <section className="panel ranking">
      <div className="panel-head">
        <h2>Best loop setups</h2>
        <span className="muted small">{result.pairs.toLocaleString()} scored</span>
      </div>
      <div className="rank-row rank-head loop-row" aria-hidden>
        <span />
        <span>Train · parents</span>
        <span className="num" title="Goals both parents carry">Both</span>
        <span className="num" title="Chance every goal ends up in her and both parents: the loop stays unbroken">Loop</span>
        <span className="num" title="Lineage affinity for this run">Affinity</span>
        <span className="num" title="Affinity she brings as a parent for the next loop uma, incl. expected shared G1s from the race plan">Next</span>
      </div>
      <ol>
        {result.setups.map((s, i) => (
          <li key={`${s.target.id}:${s.lineage.p1.trainedId}:${s.lineage.p2.trainedId}`}>
            <button className={`rank-row loop-row ${i === selected ? "on" : ""}`} onClick={() => onSelect(i)}>
              <span className="rank-no">{i + 1}</span>
              <span className="rank-pair">
                <span className="rank-names">
                  <b>{s.target.name}</b> ← {data.charaName(s.lineage.p1.charaId)} × {data.charaName(s.lineage.p2.charaId)}
                </span>
                <span className="rank-avas">
                  <Portrait data={data} cardId={s.target.id} size={26} />
                  <span className="muted">←</span>
                  {[s.lineage.p1, s.lineage.p2].map((p) => (
                    <span key={p.trainedId} className="rank-parent">
                      <span className={`rank-ava ${p.borrowed ? "rental" : ""}`}><Portrait data={data} cardId={p.cardId} size={24} /></span>
                      <span className="rank-gps">{p.parents.map((g, k) => (g ? <Portrait key={k} data={data} cardId={g.cardId} size={16} /> : null))}</span>
                    </span>
                  ))}
                </span>
              </span>
              <span className="num rank-hits">{s.covered}/{s.goals.length}</span>
              <span className="num rank-all">{pctFine(s.unbroken)}</span>
              <span className="num rank-aff">{RANK_SYMBOL[s.lineage.compat.rank]} {s.lineage.compat.total}</span>
              <span className="num rank-aff">{Math.round(s.nextAffinity + (s.schedule?.expectedAffinity ?? 0))}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function labelOf(data: GameData, g: Goal): string {
  if (g.kind === "aptitude") return g.key;
  for (const s of data.skills.values()) if (g.kind === "skill" && (s.groupId || s.id) === g.groupId && s.rarity === 1) return s.name;
  for (const f of data.factors.values()) if (f.groupId === g.groupId) return f.name;
  return String(g.groupId);
}

// ------------------------------------------------------------------ cards

function LoopCard({ data, cardId, onRemove }: { data: GameData; cardId: number; onRemove: () => void }) {
  const card = data.cards.get(cardId);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const notable = useMemo(() => (card ? notableSkills(data, card) : []), [data, card]);
  if (!card) return null;
  const style = cardStyle(card);
  const unique = card.uniqueSkillId != null ? data.skills.get(card.uniqueSkillId) : undefined;
  const uniqueTier = unique ? resolveTierList(data, style).byGroup.get(unique.groupId || unique.id)?.tier ?? null : null;
  const { races } = raceGoals(data, card.charaId);
  return (
    <div className="loop-card">
      <button className="icon loop-x" onClick={onRemove} aria-label="Remove">✕</button>
      <div className="loop-card-head">
        <Portrait data={data} cardId={card.id} size={48} />
        <div>
          <b>{card.name}</b>
          <div className="muted small">{card.title}</div>
        </div>
      </div>
      <div className="loop-apts">
        {APT_ROWS.map(([label, keys]) => (
          <div key={label} className="loop-apt-row">
            <span className="muted">{label}</span>
            {keys.map((k) => <Grade key={k} value={card.aptitudes[k]} />)}
          </div>
        ))}
      </div>
      {unique && (
        <div className="loop-unique">
          <span className="mini chip-green" title={unique.desc}>{unique.name}</span> <TierBadge tier={uniqueTier} />
        </div>
      )}
      <div className="loop-notable">
        {notable.slice(0, 8).map(({ entry, skillId }) => (
          <span key={skillId} className="loop-skill" title={entry.note ?? data.skills.get(skillId)?.desc}>
            <TierBadge tier={entry.tier} /> {data.skills.get(skillId)?.name ?? entry.label}
          </span>
        ))}
        {notable.length === 0 && <span className="muted small">No tier-list skills of her own.</span>}
      </div>
      <button className="link small" onClick={() => setGoalsOpen(true)}>{races.length} career goals</button>
      {goalsOpen && (
        <Modal title={`${card.name}: career goals`} onClose={() => setGoalsOpen(false)}>
          <CareerGoals data={data} charaId={card.charaId} />
        </Modal>
      )}
    </div>
  );
}

function slotLabel(turn: number) {
  const { year, month, half } = slotOfTurn(turn);
  return `${YEARS[year - 1]} ${MONTHS[month - 1]} ${half === 1 ? "i" : "ii"}`;
}

function CareerGoals({ data, charaId }: { data: GameData; charaId: number }) {
  const { races, notes } = raceGoals(data, charaId);
  return (
    <ul className="loop-goal-list">
      {[...races.map((r) => ({ turn: r.options[0].turn, text: `${r.options.map((o) => o.name).join(" or ")} · top ${r.goal.value}` })), ...notes.map((n) => ({ turn: n.turn, text: goalNote(n) }))]
        .sort((a, b) => a.turn - b.turn)
        .map((g, i) => (
          <li key={i}>
            <span className="muted small">{slotLabel(g.turn)}</span> {g.text}
          </li>
        ))}
    </ul>
  );
}

// ----------------------------------------------------------------- detail

export function SetupDetail({ data, s }: { data: GameData; s: LoopSetup }) {
  const sc = s.schedule;
  const name = (v: Veteran) => data.charaName(v.charaId);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Train {s.target.name} from {name(s.lineage.p1)} × {name(s.lineage.p2)}
        </h2>
        {s.nextTarget && <span className="muted small">then use her for {s.nextTarget.name}</span>}
      </div>
      <table className="goal-table loop-table">
        <thead>
          <tr>
            <th>Goal</th>
            <th className="num">{name(s.lineage.p1)}</th>
            <th className="num">{name(s.lineage.p2)}</th>
            <th className="num" title="Chance she gets the skill: her own skill, or inherited from the sparks">Learns</th>
            <th className="num" title="Chance she generates the spark herself">Spark</th>
            <th className="num" title="Chance the goal is in her and both parents afterwards">Kept</th>
          </tr>
        </thead>
        <tbody>
          {s.goals.map((g) => (
            <tr key={g.key}>
              <td>{g.label}</td>
              <td className="num">{g.inP1 ? "✓" : <span className="bad">✗</span>}</td>
              <td className="num">{g.inP2 ? "✓" : <span className="bad">✗</span>}</td>
              <td className="num">{g.ownSkill ? <span title="One of her own skills">own</span> : pct(g.learn)}</td>
              <td className="num">{g.spark == null ? "–" : pct(g.spark)}</td>
              <td className="num"><b>{pct(g.kept)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {sc && (
        <>
          <h3 className="loop-sub">Race plan (Independent Training)</h3>
          <p className="muted small">
            {sc.races.filter((r) => r.goal).length} goal races + {sc.extraRaces} extra G1s · expected shared G1s: {name(s.lineage.p1)} {sc.expectedShared[0].toFixed(1)}, {name(s.lineage.p2)} {sc.expectedShared[1].toFixed(1)} · +{Math.round(sc.expectedAffinity)} affinity.
            {" "}Win chances use her starting aptitudes (with the pink sparks of this lineage) and uma.guide's table, minus the penalty for racing 3+ times in a row.
          </p>
          <p className="muted small loop-legend">
            <span className="win-key goal" /> goal race <span className="win-key" /> G1 a parent won (+3 affinity each) · % = win chance, orange after 3+ races in a row
          </p>
          <ScheduleCalendar races={sc.races} />
          {sc.notes.length > 0 && <p className="muted small">Other goals: {sc.notes.map((n) => `${goalNote(n)} (${slotLabel(n.turn)})`).join(" · ")}</p>}
        </>
      )}
    </section>
  );
}

function ScheduleCalendar({ races }: { races: ScheduledRace[] }) {
  const at = new Map(races.map((r) => [r.turn, r]));
  return (
    <div className="wins-years">
      {YEARS.map((year, y) => (
        <section key={year} className="wins-year">
          <h3>{year}</h3>
          <div className="wins-grid">
            {Array.from({ length: 24 }, (_, i) => {
              const turn = y * 24 + i + 1;
              const r = at.get(turn);
              const { month, half } = slotOfTurn(turn);
              return (
                <div key={turn} className="wins-cell">
                  {r && (
                    <div
                      className={`win ${r.goal ? "win-goal" : r.sharedWith ? "win-shared" : ""} ${r.consecutive >= 3 ? "win-tired" : ""}`}
                      title={`${r.name}${r.goal ? ` · goal: top ${r.placement}` : ""} · ${pct(r.win)} win${r.consecutive >= 3 ? ` (${r.consecutive} in a row)` : ""}${r.sharedWith ? ` · won by ${r.sharedWith} of her parents: +${3 * r.sharedWith} affinity` : ""}`}
                    >
                      <RaceBanner raceId={r.raceId} name={r.name} />
                    </div>
                  )}
                  <span className="wins-date">
                    {MONTHS[month - 1]} {half === 1 ? "i" : "ii"}
                    {r && <b className={r.consecutive >= 3 ? "tired" : ""}> · {Math.round(r.win * 100)}%</b>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
