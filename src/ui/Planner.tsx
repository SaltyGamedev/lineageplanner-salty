import { useMemo, useState } from "react";
import { STYLES, distanceCategory, effectiveConfig, targetContext } from "../domain/config";
import { RANK_SYMBOL } from "../domain/compatibility";
import type { GameData } from "../domain/gameData";
import { SLOTS, evaluate, filterLabel, goalKey, goalLabel, type GoalResult, type Lineage, type Slot } from "../domain/goals";
import { optimize } from "../domain/optimizer";
import { SEASONS, WEATHERS, defaultMeeting, meetingCourseId, meetingStatus } from "../domain/raceExtras";
import { TIER_ORDER, resolveTierList } from "../domain/tiers";
import { rosterSparks } from "../domain/roster";
import type { Goal, PlannerConfig, Priority, SparkFilter, Veteran } from "../domain/types";
import { Chance, Empty, Grade, Portrait, Stars, TierBadge, pct } from "./common";
import { CourseDiagram, FriendsPicker, GoalPicker, RacePicker, TraineePicker, VeteranPicker } from "./pickers";

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
  apiKey: string;
  onApiKey: (k: string) => void;
  onLookup: (trainerId: string) => Promise<void>;
  onRemoveRental: (v: Veteran) => void;
}

type Open = null | "trainee" | "race" | "goals" | "friends" | { slot: 0 | 1 };

const TIER_LABEL = { white: "○", double: "◎", gold: "G" } as const;
const NEXT_TIER = { white: "double", double: "gold", gold: "white" } as const;

