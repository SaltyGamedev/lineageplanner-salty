import { useMemo } from "react";
import { DISTANCES, GROUND_CONDITIONS, STYLES, SURFACES, aptitudeLetter, distanceCategory, effectiveConfig } from "../domain/config";
import type { GameData } from "../domain/gameData";
import { SEASONS, WEATHERS, defaultMeeting, meetingCourseId, meetingStatus } from "../domain/raceExtras";
import type { PlannerConfig, ScoreWeights } from "../domain/types";
import { Avatar, EvidenceTag } from "./common";

interface Props {
  data: GameData;
  config: PlannerConfig;
  onConfig: (c: PlannerConfig) => void;
  weights: ScoreWeights;
  onWeights: (w: ScoreWeights) => void;
  onResetWeights: () => void;
}

const TURN_LABEL: Record<number, string> = { 1: "right", 2: "left", 4: "straight" };

export function ConfigPanel({ data, config, onConfig, weights, onWeights, onResetWeights }: Props) {
  const cards = useMemo(
    () => [...data.cards.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
    [data],
  );
  const courses = useMemo(
    () =>
      [...data.courses.values()].sort(
        (a, b) => (data.tracks.get(a.trackId) ?? "").localeCompare(data.tracks.get(b.trackId) ?? "") || a.ground - b.ground || a.distance - b.distance,
      ),
    [data],
  );
  const eff = effectiveConfig(config, data);
  const target = config.targetCardId != null ? data.cards.get(config.targetCardId) : undefined;
  const set = (patch: Partial<PlannerConfig>) => onConfig({ ...config, ...patch });
  const courseLocked = config.courseId != null;
  const meetings = data.extras.championsMeetings;
  const cm = config.cmId != null ? meetings.find((m) => m.id === config.cmId) : undefined;
  const pickMeeting = (id: number | null) => {
    const m = id != null ? meetings.find((x) => x.id === id) : undefined;
    if (!m) return set({ cmId: null });
    const courseId = meetingCourseId(data, m);
    set({
      cmId: m.id,
      courseId,
      distanceMeters: m.distance,
      distance: distanceCategory(m.distance),
      surface: m.ground === 2 ? "dirt" : "turf",
      groundCondition: m.groundCondition,
      season: m.season,
      weather: m.weather,
    });
  };
  const fmtDate = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <aside className="sidebar">
      <section className="panel">
        <h2>Target</h2>
        <label className="field">
          <span>Trainee</span>
          <select
            value={config.targetCardId ?? ""}
            onChange={(e) => set({ targetCardId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Choose a trainee…</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.title}
              </option>
            ))}
          </select>
        </label>
        {target && (
          <div className="target-summary">
            <Avatar data={data} charaId={target.charaId} size={36} />
            <div className="apt-grid">
              {(["turf", "dirt", "short", "mile", "middle", "long", "nige", "senko", "sashi", "oikomi"] as const).map((k) => (
                <span key={k} className={`apt-mini ${[eff.surface, eff.distance, eff.style].includes(k) ? "apt-hl" : ""}`}>
                  {k.slice(0, 3)} <b>{aptitudeLetter(target.aptitudes[k])}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Race</h2>
        {meetings.length > 0 && (
          <label className="field">
            <span>Champions Meeting</span>
            <select value={config.cmId ?? ""} onChange={(e) => pickMeeting(e.target.value ? Number(e.target.value) : null)}>
              <option value="">None (set the race by hand)</option>
              {[...meetings].reverse().map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {fmtDate(m.start)}
                  {meetingStatus(m) === "live" ? " · live" : meetingStatus(m) === "upcoming" ? " · upcoming" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {!cm && defaultMeeting(data.extras) && meetingStatus(defaultMeeting(data.extras)!) !== "past" && (
          <button className="link cm-quick" onClick={() => pickMeeting(defaultMeeting(data.extras)!.id)}>
            Plan for {defaultMeeting(data.extras)!.name} ({meetingStatus(defaultMeeting(data.extras)!)})
          </button>
        )}
        {cm && (
          <p className="cm-summary">
            <b>{cm.name}</b>: {data.tracks.get(cm.trackId) ?? cm.trackId} {cm.ground === 2 ? "Dirt" : "Turf"} {cm.distance}m
            {cm.season != null && ` · ${SEASONS[cm.season]}`}
            {cm.weather != null && ` · ${WEATHERS[cm.weather]}`}
            {cm.groundCondition != null && ` · ${GROUND_CONDITIONS.find((g) => g.id === cm.groundCondition)?.label}`}
            <br />
            <span className="muted small">
              Skills that target this race get ×{weights.cmBonus} <EvidenceTag evidence="preference" />. Schedule from GameTora.
            </span>
          </p>
        )}
        <div className="field">
          <span>Running style</span>
          <div className="seg">
            {STYLES.map((s) => (
              <button key={s.key} className={config.style === s.key ? "on" : ""} onClick={() => set({ style: s.key })}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Racecourse (optional)</span>
          <select value={config.courseId ?? ""} onChange={(e) => set({ courseId: e.target.value ? Number(e.target.value) : null, cmId: null })}>
            <option value="">Any course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {data.tracks.get(c.trackId) ?? c.trackId} {c.ground === 2 ? "Dirt" : "Turf"} {c.distance}m ({TURN_LABEL[c.turn] ?? "?"})
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Distance {courseLocked && <em className="muted">(from course)</em>}</span>
          <div className="seg">
            {DISTANCES.map((d) => (
              <button
                key={d.key}
                disabled={courseLocked}
                className={eff.distance === d.key ? "on" : ""}
                onClick={() => set({ distance: d.key, distanceMeters: null })}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1000}
            max={3600}
            step={100}
            placeholder="or exact metres"
            disabled={courseLocked}
            value={eff.distanceMeters ?? ""}
            onChange={(e) => {
              const m = e.target.value ? Number(e.target.value) : null;
              set(m ? { distanceMeters: m, distance: distanceCategory(m) } : { distanceMeters: null });
            }}
          />
        </div>

        <div className="field">
          <span>Surface {courseLocked && <em className="muted">(from course)</em>}</span>
          <div className="seg">
            {SURFACES.map((s) => (
              <button key={s.key} disabled={courseLocked} className={eff.surface === s.key ? "on" : ""} onClick={() => set({ surface: s.key })}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Track condition</span>
          <select value={config.groundCondition ?? ""} onChange={(e) => set({ groundCondition: e.target.value ? Number(e.target.value) : null, cmId: null })}>
            <option value="">Not specified</option>
            {GROUND_CONDITIONS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            <span>Season</span>
            <select value={config.season ?? ""} onChange={(e) => set({ season: e.target.value ? Number(e.target.value) : null, cmId: null })}>
              <option value="">Any</option>
              {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{SEASONS[v]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Weather</span>
            <select value={config.weather ?? ""} onChange={(e) => set({ weather: e.target.value ? Number(e.target.value) : null, cmId: null })}>
              <option value="">Any</option>
              {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{WEATHERS[v]}</option>)}
            </select>
          </label>
        </div>

        <p className="note">
          Unset race details never rule a skill out; skills that depend on them show "depends on …". Slopes are known
          once a course is chosen.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Weights</h2>
          <button className="link" onClick={onResetWeights}>Reset</button>
        </div>
        <p className="note">All weights are your preferences <EvidenceTag evidence="preference" />.</p>
        {(
          [
            ["compatibility", "Compatibility"],
            ["skills", "Skill sparks"],
            ["aptitudeSparks", "Aptitude sparks"],
            ["statSparks", "Stat sparks"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="slider">
            <span>{label}</span>
            <input type="range" min={0} max={100} value={weights[k]} onChange={(e) => onWeights({ ...weights, [k]: Number(e.target.value) })} />
            <b>{weights[k]}</b>
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={weights.tierList} onChange={(e) => onWeights({ ...weights, tierList: e.target.checked })} />
          Value skills by the community tier list
        </label>
        <label className="slider">
          <span>Champions Meeting skill bonus</span>
          <input type="range" min={1} max={3} step={0.1} value={weights.cmBonus} onChange={(e) => onWeights({ ...weights, cmBonus: Number(e.target.value) })} />
          <b>×{weights.cmBonus.toFixed(1)}</b>
        </label>
        <details>
          <summary>Advanced</summary>
          <label className="slider">
            <span>Skill not on the tier list</span>
            <input type="range" min={0} max={1} step={0.05} disabled={!weights.tierList} value={weights.untieredSkill} onChange={(e) => onWeights({ ...weights, untieredSkill: Number(e.target.value) })} />
            <b>{weights.untieredSkill.toFixed(2)}</b>
          </label>
          <label className="slider">
            <span>Generic skill value</span>
            <input type="range" min={0} max={1} step={0.05} value={weights.genericSkill} onChange={(e) => onWeights({ ...weights, genericSkill: Number(e.target.value) })} />
            <b>{weights.genericSkill.toFixed(2)}</b>
          </label>
          <label className="slider">
            <span>Aptitude spark when already A</span>
            <input type="range" min={0} max={1} step={0.05} value={weights.aptitudeAlreadyA} onChange={(e) => onWeights({ ...weights, aptitudeAlreadyA: Number(e.target.value) })} />
            <b>{weights.aptitudeAlreadyA.toFixed(2)}</b>
          </label>
          {(["speed", "stamina", "power", "guts", "wiz"] as const).map((k) => (
            <label key={k} className="slider">
              <span>{k === "wiz" ? "Wit" : k[0].toUpperCase() + k.slice(1)} spark value</span>
              <input type="range" min={0} max={2} step={0.1} value={weights.stat[k]} onChange={(e) => onWeights({ ...weights, stat: { ...weights.stat, [k]: Number(e.target.value) } })} />
              <b>{weights.stat[k].toFixed(1)}</b>
            </label>
          ))}
        </details>
        <label className="check">
          <input type="checkbox" checked={config.includeNonStandardVeterans} onChange={(e) => set({ includeNonStandardVeterans: e.target.checked })} />
          Include non-standard entries (use_type ≠ 0)
        </label>
      </section>
    </aside>
  );
}
