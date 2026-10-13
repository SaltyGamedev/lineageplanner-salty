import { useMemo, useRef, useState } from "react";
import { RANK_SYMBOL } from "../domain/compatibility";
import type { GameData } from "../domain/gameData";
import { createScoringContext, evaluateLineage, type LineageEvaluation } from "../domain/scoring";
import type { Veteran } from "../domain/types";
import { exportPlanFile, parsePlanFile, type SavedPlan } from "../state/storage";
import { Avatar, Empty, EvidenceTag, ScoreBar } from "./common";

interface Props {
  data: GameData;
  veterans: Veteran[];
  plans: SavedPlan[];
  onPlans: (p: SavedPlan[]) => void;
  onOpen: (p: SavedPlan) => void;
}

type Evaluated = { plan: SavedPlan; ev: LineageEvaluation | null; problem: string | null };

/** Re-score a saved plan against the current roster and game data. */
export function evaluatePlan(data: GameData, veterans: Veteran[], plan: SavedPlan): Evaluated {
  const [a, b] = plan.pair.map((id) => veterans.find((v) => v.trainedId === id));
  if (!a || !b) return { plan, ev: null, problem: "A veteran from this plan is not in the imported roster." };
  try {
    return { plan, ev: evaluateLineage(createScoringContext(data, plan.config, plan.weights), a, b), problem: null };
  } catch (e) {
    return { plan, ev: null, problem: (e as Error).message };
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlansView({ data, veterans, plans, onPlans, onOpen }: Props) {
  const [compare, setCompare] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const evaluated = useMemo(() => plans.map((p) => evaluatePlan(data, veterans, p)), [data, veterans, plans]);
  const compared = evaluated.filter((e) => compare.includes(e.plan.id));

  const importFile = async (file: File) => {
    setError(null);
    try {
      const incoming = parsePlanFile(await file.text());
      const ids = new Set(plans.map((p) => p.id));
      onPlans([...plans, ...incoming.filter((p) => !ids.has(p.id))]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="plans">
      <section className="panel">
        <div className="panel-head">
          <h2>Saved plans</h2>
          <div className="btn-row">
            <button onClick={() => fileRef.current?.click()}>Import plans…</button>
            <button disabled={!plans.length} onClick={() => download("lineage-plans.json", exportPlanFile(plans))}>Export all</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {!plans.length ? (
          <Empty title="No saved plans yet">Use “Save plan” on the planner to keep a lineage. Plans stay in this browser and can be exported as a file.</Empty>
        ) : (
          <ul className="plan-list">
            {evaluated.map(({ plan, ev, problem }) => (
              <li key={plan.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={compare.includes(plan.id)}
                    onChange={(e) => setCompare(e.target.checked ? [...compare, plan.id].slice(-3) : compare.filter((x) => x !== plan.id))}
                  />
                </label>
                <div className="plan-main">
                  <b>{plan.name}</b>
                  <div className="muted small">
                    {data.cardLabel(plan.config.targetCardId ?? 0)} · {plan.config.distanceMeters ?? plan.config.distance} · {plan.config.surface} · saved {new Date(plan.savedAt).toLocaleString()}
                  </div>
                  {problem && <div className="error small">{problem}</div>}
                </div>
                <div className="plan-score">
                  {ev ? ev.total.toFixed(1) : "—"}
                  {ev && Math.abs(ev.total - plan.scoreAtSave) > 0.05 && <small className="muted"> (was {plan.scoreAtSave.toFixed(1)})</small>}
                </div>
                <div className="btn-row">
                  <button disabled={!ev} onClick={() => onOpen(plan)}>Open</button>
                  <button onClick={() => download(`${plan.name.replace(/[^\w-]+/g, "_")}.json`, exportPlanFile([plan]))}>Export</button>
                  <button className="danger" onClick={() => onPlans(plans.filter((p) => p.id !== plan.id))}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {plans.length > 1 && <p className="muted small">Tick up to three plans to compare them side by side.</p>}
      </section>

      {compared.length > 0 && <Comparison data={data} items={compared} />}
    </div>
  );
}

function Comparison({ data, items }: { data: GameData; items: Evaluated[] }) {
  const rows = items[0]?.ev?.components.map((c) => c.key) ?? ["compatibility", "skills", "aptitudeSparks", "statSparks"];
  return (
    <section className="panel">
      <h2>Comparison</h2>
      <div className="compare" style={{ gridTemplateColumns: `160px repeat(${items.length}, minmax(0, 1fr))` }}>
        <div />
        {items.map(({ plan, ev }) => (
          <div key={plan.id} className="compare-head">
            <b>{plan.name}</b>
            {ev && (
              <div className="compare-pair">
                {[ev.p1, ev.p2].map((p) => (
                  <span key={p.trainedId}><Avatar data={data} charaId={p.charaId} size={24} /> {data.charaName(p.charaId)}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="compare-label">Total</div>
        {items.map(({ plan, ev }) => <div key={plan.id} className="compare-total">{ev ? ev.total.toFixed(1) : "—"}</div>)}
        {rows.map((key) => {
          const sample = items.find((i) => i.ev)?.ev?.components.find((c) => c.key === key);
          return [
            <div key={key} className="compare-label">{sample?.label ?? key} {sample && <EvidenceTag evidence={sample.evidence} />}</div>,
            ...items.map(({ plan, ev }) => {
              const c = ev?.components.find((x) => x.key === key);
              return <div key={plan.id + key}>{c ? <ScoreBar value={c.score} /> : "—"}</div>;
            }),
          ];
        })}
        <div className="compare-label">Compatibility</div>
        {items.map(({ plan, ev }) => (
          <div key={plan.id}>{ev ? `${ev.compat.parents.map((p) => RANK_SYMBOL[p.rank]).join(" ")} ${ev.compat.total}` : "—"}</div>
        ))}
        <div className="compare-label">Usable skill sparks</div>
        {items.map(({ plan, ev }) => (
          <div key={plan.id} className="small">
            {ev ? ev.skills.filter((s) => s.relevance.relevance !== "mismatch").map((s) => s.skill.name).join(", ") || "none" : "—"}
          </div>
        ))}
        <div className="compare-label">Aptitude sparks</div>
        {items.map(({ plan, ev }) => (
          <div key={plan.id} className="small">{ev ? ev.aptitudes.map((a) => `${a.label} ${a.stars}★ (${Math.round(a.chance * 100)}%)`).join(" · ") : "—"}</div>
        ))}
      </div>
      <p className="muted small">Each plan is re-scored with its own saved settings, so totals are comparable only when the settings match.</p>
    </section>
  );
}
