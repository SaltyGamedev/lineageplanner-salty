import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, effectiveConfig } from "./domain/config";
import { loadGameData, type GameData } from "./domain/gameData";
import { ImportError, parseExport } from "./domain/importer";
import type { Goal, ImportResult, PlannerConfig, SparkFilter, Veteran } from "./domain/types";
import { fetchRental } from "./domain/umamoe";
import { clearRoster, loadRoster, readLocal, readLocalArray, saveRoster, writeLocal } from "./state/storage";
import { Empty, Spinner } from "./ui/common";
import { Guide } from "./ui/Guide";
import { Planner } from "./ui/Planner";
import { Roster } from "./ui/Roster";
import { TierListView } from "./ui/TierList";
import { Loop } from "./ui/Loop";

type Tab = "planner" | "loop" | "tiers" | "roster";
const TABS: { key: Tab; label: string }[] = [
  { key: "planner", label: "Planner" },
  { key: "loop", label: "Loop" },
  { key: "tiers", label: "Tier list" },
  { key: "roster", label: "Roster" },
];

function usePersisted<T>(key: string, read: () => T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(read);
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
  const [loading, setLoading] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);

  const [config, setConfig] = usePersisted<PlannerConfig>("config", () => readLocal("config", DEFAULT_CONFIG));
  const [goals, setGoals] = usePersisted<Goal[]>("goals", () => readLocalArray<Goal>("goals"));
  const [filters, setFilters] = usePersisted<SparkFilter[]>("filters", () => readLocalArray<SparkFilter>("filters"));
  const [excluded, setExcluded] = usePersisted<number[]>("excluded", () => readLocalArray<number>("excluded"));
  const [extraRentals, setExtraRentals] = usePersisted<Veteran[]>("rentals", () => readLocalArray<Veteran>("rentals"));
  const [loopCards, setLoopCards] = usePersisted<number[]>("loopCards", () => readLocalArray<number>("loopCards"));
  const [apiKey, setApiKey] = usePersisted<{ key: string }>("umamoe", () => readLocal("umamoe", { key: "" }));

  const [tab, setTabState] = useState<Tab>(() => {
    const h = location.hash.slice(1);
    return TABS.some((t) => t.key === h) ? (h as Tab) : "planner";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "planner" ? location.pathname + location.search : `#${t}`);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = readLocal<{ mode?: string }>("theme", {}).mode;
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeLocal("theme", { mode: next });
  };

  useEffect(() => {
    loadGameData().then(setData, (e: Error) => setDataError(e.message));
    loadRoster().then((r) => {
      setRoster(r);
      setLoading(false);
    });
  }, []);

  const own = roster?.veterans ?? [];
  // uma.moe lookups replace an export rental of the same friend.
  const rentals = [
    ...(roster?.borrowed ?? []).filter((v) => !extraRentals.some((x) => x.borrowed?.trainerId === v.borrowed?.trainerId)),
    ...extraRentals,
  ];

  const handleFile = async (file: File) => {
    if (!data) return;
    setImportError(null);
    try {
      const result = parseExport(JSON.parse(await file.text()), data, file.name);
      setRoster(result);
      await saveRoster(result);
    } catch (e) {
      setImportError(e instanceof SyntaxError ? "That file is not valid JSON." : e instanceof ImportError ? e.message : `Import failed: ${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const lookup = async (trainerId: string) => {
    if (!data) return;
    const id = Math.min(-1000, ...extraRentals.map((v) => v.trainedId)) - 1;
    const v = await fetchRental(data, trainerId, apiKey.key, id);
    setExtraRentals([...extraRentals.filter((x) => x.borrowed?.trainerId !== v.borrowed?.trainerId), v]);
  };

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
  if (!data || loading) return <div className="fullscreen"><Spinner label="Loading…" /></div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">◎</span> Lineage Planner</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
        <div className="roster-actions">
          <button className="theme-btn" onClick={toggleTheme} aria-label="Toggle light/dark theme" title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button>
          <button className="icon info-btn" onClick={() => setGuideOpen(true)} aria-label="Guide" title="How to use this page">?</button>
          {roster && <span className="muted small">{own.length} veterans</span>}
          <button className="primary" onClick={() => fileRef.current?.click()}>{roster ? "Re-import" : "Import"}</button>
          {roster && <button onClick={async () => { await clearRoster(); setRoster(null); }}>Clear</button>}
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      </header>

      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
      {importError && <div className="banner error">{importError} <button className="link" onClick={() => setImportError(null)}>Dismiss</button></div>}

      <main className="main">
        {!roster ? (
          <Empty title="Import your veterans">
            <p>Load an UmaExtractor export (JSON). It stays in this browser.</p>
            <button className="primary" onClick={() => fileRef.current?.click()}>Import</button>
          </Empty>
        ) : tab === "planner" ? (
          <Planner
            data={data}
            own={own}
            rentals={rentals}
            config={config}
            onConfig={setConfig}
            goals={goals}
            onGoals={setGoals}
            filters={filters}
            onFilters={setFilters}
            excluded={excluded}
            apiKey={apiKey.key}
            onApiKey={(key) => setApiKey({ key })}
            onLookup={lookup}
            onRemoveRental={(v) => setExtraRentals(extraRentals.filter((x) => x.trainedId !== v.trainedId))}
          />
        ) : tab === "loop" ? (
          <Loop
            data={data}
            own={own}
            rentals={rentals}
            config={config}
            onConfig={setConfig}
            goals={goals}
            onGoals={setGoals}
            filters={filters}
            onFilters={setFilters}
            excluded={excluded}
            loopCards={loopCards}
            onLoopCards={setLoopCards}
          />
        ) : tab === "tiers" ? (
          <TierListView data={data} pool={[...own, ...rentals]} style={effectiveConfig(config, data).style} goals={goals} onGoals={setGoals} />
        ) : (
          <Roster data={data} own={own} rentals={rentals} excluded={excluded} onExcluded={setExcluded} />
        )}
      </main>

      <footer className="footer muted small">
        Data: game master.mdb {data.meta.resourceVersion} · race details &amp; portraits from{" "}
        <a href="https://gametora.com/umamusume" target="_blank" rel="noreferrer">GameTora</a> · odds from{" "}
        <a href="https://uma.guide/roster-viewer/" target="_blank" rel="noreferrer">uma.guide</a> &amp;{" "}
        <a href="https://docs.google.com/document/d/1Q3IJKbtkplmuY-PAJMNjYiLtasv0eU0aIBEqp8_C3tg/edit" target="_blank" rel="noreferrer">Crazyfellow's guide</a> ·{" "}
        <a href="https://github.com/SaltyGamedev/lineageplanner-salty/blob/main/docs/SCORING.md" target="_blank" rel="noreferrer" title="All chances are estimates; see the rule table for sources and evidence">
          rules: Global, compatibility update 24 Jun 2026
        </a>{" "}· MIT
      </footer>
    </div>
  );
}
