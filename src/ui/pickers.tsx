import { useMemo, useState } from "react";
import { DISTANCES, GROUND_CONDITIONS, SURFACES, distanceCategory } from "../domain/config";
import { evaluateSkill, type TargetContext } from "../domain/conditions";
import type { GameData } from "../domain/gameData";
import { APT_LABEL, GRADE_LETTER, factorGroupName, goalKey, skillGroupName, type Lineage, type PlanContext } from "../domain/goals";
import { GRADE_A, GRADE_S } from "../domain/inheritance";
import { partnersFor } from "../domain/optimizer";
import { SEASONS, WEATHERS, meetingCourseId, meetingStatus, type CourseExtras } from "../domain/raceExtras";
import { rosterSparks, sparkableSkillGroups } from "../domain/roster";
import { APTITUDE_BY_GROUP, STAT_BY_GROUP, STAT_LABEL } from "../domain/sparks";
import { TIER_ORDER, resolveTierList } from "../domain/tiers";
import { FactorType, type Goal, type PlannerConfig, type SparkFilter, type StyleKey, type Veteran } from "../domain/types";
import { Grade, Modal, Portrait, TierBadge } from "./common";

const norm = (s: string) => s.toLowerCase().normalize("NFKD");

// ---------------------------------------------------------------- trainee

