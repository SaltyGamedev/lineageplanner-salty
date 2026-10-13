// Browser persistence. The imported roster is cached in IndexedDB (it can be
// several MB); settings are small and live in localStorage.
// Every access is guarded so the app still works with storage disabled.

import type { ImportResult } from "../domain/types";

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
    const r = (await withStore("readonly", (s) => s.get(ROSTER_KEY))) as ImportResult | undefined;
    // Rosters cached by older versions have no rental pool.
    return r ? { ...r, borrowed: r.borrowed ?? [] } : null;
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
