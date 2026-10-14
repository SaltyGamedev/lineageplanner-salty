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
  type LoopObjective,
  type LoopResult,
  type LoopSetup,
  type RacePlan,
  type ScheduledRace,
} from "../domain/loop";
import { bestGroups, startRuns, type LoopGroup } from "../domain/loopGroup";
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
  const [objective, setObjective] = useState<LoopObjective>("loop");
  const [result, setResult] = useState<LoopResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const skillGoals = goals.filter((g) => g.kind !== "aptitude");
  const first = loopCards.length ? data.cards.get(loopCards[0]) : undefined;
  const raceCost = RACE_PLANS.find((p) => p.key === plan)!.cost;
  const [groups, setGroups] = useState<LoopGroup[] | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const charas = new Set(loopCards.map((id) => data.cards.get(id)?.charaId)).size;

  const run = () => {
    setBusy(true);
    setResult(null);
    // Let the spinner paint before the (about a second) search.
    setTimeout(() => {
      setResult(optimizeLoop(data, loopCards, own, rentals, config, skillGoals, { excluded }, { limit: 20, raceCost, objective }));
      setSelected(0);
      setBusy(false);
    }, 30);
  };

  const runGroups = () => {
    setGroupBusy(true);
    setGroups(null);
    setTimeout(() => {
      setGroups(bestGroups(data, loopCards, { size: 4, raceCost, limit: 10 }));
      setGroupBusy(false);
    }, 30);
  };

  const setup = result?.setups[selected];
  const removeCard = (id: number) => {
    onLoopCards(loopCards.filter((x) => x !== id));
    setResult(null);
    setGroups(null);
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
          <div className="seg" role="group" aria-label="Rank by">
            <button className={objective === "loop" ? "on" : ""} title="Every goal skill in her and both parents first" onClick={() => setObjective("loop")}>Unbroken loop</button>
            <button
              className={objective === "affinity" ? "on" : ""}
              title="Most affinity first: now, as the next parent, and from the G1s she can win (her parents' dirt and distance pink sparks raise her win chances)"
              onClick={() => setObjective("affinity")}
            >
              Affinity
            </button>
          </div>
          <button
            className="primary"
            onClick={run}
            disabled={busy || loopCards.length === 0 || (objective === "loop" && skillGoals.length === 0)}
            title="Your next run only: which loop uma to train now and which pair of your veterans to use, ranked by the goals and affinity above, with her race plan."
          >
            Find best loop
          </button>
          <button
            className="primary"
            onClick={runGroups}
            disabled={groupBusy || charas < 4}
            title={
              "The long-term plan: the best four loop umas to train in rotation forever, all running one shared race plan so every horse in every lineage shares the same G1s. " +
              "Ranked by affinity once the loop is going, with the best run to start it from your veterans now. Ignores the goals and the Rank by setting." +
              (charas < 4 ? " Needs four different umas." : "")
            }
          >
            Find best 4-uma loop
          </button>
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

      {groupBusy && <Spinner label="Planning every group of four…" />}
      {groups && <GroupSection key={groups.map((x) => x.members.map((m) => m.card.id).join(":")).join("/")} data={data} groups={groups} own={own} rentals={rentals} config={config} excluded={excluded} />}

      {picking && (
        <TraineePicker
          data={data}
          value={null}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            if (!loopCards.includes(id)) onLoopCards([...loopCards, id]);
            setResult(null);
            setGroups(null);
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
        <span className="num" title="Expected affinity from the G1s her parents won that she wins too (race plan)">Races</span>
        <span className="num" title="Affinity she brings as a parent for the next loop uma (relations with her grandparents-to-be), before races">Next</span>
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
              <span className="num rank-aff">+{Math.round(s.schedule?.expectedAffinity ?? s.potential)}</span>
              <span className="num rank-aff">{s.nextAffinity}</span>
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
      {s.goals.length > 0 && (
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
      )}
      {sc && (
        <>
          <h3 className="loop-sub">Race plan (Independent Training)</h3>
          <p className="muted small">
            {sc.races.filter((r) => r.goal).length} goal races + {sc.extraRaces} extra G1s · expected shared G1s: {name(s.lineage.p1)} {sc.expectedShared[0].toFixed(1)}, {name(s.lineage.p2)} {sc.expectedShared[1].toFixed(1)} · +{Math.round(sc.expectedAffinity)} affinity.
            {" "}Win chances use her expected aptitude each year (below) and uma.guide's table, minus the penalty for racing 3+ times in a row.
          </p>
          <AptitudeTable s={s} />
          {s.advice && s.advice.length > 0 && (
            <p className="small loop-advice">
              <b>Raise to A for more shared G1s:</b>{" "}
              {s.advice.slice(0, 3).map((a, i) => (
                <span key={a.key}>
                  {i ? " · " : ""}
                  {APT_NAME[a.key]} A <b>+{Math.round(a.gain)}</b> affinity ({a.races} {APT_NAME[a.key].toLowerCase()} G1s her parents won)
                </span>
              ))}
              . Parents and grandparents with {APT_NAME[s.advice[0].key].toLowerCase()} pink sparks get her there.
            </p>
          )}
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

const APT_NAME: Record<string, string> = { turf: "Turf", dirt: "Dirt", short: "Sprint", mile: "Mile", middle: "Medium", long: "Long" };

/** Expected surface and distance grades per career year (fractional: rounded letter, exact value on hover). */
function AptitudeTable({ s }: { s: LoopSetup }) {
  const keys = ["turf", "dirt", "short", "mile", "middle", "long"] as const;
  return (
    <table className="goal-table loop-apt-table">
      <thead>
        <tr>
          <th />
          {keys.map((k) => <th key={k} className="num">{APT_NAME[k]}</th>)}
        </tr>
      </thead>
      <tbody>
        {YEARS.map((year, y) => (
          <tr key={year}>
            <td className="muted">{year}</td>
            {keys.map((k) => {
              const v = s.aptitudes[y][k];
              return (
                <td key={k} className="num" title={`Expected grade ${v.toFixed(2)} (1 = G … 7 = A, 8 = S)`}>
                  <Grade value={Math.round(v)} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScheduleCalendar({ races, sharedLabel = "of her parents" }: { races: ScheduledRace[]; sharedLabel?: string }) {
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
                      title={`${r.name}${r.goal ? ` · goal: top ${r.placement}` : ""} · ${pct(r.win)} win${r.consecutive >= 3 ? ` (${r.consecutive} in a row)` : ""}${r.sharedWith ? ` · also run by ${r.sharedWith} ${sharedLabel}` : ""}`}
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

// ------------------------------------------------------------ fixed loops

/**
 * The fixed 4-uma loop: the same four umas trained in rotation, all running
 * one shared race plan, so every horse of every lineage shares the same G1s.
 */
function GroupSection({ data, groups, own, rentals, config, excluded }: {
  data: GameData;
  groups: LoopGroup[];
  own: Veteran[];
  rentals: Veteran[];
  config: PlannerConfig;
  excluded: number[];
}) {
  const [selected, setSelected] = useState(0);
  const g = groups[selected];
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Fixed 4-uma loop</h2>
      </div>
      <p className="muted small">
        Train the same four umas in rotation, all running the same G1s. Four is the smallest loop where every parent and grandparent is another loop uma (with three,
        two grandparents are the trainee herself and add nothing), and a G1 they all win counts for every pair in the lineage: +15 affinity per run. Pick umas
        with dirt and distance aptitudes that cover many G1s, or with a green skill you want.
      </p>
      {groups && !groups.length && <p className="muted small">Add at least four different umas.</p>}
      {groups && groups.length > 0 && (
        <>
          <div className="rank-row rank-head group-row" aria-hidden>
            <span />
            <span>Umas</span>
            <span className="num" title="Mean lineage affinity per run once the loop is going">Affinity</span>
            <span className="num" title="From relations between the four umas">Relations</span>
            <span className="num" title="From shared G1 wins (expected)">Races</span>
            <span className="num" title="Race affinity gained over the same number of races in schedules that don't line up">vs unaligned</span>
          </div>
          <ol className="group-list">
            {groups.map((x, i) => (
              <li key={x.members.map((m) => m.card.id).join(":")}>
                <button className={`rank-row group-row ${i === selected ? "on" : ""}`} onClick={() => setSelected(i)}>
                  <span className="rank-no">{i + 1}</span>
                  <span className="rank-pair">
                    <span className="rank-names">{x.members.map((m) => m.card.name).join(" · ")}</span>
                    <span className="rank-avas">{x.members.map((m) => <Portrait key={m.card.id} data={data} cardId={m.card.id} size={24} />)}</span>
                  </span>
                  <span className="num rank-hits">{Math.round(x.affinity)}</span>
                  <span className="num rank-aff">{Math.round(x.relations)}</span>
                  <span className="num rank-aff">{Math.round(x.races)}</span>
                  <span className="num rank-aff">+{Math.round(x.races - x.independentRaces)}</span>
                </button>
              </li>
            ))}
          </ol>
          {g && <StartNow data={data} g={g} own={own} rentals={rentals} config={config} excluded={excluded} />}
          {g && <GroupDetail g={g} />}
        </>
      )}
    </section>
  );
}

/** The best runs to start the selected group with the veterans you have now. */
function StartNow({ data, g, own, rentals, config, excluded }: { data: GameData; g: LoopGroup; own: Veteran[]; rentals: Veteran[]; config: PlannerConfig; excluded: number[] }) {
  const runs = useMemo(() => startRuns(g, data, own, rentals, config, { excluded }), [g, data, own, rentals, config, excluded]);
  const steady = (t: number) => g.runs.find((r) => r.trainee.id === t);
  return (
    <div className="group-detail">
      <h3 className="loop-sub">Start now with your veterans</h3>
      {runs.length === 0 ? (
        <p className="muted small">
          You have no pair of veterans of two of these umas yet{config.useBorrow ? "" : " (try turning on the rental)"}. Train any two of them first; they become
          the parents of the third.
        </p>
      ) : (
        <>
          <p className="muted small">
            Train her from these two, then race her shared plan below: she becomes a parent the next runs share G1s with. Grandparents from outside the loop
            only cost this run; the loop fills in as you go.
          </p>
          <table className="goal-table loop-table">
            <thead>
              <tr>
                <th>Train</th>
                <th>Parents (their parents)</th>
                <th className="num" title="Grandparents that are other loop umas (4 once the loop is going)">In loop</th>
                <th className="num" title="Lineage affinity of this run, with your veterans' real parents and G1 wins">Affinity now</th>
                <th className="num" title="Mean affinity of her run once the loop is going">Later</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={`${r.trainee.id}:${r.p1.trainedId}:${r.p2.trainedId}`}>
                  <td><b>{r.trainee.name}</b></td>
                  <td>
                    {[r.p1, r.p2].map((p, k) => (
                      <span key={p.trainedId}>
                        {k > 0 && " × "}
                        {data.charaName(p.charaId)}
                        {p.borrowed && <span className="muted small"> (rental)</span>}{" "}
                        <span className="muted small">({p.parents.map((x) => (x ? data.charaName(x.charaId) : "—")).join(", ")})</span>
                      </span>
                    ))}
                  </td>
                  <td className="num">{r.inLoop}/4</td>
                  <td className="num"><b>{r.affinity}</b></td>
                  <td className="num muted">{Math.round(steady(r.trainee.id)?.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function GroupDetail({ g }: { g: LoopGroup }) {
  const [who, setWho] = useState(0);
  const m = g.members[Math.min(who, g.members.length - 1)];
  // Mark each race with how many of the other three plan it too.
  const races = m.races.map((r) => ({ ...r, sharedWith: g.members.filter((o) => o !== m && r.saddleId != null && o.wins.has(r.saddleId)).length }));
  return (
    <div className="group-detail">
      <h3 className="loop-sub">Rotation</h3>
      <table className="goal-table loop-table">
        <thead>
          <tr>
            <th>Train</th>
            <th>Parents</th>
            <th>Their parents</th>
            <th className="num">Relations</th>
            <th className="num">Races</th>
            <th className="num">Affinity</th>
          </tr>
        </thead>
        <tbody>
          {g.runs.map((r) => (
            <tr key={r.trainee.id}>
              <td><b>{r.trainee.name}</b></td>
              <td>{r.parents[0].name} × {r.parents[1].name}</td>
              <td className="muted small">
                {r.parents[0].name}: {r.parents[1].name} + {r.fourth?.name ?? "—"} · {r.parents[1].name}: {r.parents[0].name} + {r.fourth?.name ?? "—"}
              </td>
              <td className="num">{r.relations}</td>
              <td className="num">{Math.round(r.races)}</td>
              <td className="num"><b>{Math.round(r.total)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="loop-sub">Shared race plan · {g.sharedG1s} G1s all four run</h3>
      <div className="seg group-tabs" role="tablist">
        {g.members.map((x, i) => (
          <button key={x.card.id} role="tab" aria-selected={x === m} className={x === m ? "on" : ""} onClick={() => setWho(i)}>
            {x.card.name} <span className="muted small">Dirt <Grade value={x.card.aptitudes.dirt} /></span>
          </button>
        ))}
      </div>
      <p className="muted small">
        {m.races.filter((r) => r.goal).length} goal races + {m.races.filter((r) => !r.goal).length} extra G1s, with her base aptitudes (pink sparks in the loop
        only raise them). Hover a race to see how many of the other three run it.
      </p>
      <ScheduleCalendar races={races} sharedLabel="of the other loop umas" />
    </div>
  );
}
