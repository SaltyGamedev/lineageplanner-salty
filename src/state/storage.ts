// Browser persistence. The imported roster is cached in IndexedDB (it can be
// several MB); settings and saved plans are small and live in localStorage.
// Every access is guarded so the app still works with storage disabled.

import type { ImportResult, PlannerConfig, ScoreWeights } from "../domain/types";
import type { Constraints } from "../domain/optimizer";

const DB_NAME = "lineageplanner";
const STORE = "imports";
const ROSTER_KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveRoster(result: ImportResult): Promise<boolean> {
  try {
    await withStore("readwrite", (s) => s.put(result, ROSTER_KEY));
    return true;
  } catch {
    return false;
  }
}

export async function loadRoster(): Promise<ImportResult | null> {
  try {
    return ((await withStore("readonly", (s) => s.get(ROSTER_KEY))) as ImportResult | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearRoster(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(ROSTER_KEY));
  } catch {
    /* storage unavailable: nothing cached */
  }
}

// ------------------------------------------------------------ localStorage

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`lineageplanner:${key}`);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readLocalArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(`lineageplanner:${key}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(`lineageplanner:${key}`, JSON.stringify(value));
  } catch {
    /* quota or privacy mode: settings simply won't persist */
  }
}

// -------------------------------------------------------------- saved plans

export interface SavedPlan {
  id: string;
  name: string;
  savedAt: string;
  config: PlannerConfig;
  weights: ScoreWeights;
  constraints: Constraints;
  /** trainedIds of the two chosen veterans */
  pair: [number, number];
  /** Score at save time, for reference; it is recomputed when opened. */
  scoreAtSave: number;
  dataVersion: string;
}

export const PLAN_FILE_KIND = "lineageplanner-plan";

export function exportPlanFile(plans: SavedPlan[]): string {
  return JSON.stringify({ kind: PLAN_FILE_KIND, version: 1, plans }, null, 2);
}

export function parsePlanFile(text: string): SavedPlan[] {
  const obj = JSON.parse(text);
  if (!obj || obj.kind !== PLAN_FILE_KIND || !Array.isArray(obj.plans)) throw new Error("Not a Lineage Planner plan file.");
  return obj.plans.filter(
    (p: SavedPlan) => p && typeof p.id === "string" && Array.isArray(p.pair) && p.pair.length === 2 && p.config,
  );
}
