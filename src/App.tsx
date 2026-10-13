import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS, effectiveConfig, targetContext } from "./domain/config";
import { loadGameData, type GameData } from "./domain/gameData";
import { ImportError, parseExport } from "./domain/importer";
import { NO_CONSTRAINTS, optimize, type Constraints, type OptimizeResult } from "./domain/optimizer";
import { evaluateLineage, type LineageEvaluation, type ScoringContext } from "./domain/scoring";
import type { ImportResult, PlannerConfig, ScoreWeights } from "./domain/types";
import { clearRoster, loadRoster, readLocal, readLocalArray, saveRoster, writeLocal, type SavedPlan } from "./state/storage";
import { AptitudeSummary, Rankings, ScoreBreakdown, SkillTable } from "./ui/Breakdown";
import { CharacterBrowser, SkillBrowser, VeteranBrowser } from "./ui/Browsers";
import { Empty, PortraitsContext, Spinner } from "./ui/common";
import { ConfigPanel } from "./ui/ConfigPanel";
import { DetailDrawer } from "./ui/DetailDrawer";
import { LineageTree } from "./ui/Lineage";
import { PlansView } from "./ui/Plans";
import { TierListView } from "./ui/TierList";

type Tab = "planner" | "veterans" | "skills" | "characters" | "plans";
const TABS: { key: Tab; label: string }[] = [
  { key: "planner", label: "Planner" },
  { key: "veterans", label: "Veterans" },
  { key: "skills", label: "Skills" },
  { key: "characters", label: "Characters" },
  { key: "plans", label: "Plans" },
];

function usePersisted<T extends object>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readLocal(key, fallback));
  const set = useCallback((v: T) => {
    setValue(v);
    writeLocal(key, v);
  }, [key]);
  return [value, set];
}