export function Planner(props: Props) {
  const { data, own, rentals, config, onConfig, goals, onGoals, filters, onFilters, excluded } = props;
  const [open, setOpen] = useState<Open>(null);
  const [manual, setManual] = useState<[number, number] | null>(null);
  const target = config.targetCardId != null ? data.cards.get(config.targetCardId) : undefined;
  const eff = effectiveConfig(config, data);
  const course = eff.courseId != null ? data.courses.get(eff.courseId) : undefined;
  const cm = config.cmId != null ? data.extras.championsMeetings.find((m) => m.id === config.cmId) : undefined;
  const pool = useMemo(() => [...own, ...rentals], [own, rentals]);

  const result = useMemo(() => {
    if (!target || own.length < 1) return null;
    try {
      return optimize(data, own, rentals, config, goals, filters, { excluded }, 20);
    } catch {
      return null;
    }
  }, [data, own, rentals, config, goals, filters, excluded, target]);

  const current: Lineage | null = useMemo(() => {
    if (!result) return null;
    if (manual) {
      const a = pool.find((v) => v.trainedId === manual[0]);
      const b = pool.find((v) => v.trainedId === manual[1]);
      if (a && b) return evaluate(result.context, a, b);
    }
    return result.ranked[0] ?? null;
  }, [result, manual, pool]);

  const setConfig = (c: PlannerConfig) => {
    if (c.targetCardId !== config.targetCardId || c.useBorrow !== config.useBorrow) setManual(null);
    onConfig(c);
  };
  const cmNext = defaultMeeting(data.extras);
  const useCm = () => {
    if (!cmNext) return;
    setConfig({
      ...config, cmId: cmNext.id, courseId: meetingCourseId(data, cmNext), distanceMeters: cmNext.distance,
      distance: distanceCategory(cmNext.distance), surface: cmNext.ground === 2 ? "dirt" : "turf",
      groundCondition: cmNext.groundCondition, season: cmNext.season, weather: cmNext.weather,
    });
  };

  const updateGoal = (key: string, patch: Partial<Goal>) =>
    onGoals(goals.map((g) => (goalKey(g) === key ? ({ ...g, ...patch } as Goal) : g)));

  // Quick start: tier-list skills the roster already carries.
  const suggest = () => {
    const tiers = resolveTierList(data, eff.style);
    const owned = rosterSparks(data, pool);
    const picks = tiers.entries
      .filter((e) => ["URA", "T0", "T0.5", "T1"].includes(e.tier))
      .flatMap((e) => e.groupIds)
      .filter((g) => owned.has(`skill:${g}`))
      .slice(0, 6)
      .map((groupId): Goal => ({ kind: "skill", groupId, priority: 1, sparkTier: "white" }));
    onGoals([...goals, ...picks.filter((p) => !goals.some((g) => goalKey(g) === goalKey(p)))]);
  };

  const raceLabel = cm
    ? `${cm.name}`
    : course
      ? `${data.tracks.get(course.trackId)} ${course.ground === 2 ? "Dirt" : "Turf"} ${course.distance}m`
      : `${eff.surface === "dirt" ? "Dirt" : "Turf"} · ${{ short: "Sprint", mile: "Mile", middle: "Medium", long: "Long" }[eff.distance]}`;

  return (
    <div className="planner">
      {/* ---------------------------------------------------------- setup */}
      <section className="setup">
        <button className="setup-card" onClick={() => setOpen("trainee")}>
          <Portrait data={data} cardId={target?.id ?? null} size={52} />
          <span>
            <small>Trainee</small>
            <b>{target ? target.name : "Choose…"}</b>
            {target && <span className="muted small">{target.title.replace(/^\[|\]$/g, "")}</span>}
          </span>
        </button>
        <button className="setup-card race" onClick={() => setOpen("race")}>
          <span>
            <small>Race</small>
            <b>{raceLabel}</b>
            <span className="muted small">
              {course && cm ? `${data.tracks.get(course.trackId)} ${course.distance}m · ` : ""}
              {[eff.season && SEASONS[eff.season], eff.weather && WEATHERS[eff.weather]].filter(Boolean).join(" · ")}
            </span>
          </span>
          {course && <CourseDiagram layout={data.extras.courses[String(course.id)]} height={26} />}
        </button>
        <div className="setup-style">
          <small>Style</small>
          <div className="seg">
            {STYLES.map((s) => (
              <button key={s.key} className={config.style === s.key ? "on" : ""} onClick={() => setConfig({ ...config, style: s.key })}>
                {s.label.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="setup-borrow">
          <label className="switch">
            <input type="checkbox" checked={config.useBorrow} onChange={(e) => setConfig({ ...config, useBorrow: e.target.checked })} />
            <span>Rental</span>
          </label>
          <button className="link" onClick={() => setOpen("friends")}>{rentals.length} friends</button>
        </div>
        {!cm && cmNext && meetingStatus(cmNext) !== "past" && (
          <button className="link cm-quick" onClick={useCm}>Use {cmNext.name}</button>
        )}
      </section>

      {/* ---------------------------------------------------------- goals */}
      <section className="goals-bar">
        {goals.map((g) => {
          const key = goalKey(g);
          return (
            <span key={key} className={`goal-chip goal-${g.kind} ${g.priority === 3 ? "prio" : ""}`}>
              {goalLabel(data, g)}
              {g.kind === "skill" && (
                <button className="tier-btn" title="Version your trainee buys (for Spark %): ○ / ◎ / gold" onClick={() => updateGoal(key, { sparkTier: NEXT_TIER[g.sparkTier] })}>
                  {TIER_LABEL[g.sparkTier]}
                </button>
              )}
            </span>
          );
        })}
        {filters.map((f) => (
          <span key={`${f.color}:${f.groupId}`} className={`goal-chip filter chip-${f.color}`}>
            {filterLabel(data, f)}
          </span>
        ))}
        <button className="primary small-btn" onClick={() => setOpen("goals")} disabled={!target}>+ Goal</button>
        {goals.length === 0 && target && <button className="link" onClick={suggest}>Suggest from tier list</button>}
      </section>

      {/* --------------------------------------------------------- result */}
      {!target ? (
        <Empty title="Choose a trainee">
          <button className="primary" onClick={() => setOpen("trainee")}>Choose trainee</button>
        </Empty>
      ) : !current || !result ? (
        <Empty title="No valid pair">Check exclusions, or turn on the rental.</Empty>
      ) : (
        <div className="result-grid">
          <section className="panel">
            <div className="panel-head">
              <h2>
                {current.score != null ? <span className="total">{Math.round(current.score)}%</span> : null}
                <span className={`compat r${current.compat.rank}`}>{RANK_SYMBOL[current.compat.rank]} {current.compat.total}</span>
              </h2>
              {manual && <button className="link" onClick={() => setManual(null)}>Back to best</button>}
            </div>
            {!current.ok && <p className="warn small">Doesn't meet the spark filters: no pair does.</p>}
            <Tree data={data} target={target.id} l={current} goals={current.goals} onPick={(slot) => setOpen({ slot })} />
            <GoalTable
              data={data}
              l={current}
              style={eff.style}
              onPriority={(key, priority) => updateGoal(key, { priority })}
              onRemoveGoal={(key) => onGoals(goals.filter((g) => goalKey(g) !== key))}
              onRemoveFilter={(f) => onFilters(filters.filter((x) => !(x.color === f.color && x.groupId === f.groupId)))}
            />
          </section>

          <section className="panel ranking">
            <div className="panel-head">
              <h2>Best pairs</h2>
              <span className="muted small">{result.pairs} scored{result.filteredOut ? ` · ${result.filteredOut} filtered` : ""}</span>
            </div>
            <ol>
              {result.ranked.map((l, i) => {
                const on = l.p1.trainedId === current.p1.trainedId && l.p2.trainedId === current.p2.trainedId;
                return (
                  <li key={`${l.p1.trainedId}:${l.p2.trainedId}`}>
                    <button className={on ? "on" : ""} onClick={() => setManual([l.p1.trainedId, l.p2.trainedId])}>
                      <span className="rank-no">{i + 1}</span>
                      <Portrait data={data} cardId={l.p1.cardId} size={30} />
                      <Portrait data={data} cardId={l.p2.cardId} size={30} />
                      <span className="rank-names">
                        {data.charaName(l.p1.charaId)} × {data.charaName(l.p2.charaId)}
                        {(l.p1.borrowed || l.p2.borrowed) && <em className="badge rental">rental</em>}
                      </span>
                      <span className="rank-score">{l.score != null ? `${Math.round(l.score)}%` : ""}</span>
                      <span className="rank-aff muted">{l.compat.total}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}

      {/* --------------------------------------------------------- modals */}
      {open === "trainee" && (
        <TraineePicker data={data} value={config.targetCardId} onClose={() => setOpen(null)} onPick={(id) => { setConfig({ ...config, targetCardId: id }); setOpen(null); }} />
      )}
      {open === "race" && <RacePicker data={data} config={config} onChange={setConfig} onClose={() => setOpen(null)} />}
      {open === "goals" && target && (
        <GoalPicker
          data={data}
          pool={pool}
          style={eff.style}
          ctx={targetContext(eff, data)}
          traineeApt={target.aptitudes}
          goals={goals}
          filters={filters}
          onGoals={onGoals}
          onFilters={onFilters}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "friends" && (
        <FriendsPicker data={data} rentals={rentals} apiKey={props.apiKey} onApiKey={props.onApiKey} onLookup={props.onLookup} onRemove={props.onRemoveRental} onClose={() => setOpen(null)} />
      )}
      {open && typeof open === "object" && current && result && (
        <VeteranPicker
          data={data}
          pc={result.context}
          fixed={open.slot === 0 ? current.p2 : current.p1}
          current={open.slot === 0 ? current.p1 : current.p2}
          candidates={config.useBorrow ? pool : own}
          excluded={excluded}
          onClose={() => setOpen(null)}
          onPick={(l) => {
            setManual(open.slot === 0 ? [l.p2.trainedId, l.p1.trainedId] : [l.p1.trainedId, l.p2.trainedId]);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tree

function Tree({ data, target, l, goals, onPick }: { data: GameData; target: number; l: Lineage; goals: GoalResult[]; onPick: (slot: 0 | 1) => void }) {
  const node = (slot: Slot) => {
    const m = l.members[slot];
    const isParent = slot.length === 2;
    const v = isParent ? (m as Veteran) : null;
    const hits = goals.flatMap((g) => g.hits.filter((h) => h.slot === slot).map((h) => ({ g, h })));
    return (
      <div key={slot} className={`node ${isParent ? "parent" : "gp"}`}>
        {m ? (
          <>
            <Portrait data={data} cardId={m.cardId} size={isParent ? 56 : 40} />
            <div className="node-name">{data.charaName(m.charaId)}</div>
            <div className="node-meta">
              <span className="aff" title="This horse's affinity">{l.affinity[slot]}</span>
              {v?.borrowed && <em className="badge rental">rental</em>}
            </div>
            <div className="node-sparks">
              {hits.map(({ g, h }, i) => (
                <span key={i} className={`mini chip-${g.color}`} title={`${g.label} ${h.stars}★ · ${pct(h.chance)} per inspiration`}>
                  {g.label.length > 14 ? g.label.slice(0, 13) + "…" : g.label} <Stars n={h.stars} />
                </span>
              ))}
            </div>
            {isParent && <button className="swap" onClick={() => onPick(slot === "p1" ? 0 : 1)}>Change</button>}
          </>
        ) : (
          <span className="muted small">not recorded</span>
        )}
      </div>
    );
  };
  return (
    <div className="tree">
      <div className="tree-target"><Portrait data={data} cardId={target} size={64} /></div>
      <div className="tree-parents">{node("p1")}{node("p2")}</div>
      <div className="tree-gps">{SLOTS.slice(2).map(node)}</div>
    </div>
  );
}

// ------------------------------------------------------------ goal table

interface GoalTableProps {
  data: GameData;
  l: Lineage;
  style: PlannerConfig["style"];
  onPriority: (key: string, priority: Priority) => void;
  onRemoveGoal: (key: string) => void;
  onRemoveFilter: (f: SparkFilter) => void;
}

type SortKey = "tier" | "inherit" | "spark" | "stars";

const starTotal = (r: GoalResult) => r.hits.reduce((a, h) => a + h.stars, 0);

function GoalTable({ data, l, style, onPriority, onRemoveGoal, onRemoveFilter }: GoalTableProps) {
  const tiers = resolveTierList(data, style);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const tierOf = (r: GoalResult) => (r.goal.kind === "skill" ? (tiers.byGroup.get(r.goal.groupId)?.tier ?? null) : null);

  const rows = useMemo(() => {
    if (!sort) return l.goals;
    // Best first by default: tier ascending (T0 first), chances and stars descending. Unranked rows always go last.
    const value = (r: GoalResult): number | null => {
      switch (sort.key) {
        case "tier": { const t = tierOf(r); return t ? TIER_ORDER[t] : null; }
        case "inherit": return r.inherit;
        case "spark": return r.spark;
        case "stars": return starTotal(r);
      }
    };
    const natural = sort.key === "tier" ? 1 : -1;
    return [...l.goals].sort((a, b) => {
      const x = value(a), y = value(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return (x - y) * natural * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.goals, sort, tiers]);

  const head = (key: SortKey, label: string, title: string, cls = "") => (
    <th className={cls} aria-sort={sort?.key === key ? (sort.dir === 1 ? "descending" : "ascending") : "none"}>
      <button className="sort-btn" title={title} onClick={() => setSort(sort?.key === key ? (sort.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 })}>
        {label}
        <span className="sort-mark">{sort?.key === key ? (sort.dir === 1 ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );

  if (!l.goals.length && !l.filters.length) return <p className="muted small">Add goals to rank pairs by them; until then pairs are ranked by affinity.</p>;
  return (
    <table className="goal-table">
      <thead>
        <tr>
          {head("tier", "Goal", "Sort by tier (best first)")}
          {head("inherit", "Inherit", "Chance to inherit (or reach the grade) over both inspirations", "num")}
          {head("spark", "Spark", "Chance your trainee generates this spark (if it learns the skill / wins the race)", "num")}
          {head("stars", "★", "Sort by total ★ in the lineage", "from")}
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              <button
                className={`prio-btn ${r.goal.priority === 3 ? "on" : ""}`}
                title={r.goal.priority === 3 ? "High priority (counts ×3): click to lower" : "Normal priority: click to count ×3"}
                aria-pressed={r.goal.priority === 3}
                onClick={() => onPriority(r.key, r.goal.priority === 3 ? 1 : 3)}
              >!</button>
              <span className={`dot chip-${r.color}`} />{r.label}
              {tierOf(r) && <TierBadge tier={tierOf(r)} />}
              {r.aptitude && (
                <span className="muted small"> <Grade value={r.aptitude.base} />→<Grade value={r.aptitude.start} /> at start ({r.aptitude.stars}★)</span>
              )}
            </td>
            <td className="num"><Chance value={r.inherit} /></td>
            <td className="num"><Chance value={r.spark} /></td>
            <td className="from">
              <div className="from-cells">
                {r.hits.map((h, i) => (
                  <span key={i} title={`${pct(h.chance)} per inspiration`}>
                    <Portrait data={data} cardId={l.members[h.slot]?.cardId ?? null} size={20} />
                    <Stars n={h.stars} />
                  </span>
                ))}
                {r.hits.length === 0 && <span className="muted small">none</span>}
              </div>
            </td>
            <td className="rm"><button className="icon" onClick={() => onRemoveGoal(r.key)} aria-label={`Remove ${r.label}`} title="Remove">✕</button></td>
          </tr>
        ))}
        {l.filters.map((f) => (
          <tr key={`${f.filter.color}:${f.filter.groupId}`} className={f.ok ? "" : "fails"}>
            <td><span className={`dot chip-${f.filter.color}`} />{f.label}</td>
            <td className="num" colSpan={2}>{f.stars}★ {f.ok ? "✓" : "✗"}</td>
            <td className="from" />
            <td className="rm"><button className="icon" onClick={() => onRemoveFilter(f.filter)} aria-label={`Remove ${f.label}`} title="Remove">✕</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
