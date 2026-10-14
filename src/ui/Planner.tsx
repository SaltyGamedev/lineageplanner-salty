import { useMemo, useState } from "react";
import { STYLES, distanceCategory, effectiveConfig, targetContext } from "../domain/config";
import { RANK_SYMBOL } from "../domain/compatibility";
import type { GameData } from "../domain/gameData";
import { SLOTS, evaluate, goalKey, skillVersions, type GoalResult, type Lineage, type Slot, type SparkTier } from "../domain/goals";
import { optimize, type RankOrder } from "../domain/optimizer";
import { SEASONS, WEATHERS, defaultMeeting, meetingCourseId, meetingStatus } from "../domain/raceExtras";
import { TIER_ORDER, resolveTierList } from "../domain/tiers";
import { rosterSparks } from "../domain/roster";
import { FactorType, type Goal, type PlannerConfig, type Priority, type SparkFilter, type Veteran } from "../domain/types";
import { Chance, Empty, Grade, Portrait, Stars, TierBadge, pct, pctFine } from "./common";
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

export function Planner(props: Props) {
  const { data, own, rentals, config, onConfig, goals, onGoals, filters, onFilters, excluded } = props;
  const [open, setOpen] = useState<Open>(null);
  const [manual, setManual] = useState<[number, number] | null>(null);
  const [order, setOrder] = useState<RankOrder>("hits");
  // "Most goals" sorts by priority-weighted hits; show that same number so the column reads in order.
  const skillGoals = goals.filter((g) => g.kind !== "aptitude");
  const totalWeight = skillGoals.reduce((a, g) => a + g.priority, 0);
  const weighted = skillGoals.some((g) => g.priority !== 1);
  const hasApt = goals.some((g) => g.kind === "aptitude");
  const target = config.targetCardId != null ? data.cards.get(config.targetCardId) : undefined;
  const eff = effectiveConfig(config, data);
  const course = eff.courseId != null ? data.courses.get(eff.courseId) : undefined;
  const cm = config.cmId != null ? data.extras.championsMeetings.find((m) => m.id === config.cmId) : undefined;
  const pool = useMemo(() => [...own, ...rentals], [own, rentals]);

  const result = useMemo(() => {
    if (!target || own.length < 1) return null;
    try {
      return optimize(data, own, rentals, config, goals, filters, { excluded }, 20, order);
    } catch {
      return null;
    }
  }, [data, own, rentals, config, goals, filters, excluded, target, order]);

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
              <Summary l={current} />
              <div className="head-actions">
                {manual && <button className="link" onClick={() => setManual(null)}>Back to best</button>}
                {skillGoals.length === 0 && <button className="link" onClick={suggest}>Suggest from tier list</button>}
                <button className="primary small-btn" onClick={() => setOpen("goals")}>+ Goal</button>
              </div>
            </div>
            {!current.ok && <p className="warn small">Doesn't meet the spark filters: no pair does.</p>}
            <Tree data={data} target={target.id} l={current} goals={current.goals} onPick={(slot) => setOpen({ slot })} />
            <GoalTable
              data={data}
              l={current}
              style={eff.style}
              onPriority={(key, priority) => updateGoal(key, { priority })}
              onTier={(key, sparkTier) => updateGoal(key, { sparkTier })}
              onRemoveGoal={(key) => onGoals(goals.filter((g) => goalKey(g) !== key))}
            />
            <SparkPanel
              l={current}
              onRemoveGoal={(key) => onGoals(goals.filter((g) => goalKey(g) !== key))}
              onRemoveFilter={(f) => onFilters(filters.filter((x) => !(x.color === f.color && x.groupId === f.groupId)))}
            />
          </section>

          <section className="panel ranking">
            <div className="panel-head">
              <h2>Best pairs</h2>
              <span className="muted small">{result.pairs} scored{result.filteredOut ? ` · ${result.filteredOut} filtered` : ""}</span>
            </div>
            <div className="seg order-seg" role="group" aria-label="Order pairs by">
              {([["hits", "Most goals", "Most goals passed on (goals marked ! count more)"], ["all", "All goals", "Best chance that every goal is inherited"], ["affinity", "Affinity", "Highest lineage affinity"]] as const).map(([k, label, title]) => (
                <button key={k} className={order === k ? "on" : ""} title={title} onClick={() => setOrder(k)} disabled={k !== "affinity" && skillGoals.length === 0}>{label}</button>
              ))}
            </div>
            <div className={`rank-row rank-head ${hasApt ? "with-apt" : ""}`} aria-hidden>
              <span />
              <span>Pair</span>
              {hasApt && <span className="num" title="Chance to reach your aptitude targets (low end). Pairs are ranked by this first.">Apt</span>}
              <span className="num" title={weighted ? "Expected goals passed on, weighted: goals marked ! count 3×" : "Expected number of your goals this pair passes on"}>
                {weighted ? "Score" : "Hits"}
              </span>
              <span className="num" title="Chance that every goal is inherited">All</span>
              <span className="num" title="Affinity of the whole lineage (the ◎ ○ △ total shown in game). Higher also raises every spark's chance.">Affinity</span>
            </div>
            <ol>
              {result.ranked.map((l, i) => {
                const on = l.p1.trainedId === current.p1.trainedId && l.p2.trainedId === current.p2.trainedId;
                return (
                  <li key={`${l.p1.trainedId}:${l.p2.trainedId}`}>
                    <button className={`rank-row ${hasApt ? "with-apt" : ""} ${on ? "on" : ""}`} onClick={() => setManual([l.p1.trainedId, l.p2.trainedId])}>
                      <span className="rank-no">{i + 1}</span>
                      <span className="rank-pair">
                        {[l.p1, l.p2].map((p) => (
                          <span key={p.trainedId} className="rank-parent" title={parentTitle(data, p)}>
                            <span className={`rank-ava ${p.borrowed ? "rental" : ""}`}>
                              <Portrait data={data} cardId={p.cardId} size={28} />
                            </span>
                            <span className="rank-pname">
                              <span className="rank-cname">{data.charaName(p.charaId)}</span>
                              <span className="rank-gps">
                                {p.parents.map((g, k) => (g ? <Portrait key={k} data={data} cardId={g.cardId} size={16} /> : null))}
                              </span>
                            </span>
                          </span>
                        ))}
                      </span>
                      {hasApt && <span className="num rank-apt" title="Chance to reach your aptitude targets (low end)">{l.aptScore != null ? pct(l.aptScore) : "–"}</span>}
                      <span className="num rank-hits" title={weighted ? "Weighted expected goals (! counts 3×)" : "Expected goals passed on"}>
                        {l.goals.length ? `${((l.score ?? 0) / 100 * totalWeight).toFixed(1)}/${totalWeight}` : "–"}
                      </span>
                      <span className="num rank-all" title="Chance that every goal is inherited">{l.allInherit != null ? pctFine(l.allInherit) : "–"}</span>
                      <span className="num rank-aff" title="Lineage affinity">{RANK_SYMBOL[l.compat.rank]} {l.compat.total}</span>
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

/** Tells apart veterans of the same character: card title, rank score, when it was made, or the friend it comes from. */
function parentTitle(data: GameData, v: Veteran): string {
  const card = data.cards.get(v.cardId);
  const who = v.borrowed ? `Rental from ${v.borrowed.trainerName ?? v.borrowed.trainerId}` : `Rank score ${v.rankScore.toLocaleString()}`;
  const gps = v.parents.map((g) => (g ? data.charaName(g.charaId) : "?")).join(" + ");
  return `${data.charaName(v.charaId)} ${card?.title ?? ""}\n${who} · ${v.createdAt.slice(0, 10)}\nParents: ${gps}`;
}

const g1Names = (data: GameData, ids: number[]) => (ids.length ? ids.map((id) => data.saddles.get(id)?.name ?? id).join(", ") : "none");
const gpShared = (l: Lineage, slot: Slot) => l.compat.parents[slot.startsWith("p1") ? 0 : 1].sharedG1.grandparents[Number(slot[3]) - 1];

/** A horse's blue, pink and green sparks, in that order. */
function baseSparks(data: GameData, m: { factorIds: number[] }) {
  const order = { blue: 0, pink: 1, green: 2 } as const;
  return m.factorIds
    .map((id) => data.factors.get(id))
    .flatMap((f) => {
      if (!f) return [];
      const color: keyof typeof order | null =
        f.type === FactorType.Stat ? "blue" : f.type === FactorType.Aptitude ? "pink" : f.type === FactorType.Unique ? "green" : null;
      return color ? [{ id: f.id, name: f.name, stars: f.stars, color }] : [];
    })
    .sort((a, b) => order[a.color] - order[b.color]);
}

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
              {isParent ? (
                <span
                  className="aff"
                  title={`Own affinity ${l.compat.parents[slot === "p1" ? 0 : 1].own} (as uma.guide shows it). Its sparks roll at ${l.affinity[slot]}, which adds the links with its two grandparents.\nShared G1s with the other parent (${l.compat.parents[slot === "p1" ? 0 : 1].sharedG1.pair.length}): ${g1Names(data, l.compat.parents[slot === "p1" ? 0 : 1].sharedG1.pair)}`}
                >
                  {l.compat.parents[slot === "p1" ? 0 : 1].own}
                </span>
              ) : (
                <>
                  <span className="aff" title="Affinity of this grandparent: its link with the trainee and parent, plus 3 per G1 it shares with the parent.">{l.affinity[slot]}</span>
                  <span className="g1" title={`G1s shared with the parent: ${g1Names(data, gpShared(l, slot))}`}>{gpShared(l, slot).length} G1</span>
                </>
              )}
              {v?.borrowed && <em className="badge rental">rental</em>}
            </div>
            <div className="node-sparks">
              {baseSparks(data, m).map((f) => (
                <span key={f.id} className={`mini chip-${f.color}`} title={`${f.name} ${f.stars}★`}>
                  {f.name.length > 14 ? f.name.slice(0, 13) + "…" : f.name} <Stars n={f.stars} />
                </span>
              ))}
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
  onTier: (key: string, tier: SparkTier) => void;
  onRemoveGoal: (key: string) => void;
}

type SortKey = "tier" | "inherit" | "spark" | "stars";

const starTotal = (r: GoalResult) => r.hits.reduce((a, h) => a + h.stars, 0);

function Summary({ l }: { l: Lineage }) {
  const n = l.goals.length;
  return (
    <div className="summary">
      {n > 0 ? (
        <>
          <div className="stat" title="Chance that every goal is inherited over the two inspirations (each spark rolls independently).">
            <b>{pctFine(l.allInherit ?? 0)}</b><span>all inherited</span>
          </div>
          <div className="stat" title={l.allSpark ? `Chance that your trainee also generates every spark that has a Spark % (${l.allSpark.goals} of ${n} goals), if it learns them.` : "None of these goals has a Spark %."}>
            <b>{l.allSpark ? pctFine(l.allSpark.chance) : "–"}</b><span>all sparks</span>
          </div>
          <div className="stat" title="Expected number of goals passed on.">
            <b>{l.expected.toFixed(1)}<small>/{n}</small></b><span>expected</span>
          </div>
        </>
      ) : (
        <div className="stat"><span className="muted">No goals yet</span></div>
      )}
      <div className="stat" title="Affinity of the whole lineage.">
        <b className={`compat r${l.compat.rank}`}>{RANK_SYMBOL[l.compat.rank]} {l.compat.total}</b><span>affinity</span>
      </div>
    </div>
  );
}

/** Aptitude targets and ★ filters: about sparks, not skill goals, so they live apart from the goal table. */
function SparkPanel({ l, onRemoveGoal, onRemoveFilter }: { l: Lineage; onRemoveGoal: (key: string) => void; onRemoveFilter: (f: SparkFilter) => void }) {
  if (!l.aptitudes.length && !l.filters.length) return null;
  return (
    <div className="spark-panel">
      <h3>Sparks</h3>
      <div className="spark-items">
        {l.aptitudes.map((r) => (
          <div key={r.key} className="spark-item chip-pink">
            <span className="dot" />
            <b>{r.label}</b>
            {r.aptitude && (
              <span className="muted small" title="Pink ★ of this aptitude across the six horses raise the starting grade (up to A).">
                <Grade value={r.aptitude.base} />→<Grade value={r.aptitude.start} /> at start · {r.aptitude.stars}★
              </span>
            )}
            <span
              className="spark-val"
              title={r.inheritMax != null ? `Chance to reach it: ${pct(r.inherit)} if every pink proc rolls 1 hidden point, up to ${pct(r.inheritMax)} if every proc rolls 5 (the split is unknown).` : undefined}
            >
              <Chance value={r.inherit} />
              {r.inheritMax != null && r.inheritMax - r.inherit > 0.005 && <span className="range">–{pct(r.inheritMax)}</span>}
            </span>
            <button className="icon" onClick={() => onRemoveGoal(r.key)} aria-label={`Remove ${r.label}`} title="Remove">✕</button>
          </div>
        ))}
        {l.filters.map((f) => (
          <div key={`${f.filter.color}:${f.filter.groupId}`} className={`spark-item chip-${f.filter.color} ${f.ok ? "" : "fails"}`}>
            <span className="dot" />
            <b>{f.label}</b>
            <span className="spark-val" title="★ of this spark across the six horses">{f.stars}★ {f.ok ? "✓" : "✗"}</span>
            <button className="icon" onClick={() => onRemoveFilter(f.filter)} aria-label={`Remove ${f.label}`} title="Remove">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalTable({ data, l, style, onPriority, onTier, onRemoveGoal }: GoalTableProps) {
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

  if (!l.goals.length) return <p className="muted small">No skill goals yet: pairs are ranked by affinity. Add skills or race sparks to rank by what they pass on.</p>;
  return (
    <table className="goal-table">
      <thead>
        <tr>
          {head("tier", "Goal", "Sort by tier (best first)")}
          {head("inherit", "Inherit", "Chance to inherit (or reach the grade) over both inspirations. Strong empirical finding: base odds × (1 + affinity/100). Aptitude ranges rest on a hypothesis.", "num")}
          {head("spark", "Spark", "Chance your trainee generates this spark (if it learns the skill / wins the race). Estimate: base × 1.1ⁿ.", "num")}
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
            </td>
            <td className="num">
              <Chance value={r.inherit} />
              {r.inheritMax != null && r.inheritMax - r.inherit > 0.005 && (
                <span
                  className="range"
                  title={`Each pink proc gives 1–5 hidden points; the split is unknown. ${pct(r.inherit)} if every proc rolls 1 point, up to ${pct(r.inheritMax)} if every proc rolls 5.`}
                >–{pct(r.inheritMax)}</span>
              )}
            </td>
            <td className="num">
              <Chance value={r.spark} />
              {r.goal.kind === "skill" && r.spark != null && (() => {
                const versions = skillVersions(data, r.goal.groupId);
                // Keep the % aligned with rows that do have a version button.
                if (versions.length < 2) return <span className="ver-btn placeholder" aria-hidden>○</span>;
                const goal = r.goal;
                const cur = versions.includes(goal.sparkTier) ? goal.sparkTier : "white";
                const next = versions[(versions.indexOf(cur) + 1) % versions.length];
                return (
                  <button
                    className="ver-btn"
                    title={`Version your trainee buys: ${TIER_LABEL[cur]}. Only changes Spark % (click for ${TIER_LABEL[next]})`}
                    onClick={() => onTier(r.key, next)}
                  >{TIER_LABEL[cur]}</button>
                );
              })()}
            </td>
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
      </tbody>
    </table>
  );
}