export function App() {
  const [data, setData] = useState<GameData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [roster, setRoster] = useState<ImportResult | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [cacheFailed, setCacheFailed] = useState(false);

  const [config, setConfigState] = usePersisted<PlannerConfig>("config", DEFAULT_CONFIG);
  const [weights, setWeights] = usePersisted<ScoreWeights>("weights", DEFAULT_WEIGHTS);
  const [constraints, setConstraints] = usePersisted<Constraints>("constraints", NO_CONSTRAINTS);
  const [display, setDisplay] = usePersisted<{ portraits: boolean }>("display", { portraits: true });
  const [plans, setPlansState] = useState<SavedPlan[]>(() => readLocalArray<SavedPlan>("plans"));
  const setPlans = (p: SavedPlan[]) => {
    setPlansState(p);
    writeLocal("plans", p);
  };

  const [tab, setTabState] = useState<Tab>(() => {
    const h = location.hash.slice(1);
    return TABS.some((t) => t.key === h) ? (h as Tab) : "planner";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "planner" ? location.pathname + location.search : `#${t}`);
  };
  const [skillView, setSkillView] = useState<"tiers" | "browse">("tiers");
  const [pair, setPair] = useState<[number, number] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // A manually chosen pair only makes sense for the trainee it was chosen for.
  const setConfig = (c: PlannerConfig) => {
    if (c.targetCardId !== config.targetCardId) {
      setPair(null);
      setSlot(null);
    }
    setConfigState(c);
  };

  useEffect(() => {
    loadGameData().then(setData, (e: Error) => setDataError(e.message));
    loadRoster().then((r) => {
      setRoster(r);
      setRosterLoading(false);
    });
  }, []);

  const veterans = roster?.veterans ?? [];

  const handleFile = async (file: File) => {
    if (!data) return;
    setImporting(true);
    setImportError(null);
    try {
      const json = JSON.parse(await file.text());
      const result = parseExport(json, data, file.name);
      setRoster(result);
      setPair(null);
      setSlot(null);
      setCacheFailed(!(await saveRoster(result)));
    } catch (e) {
      setImportError(e instanceof SyntaxError ? "That file is not valid JSON." : e instanceof ImportError ? e.message : `Import failed: ${(e as Error).message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clear = async () => {
    await clearRoster();
    setRoster(null);
    setPair(null);
    setSlot(null);
  };

  // ---- optimisation (synchronous: a few thousand pairs score in milliseconds)
  const result = useMemo((): { res: OptimizeResult | null; error: string | null } => {
    if (!data || !veterans.length || config.targetCardId == null) return { res: null, error: null };
    try {
      return { res: optimize(data, veterans, config, weights, constraints, 50), error: null };
    } catch (e) {
      return { res: null, error: (e as Error).message };
    }
  }, [data, veterans, config, weights, constraints]);

  const sc: ScoringContext | null = result.res?.context ?? null;
  const current: LineageEvaluation | null = useMemo(() => {
    if (!sc) return null;
    if (pair) {
      const a = veterans.find((v) => v.trainedId === pair[0]);
      const b = veterans.find((v) => v.trainedId === pair[1]);
      if (a && b) return evaluateLineage(sc, a, b);
    }
    return result.res?.ranked[0] ?? null;
  }, [sc, pair, veterans, result.res]);

  const ctx = useMemo(() => (data && config.targetCardId != null ? targetContext(effectiveConfig(config, data), data) : null), [data, config]);
  const eff = data ? effectiveConfig(config, data) : config;
  const focus = { surface: eff.surface, distance: eff.distance, style: eff.style };

  const savePlan = () => {
    if (!current || !data) return;
    const name = window.prompt("Plan name", `${data.cardLabel(config.targetCardId ?? 0)} – ${data.charaName(current.p1.charaId)} × ${data.charaName(current.p2.charaId)}`);
    if (!name) return;
    setPlans([
      ...plans,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        savedAt: new Date().toISOString(),
        config,
        weights,
        constraints,
        pair: [current.p1.trainedId, current.p2.trainedId],
        scoreAtSave: current.total,
        dataVersion: data.meta.resourceVersion ?? data.meta.generatedAt,
      },
    ]);
  };

  const openPlan = (p: SavedPlan) => {
    setConfig({ ...DEFAULT_CONFIG, ...p.config });
    setWeights({ ...DEFAULT_WEIGHTS, ...p.weights, stat: { ...DEFAULT_WEIGHTS.stat, ...p.weights.stat } });
    setConstraints({ ...NO_CONSTRAINTS, ...p.constraints });
    setPair(p.pair);
    setSlot(null);
    setTab("planner");
  };

  // ---------------------------------------------------------------- render
  if (dataError) {
    return (
      <div className="fullscreen">
        <Empty title="Game data could not be loaded">
          <p className="error">{dataError}</p>
          <button onClick={() => location.reload()}>Retry</button>
        </Empty>
      </div>
    );
  }
  if (!data || rosterLoading) return <div className="fullscreen"><Spinner label="Loading game data…" /></div>;

  return (
    <PortraitsContext.Provider value={display.portraits}>
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◎</span> Lineage Planner
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === "plans" && plans.length > 0 && <span className="count">{plans.length}</span>}
            </button>
          ))}
        </nav>
        <div className="roster">
          {roster ? (
            <span className="muted small" title={`Imported ${new Date(roster.importedAt).toLocaleString()}`}>
              {roster.veterans.length} veterans · {roster.sourceName}
            </span>
          ) : (
            <span className="muted small">No roster</span>
          )}
          <button className="primary" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? "Importing…" : roster ? "Re-import" : "Import export"}
          </button>
          {roster && <button onClick={clear} title="Forget the cached roster">Clear</button>}
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      </header>

      {(importError || cacheFailed || (roster && roster.warnings.length > 0)) && (
        <div className="banners">
          {importError && <div className="banner error">{importError} <button className="link" onClick={() => setImportError(null)}>Dismiss</button></div>}
          {cacheFailed && <div className="banner warn">Your browser blocked storage, so the roster will not be remembered after reload.</div>}
          {roster && roster.warnings.length > 0 && (
            <details className="banner warn">
              <summary>{roster.warnings.length} import warning(s)</summary>
              <ul>{roster.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      <main className={`layout layout-${tab}`}>
        {tab === "planner" && (
          <>
            <ConfigPanel data={data} config={config} onConfig={setConfig} weights={weights} onWeights={setWeights} onResetWeights={() => setWeights(DEFAULT_WEIGHTS)} />
            <div className="content">
              {!roster ? (
                <Empty title="Import your veterans">
                  <p>Export your roster with UmaExtractor and import the JSON file. It is stored only in this browser, so you only need to do this again when your roster changes.</p>
                  <button className="primary" onClick={() => fileRef.current?.click()}>Import export</button>
                </Empty>
              ) : config.targetCardId == null ? (
                <Empty title="Choose a trainee">Pick the horse you are going to train in the panel on the left.</Empty>
              ) : result.error ? (
                <Empty title="Could not rank lineages"><p className="error">{result.error}</p></Empty>
              ) : !current || !sc ? (
                <Empty title="No valid lineage">
                  <p>Every pair of veterans was excluded. Check locks, exclusions and the non-standard entry toggle.</p>
                  {result.res && (
                    <ul>{Object.entries(result.res.stats.byReason).map(([r, n]) => <li key={r}>{r}: {n}</li>)}</ul>
                  )}
                </Empty>
              ) : (
                <>
                  <section className="panel tree-panel">
                    <div className="panel-head">
                      <h2>
                        Lineage <span className="total">{current.total.toFixed(1)}</span>
                      </h2>
                      <AptitudeSummary ev={current} />
                      <div className="btn-row">
                        {pair && <button onClick={() => setPair(null)}>Back to best</button>}
                        <button className="primary" onClick={savePlan}>Save plan</button>
                      </div>
                    </div>
                    <LineageTree data={data} target={sc.target} ev={current} weights={weights} focus={focus} selected={slot} onSelect={(s) => setSlot(s === slot ? null : s)} />
                    <p className="muted small">Click a horse for its contribution, the reasoning and alternatives. Grandparents are fixed to their veteran.</p>
                  </section>
                  <div className="two-col">
                    <ScoreBreakdown ev={current} />
                    {result.res && <Rankings data={data} ranked={result.res.ranked} stats={result.res.stats} current={current} onPick={(p) => { setPair(p); setSlot(null); }} />}
                  </div>
                  <SkillTable data={data} ev={current} />
                </>
              )}
            </div>
            {slot && current && sc && (
              <DetailDrawer
                data={data}
                sc={sc}
                ev={current}
                slot={slot}
                veterans={veterans}
                constraints={constraints}
                onConstraints={setConstraints}
                onPair={(p) => setPair(p)}
                onClose={() => setSlot(null)}
              />
            )}
          </>
        )}
        {tab === "veterans" && (
          <div className="content wide">
            <VeteranBrowser data={data} veterans={veterans} config={eff} constraints={constraints} onConstraints={setConstraints} />
          </div>
        )}
        {tab === "skills" && (
          <div className="content wide">
            <div className="seg sub-tabs">
              <button className={skillView === "tiers" ? "on" : ""} onClick={() => setSkillView("tiers")}>Tier list</button>
              <button className={skillView === "browse" ? "on" : ""} onClick={() => setSkillView("browse")}>All skills</button>
            </div>
            {skillView === "tiers"
              ? <TierListView data={data} veterans={veterans} style={eff.style} ctx={ctx} />
              : <SkillBrowser data={data} veterans={veterans} ctx={ctx} style={eff.style} />}
          </div>
        )}
        {tab === "characters" && (
          <div className="content wide">
            <CharacterBrowser
              data={data}
              veterans={veterans}
              config={config}
              constraints={constraints}
              onConstraints={setConstraints}
              onTarget={(id) => { setConfig({ ...config, targetCardId: id }); setPair(null); setTab("planner"); }}
            />
          </div>
        )}
        {tab === "plans" && (
          <div className="content wide">
            <PlansView data={data} veterans={veterans} plans={plans} onPlans={setPlans} onOpen={openPlan} />
          </div>
        )}
      </main>

      <footer className="footer muted small">
        Game data {data.meta.resourceVersion ? `resource ${data.meta.resourceVersion}` : ""} · generated {new Date(data.meta.generatedAt).toLocaleDateString()} ·
        labels: <b>verified</b> = from game data, <b>approximation</b> = interpreted, <b>preference</b> = your weights ·
        race details and portraits from <a href="https://gametora.com/umamusume" target="_blank" rel="noreferrer">GameTora</a>,
        odds from <a href="https://uma.guide/guides/parenting-in-umamusume" target="_blank" rel="noreferrer">uma.guide</a> ·{" "}
        <button className="link" onClick={() => setDisplay({ ...display, portraits: !display.portraits })}>
          {display.portraits ? "Hide portraits" : "Show portraits"}
        </button>{" "}
        · MIT licensed
      </footer>
    </div>
    </PortraitsContext.Provider>
  );
}