export function TraineePicker({ data, value, onPick, onClose }: { data: GameData; value: number | null; onPick: (id: number) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const cards = useMemo(() => [...data.cards.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id), [data]);
  const shown = cards.filter((c) => !q || norm(`${c.name} ${c.title}`).includes(norm(q)));
  return (
    <Modal title="Trainee" onClose={onClose} wide>
      <input className="search" autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card-grid">
        {shown.map((c) => (
          <button key={c.id} className={`card-cell ${c.id === value ? "on" : ""}`} onClick={() => onPick(c.id)} title={`${c.name} ${c.title}`}>
            <Portrait data={data} cardId={c.id} size={72} />
            <span className="cell-name">{c.name}</span>
            <span className="cell-sub">{c.title.replace(/^\[|\]$/g, "")}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- race

export function CourseDiagram({ layout, height = 40 }: { layout: CourseExtras | undefined; height?: number }) {
  if (!layout?.length) return <div className="course-diagram empty-diagram" style={{ height }} />;
  const L = layout.length;
  const W = 300;
  const x = (m: number) => (m / L) * W;
  // Elevation: integrate gradients (value is ‱); scale to fit.
  const pts: [number, number][] = [[0, 0]];
  let h = 0;
  const spans = [...(layout.slopeSpans ?? [])].sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e, g] of spans) {
    if (s > pos) pts.push([s, h]);
    h += ((e - s) * g) / 10000 / 100;
    pts.push([e, h]);
    pos = e;
  }
  pts.push([L, h]);
  const hs = pts.map((p) => p[1]);
  const lo = Math.min(...hs);
  const span = Math.max(Math.max(...hs) - lo, 1);
  const y = (v: number) => height - 6 - ((v - lo) / span) * (height - 16);
  return (
    <svg className="course-diagram" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden>
      {(layout.straightSpans ?? []).map(([s, e], i) => <rect key={`s${i}`} x={x(s)} y={0} width={x(e) - x(s)} height={5} className="cd-straight" />)}
      {(layout.cornerSpans ?? []).map(([s, e], i) => <rect key={`c${i}`} x={x(s)} y={0} width={x(e) - x(s)} height={5} className="cd-corner" />)}
      <polyline points={pts.map(([m, v]) => `${x(m)},${y(v)}`).join(" ")} className="cd-elev" />
    </svg>
  );
}

const TURN: Record<number, string> = { 1: "R", 2: "L", 4: "straight" };

export function RacePicker({ data, config, onChange, onClose }: { data: GameData; config: PlannerConfig; onChange: (c: PlannerConfig) => void; onClose: () => void }) {
  const meetings = [...data.extras.championsMeetings].reverse();
  const tracks = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const c of data.courses.values()) m.set(c.trackId, [...(m.get(c.trackId) ?? []), c.id]);
    return [...m.entries()].sort((a, b) => (data.tracks.get(a[0]) ?? "").localeCompare(data.tracks.get(b[0]) ?? ""));
  }, [data]);
  const current = config.courseId != null ? data.courses.get(config.courseId) : undefined;
  const [track, setTrack] = useState<number | null>(current?.trackId ?? null);
  const set = (patch: Partial<PlannerConfig>) => onChange({ ...config, ...patch });
  const fmt = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <Modal title="Race" onClose={onClose} wide>
      {meetings.length > 0 && (
        <>
          <h3>Champions Meeting</h3>
          <div className="cm-grid">
            {meetings.slice(0, 8).map((m) => {
              const course = meetingCourseId(data, m);
              const status = meetingStatus(m);
              return (
                <button
                  key={m.id}
                  className={`cm-cell ${config.cmId === m.id ? "on" : ""}`}
                  onClick={() => {
                    set({
                      cmId: m.id, courseId: course, distanceMeters: m.distance, distance: distanceCategory(m.distance),
                      surface: m.ground === 2 ? "dirt" : "turf", groundCondition: m.groundCondition, season: m.season, weather: m.weather,
                    });
                    onClose();
                  }}
                >
                  <span className="cm-name">{m.name} {status !== "past" && <em className={`badge ${status}`}>{status}</em>}</span>
                  <span className="cell-sub">{data.tracks.get(m.trackId)} {m.ground === 2 ? "Dirt" : "Turf"} {m.distance}m · {fmt(m.start)}</span>
                  <CourseDiagram layout={course != null ? data.extras.courses[String(course)] : undefined} height={28} />
                  <span className="cell-sub">
                    {[m.season && SEASONS[m.season], m.weather && WEATHERS[m.weather], GROUND_CONDITIONS.find((g) => g.id === m.groundCondition)?.label].filter(Boolean).join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <h3>Course</h3>
      <div className="chip-row">
        <button className={`pill ${config.courseId == null ? "on" : ""}`} onClick={() => { set({ courseId: null, cmId: null }); setTrack(null); }}>Any</button>
        {tracks.map(([id]) => (
          <button key={id} className={`pill ${track === id ? "on" : ""}`} onClick={() => setTrack(id)}>{data.tracks.get(id) ?? id}</button>
        ))}
      </div>
      {track != null && (
        <div className="course-list">
          {(tracks.find(([id]) => id === track)?.[1] ?? [])
            .map((id) => data.courses.get(id)!)
            .sort((a, b) => a.ground - b.ground || a.distance - b.distance)
            .map((c) => (
              <button key={c.id} className={`course-row ${config.courseId === c.id ? "on" : ""}`} onClick={() => set({ courseId: c.id, cmId: null })}>
                <span className="course-label">{c.ground === 2 ? "Dirt" : "Turf"} {c.distance}m <small className="muted">{TURN[c.turn] ?? ""}</small></span>
                <CourseDiagram layout={data.extras.courses[String(c.id)]} height={26} />
              </button>
            ))}
        </div>
      )}
      {config.courseId == null && (
        <div className="row-fields">
          <div className="seg">
            {DISTANCES.map((d) => (
              <button key={d.key} className={config.distance === d.key ? "on" : ""} onClick={() => set({ distance: d.key, distanceMeters: null })}>{d.label}</button>
            ))}
          </div>
          <div className="seg">
            {SURFACES.map((s) => (
              <button key={s.key} className={config.surface === s.key ? "on" : ""} onClick={() => set({ surface: s.key })}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="row-fields">
        <select value={config.groundCondition ?? ""} onChange={(e) => set({ groundCondition: e.target.value ? Number(e.target.value) : null, cmId: null })}>
          <option value="">Any ground</option>
          {GROUND_CONDITIONS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select value={config.season ?? ""} onChange={(e) => set({ season: e.target.value ? Number(e.target.value) : null, cmId: null })}>
          <option value="">Any season</option>
          {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{SEASONS[v]}</option>)}
        </select>
        <select value={config.weather ?? ""} onChange={(e) => set({ weather: e.target.value ? Number(e.target.value) : null, cmId: null })}>
          <option value="">Any weather</option>
          {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{WEATHERS[v]}</option>)}
        </select>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- veteran

interface VetPickerProps {
  data: GameData;
  pc: PlanContext;
  fixed: Veteran;
  candidates: Veteran[];
  excluded: number[];
  current: Veteran;
  onPick: (l: Lineage) => void;
  onClose: () => void;
}

export function VeteranPicker({ data, pc, fixed, candidates, excluded, current, onPick, onClose }: VetPickerProps) {
  const [q, setQ] = useState("");
  const options = useMemo(() => partnersFor(pc, fixed, candidates, { excluded }), [pc, fixed, candidates, excluded]);
  const shown = options.filter((l) => {
    const v = l.p2;
    return !q || norm(`${data.charaName(v.charaId)} ${data.cards.get(v.cardId)?.title ?? ""}`).includes(norm(q));
  });
  return (
    <Modal title={`Pair with ${data.charaName(fixed.charaId)}`} onClose={onClose} wide>
      <input className="search" autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="vet-list">
        {shown.slice(0, 150).map((l) => {
          const v = l.p2;
          return (
            <button key={v.trainedId} className={`vet-row ${v.trainedId === current.trainedId ? "on" : ""} ${l.ok ? "" : "fails"}`} onClick={() => onPick(l)}>
              <Portrait data={data} cardId={v.cardId} size={40} />
              <span className="vet-name">
                {data.charaName(v.charaId)} {v.borrowed && <em className="badge rental">rental</em>}
                <small className="muted">
                  {v.parents.map((g, i) => (g ? <Portrait key={i} data={data} cardId={g.cardId} size={18} /> : null))}
                </small>
              </span>
              <span className="vet-score">{l.score != null ? `${Math.round(l.score)}%` : ""}</span>
              <span className="vet-aff muted">{l.compat.total}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ goals

interface GoalPickerProps {
  data: GameData;
  pool: Veteran[];
  style: StyleKey;
  ctx: TargetContext;
  traineeApt: Record<string, number> | null;
  goals: Goal[];
  filters: SparkFilter[];
  onGoals: (g: Goal[]) => void;
  onFilters: (f: SparkFilter[]) => void;
  onClose: () => void;
}

type GoalTab = "skill" | "race" | "aptitude" | "filter";

export function GoalPicker({ data, pool, style, ctx, traineeApt, goals, filters, onGoals, onFilters, onClose }: GoalPickerProps) {
  const [tab, setTab] = useState<GoalTab>("skill");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const owned = useMemo(() => rosterSparks(data, pool), [data, pool]);
  const tiers = resolveTierList(data, style);
  const has = (key: string) => goals.some((g) => goalKey(g) === key);
  const toggle = (g: Goal) => (has(goalKey(g)) ? onGoals(goals.filter((x) => goalKey(x) !== goalKey(g))) : onGoals([...goals, g]));

  const skillRows = useMemo(() => {
    const groups = sparkableSkillGroups(data);
    return [...groups.entries()]
      .map(([groupId, skillId]) => {
        const skill = data.skills.get(skillId)!;
        return {
          groupId,
          name: skillGroupName(data, groupId),
          tier: tiers.byGroup.get(groupId)?.tier ?? null,
          fit: evaluateSkill(skill, ctx).relevance,
          count: owned.get(`skill:${groupId}`)?.count ?? 0,
        };
      })
      .sort((a, b) => (a.tier ? TIER_ORDER[a.tier] : 99) - (b.tier ? TIER_ORDER[b.tier] : 99) || b.count - a.count || a.name.localeCompare(b.name));
  }, [data, tiers, ctx, owned]);

  const raceRows = useMemo(() => {
    const seen = new Map<number, string>();
    for (const f of data.factors.values()) if (f.type === FactorType.Race && !seen.has(f.groupId)) seen.set(f.groupId, f.name);
    return [...seen.entries()]
      .map(([groupId, name]) => ({ groupId, name, count: owned.get(`race:${groupId}`)?.count ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data, owned]);

  const match = (name: string) => !q || norm(name).includes(norm(q));

  return (
    <Modal title="Goals" onClose={onClose} wide>
      <div className="seg tabs-seg">
        {([["skill", "Skills"], ["race", "Race sparks"], ["aptitude", "Aptitude"], ["filter", "Spark filters"]] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {(tab === "skill" || tab === "race") && (
        <div className="picker-tools">
          <input className="search" autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Not in roster too</label>
        </div>
      )}

      {tab === "skill" && (
        <div className="opt-list">
          {skillRows.filter((r) => (all || r.count > 0) && match(r.name)).slice(0, 250).map((r) => {
            const key = `skill:${r.groupId}`;
            return (
              <button key={r.groupId} className={`opt-row ${has(key) ? "on" : ""} ${r.fit === "mismatch" ? "dim" : ""}`}
                onClick={() => toggle({ kind: "skill", groupId: r.groupId, priority: 1, sparkTier: "white" })}>
                <span className="opt-check">{has(key) ? "✓" : "+"}</span>
                <span className="opt-name">{r.name}</span>
                <TierBadge tier={r.tier} />
                {r.fit === "match" && <span className="fit" title="Targets this race">race ✓</span>}
                {r.fit === "mismatch" && <span className="fit no" title="Can't trigger in this race">✗</span>}
                <span className="opt-count muted">{r.count || ""}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "race" && (
        <div className="opt-list">
          {raceRows.filter((r) => (all || r.count > 0) && match(r.name)).map((r) => {
            const key = `race:${r.groupId}`;
            return (
              <button key={r.groupId} className={`opt-row ${has(key) ? "on" : ""}`} onClick={() => toggle({ kind: "race", groupId: r.groupId, priority: 1 })}>
                <span className="opt-check">{has(key) ? "✓" : "+"}</span>
                <span className="opt-name">{r.name}</span>
                <span className="opt-count muted">{r.count || ""}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "aptitude" && (
        <div className="apt-goals">
          {(Object.keys(APT_LABEL) as (keyof typeof APT_LABEL)[]).map((k) => {
            const base = traineeApt?.[k] ?? 0;
            const g = goals.find((x) => x.kind === "aptitude" && x.key === k);
            const setGrade = (grade: number) => {
              const rest = goals.filter((x) => !(x.kind === "aptitude" && x.key === k));
              onGoals(g && g.kind === "aptitude" && g.grade === grade ? rest : [...rest, { kind: "aptitude", key: k, grade, priority: 3 }]);
            };
            return (
              <div key={k} className="apt-goal">
                <span>{APT_LABEL[k]}</span>
                {base > 0 && <Grade value={base} />}
                {[GRADE_A, GRADE_S].map((gr) => (
                  <button key={gr} disabled={base >= gr} className={g?.kind === "aptitude" && g.grade === gr ? "on" : ""} onClick={() => setGrade(gr)}>
                    → {GRADE_LETTER[gr]}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {tab === "filter" && <FilterEditor data={data} owned={owned} filters={filters} onFilters={onFilters} />}
    </Modal>
  );
}

function FilterEditor({ data, owned, filters, onFilters }: { data: GameData; owned: ReturnType<typeof rosterSparks>; filters: SparkFilter[]; onFilters: (f: SparkFilter[]) => void }) {
  const [color, setColor] = useState<SparkFilter["color"]>("blue");
  const options = useMemo(() => {
    if (color === "blue") return Object.entries(STAT_BY_GROUP).map(([g, k]) => ({ groupId: Number(g), name: STAT_LABEL[k] }));
    if (color === "pink") return Object.entries(APTITUDE_BY_GROUP).map(([g, k]) => ({ groupId: Number(g), name: APT_LABEL[k] }));
    return [...owned.values()].filter((o) => o.kind === "green").map((o) => ({ groupId: o.groupId, name: factorGroupName(data, o.groupId) }));
  }, [color, owned, data]);
  const get = (groupId: number) => filters.find((f) => f.color === color && f.groupId === groupId)?.minStars ?? 0;
  const setStars = (groupId: number, minStars: number) => {
    const rest = filters.filter((f) => !(f.color === color && f.groupId === groupId));
    onFilters(minStars > 0 ? [...rest, { color, groupId, minStars }] : rest);
  };
  return (
    <>
      <p className="muted small">Minimum total ★ across the six inherited horses. Lineages below it are hidden.</p>
      <div className="seg">
        {(["blue", "pink", "green"] as const).map((c) => (
          <button key={c} className={color === c ? "on" : ""} onClick={() => setColor(c)}>{c === "blue" ? "Blue" : c === "pink" ? "Pink" : "Green"}</button>
        ))}
      </div>
      <div className="filter-list">
        {options.map((o) => {
          const v = get(o.groupId);
          return (
            <div key={o.groupId} className={`filter-row chip-${color}`}>
              <span>{o.name}</span>
              <button onClick={() => setStars(o.groupId, Math.max(0, v - 1))} disabled={v === 0}>−</button>
              <b>{v ? `${v}★` : "–"}</b>
              <button onClick={() => setStars(o.groupId, Math.min(18, v + 1))}>+</button>
            </div>
          );
        })}
        {options.length === 0 && <p className="muted">No green sparks in your roster.</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- friends

interface FriendsProps {
  data: GameData;
  rentals: Veteran[];
  apiKey: string;
  onApiKey: (k: string) => void;
  onLookup: (trainerId: string) => Promise<void>;
  onRemove: (v: Veteran) => void;
  onClose: () => void;
}

export function FriendsPicker({ data, rentals, apiKey, onApiKey, onLookup, onRemove, onClose }: FriendsProps) {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lookup = async () => {
    setBusy(true);
    setErr("");
    try {
      await onLookup(id);
      setId("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Rentals (${rentals.length})`} onClose={onClose}>
      <p className="muted small">Friends' umas you rented before (from your export). One rental per career, 5 per day.</p>
      <div className="vet-list">
        {rentals.map((v) => (
          <div key={v.trainedId} className="vet-row static">
            <Portrait data={data} cardId={v.cardId} size={36} />
            <span className="vet-name">
              {data.charaName(v.charaId)}
              <small className="muted"> {v.borrowed?.trainerName ?? v.borrowed?.trainerId} · {v.borrowed?.seenAt.slice(0, 10)}</small>
            </span>
            {v.borrowed?.source === "uma.moe" && <button className="icon" onClick={() => onRemove(v)} aria-label="Remove">✕</button>}
          </div>
        ))}
        {rentals.length === 0 && <p className="muted">None yet: import an export, or look a friend up below.</p>}
      </div>
      <details className="lookup">
        <summary>Add by trainer ID (uma.moe)</summary>
        <input type="password" placeholder="uma.moe API key" value={apiKey} onChange={(e) => onApiKey(e.target.value)} />
        <div className="row-fields">
          <input placeholder="Trainer ID" value={id} onChange={(e) => setId(e.target.value)} />
          <button className="primary" disabled={!apiKey || !id || busy} onClick={lookup}>{busy ? "…" : "Add"}</button>
        </div>
        {err && <p className="error small">{err}</p>}
        <p className="muted small">The key stays in this browser and is only sent to uma.moe.</p>
      </details>
    </Modal>
  );
}

