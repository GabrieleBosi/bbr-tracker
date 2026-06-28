import { openDB, type IDBPDatabase } from 'idb';
import { DEFAULT_CUR, type Exercise } from '../data/program';
import { exKey, logKey, topOf } from '../logic/progression';

export interface SetEntry {
  reps: string;
  load: string;
  done: boolean;
}
export interface ExEntry {
  sets: SetEntry[];
  note: string;
}
/** All exercises logged for one phase|week|session, keyed by exKey. */
export type SessionLog = Record<string, ExEntry>;
export interface Cur {
  phase: string;
  week: string;
  session: string;
}

const DB_NAME = 'bbr';
const DB_VERSION = 1;
const LEGACY_KEY = 'bbr_log_v1';

let db: IDBPDatabase;

/**
 * In-memory mirror of the log so the UI can read/write synchronously (matching
 * the prototype). Every mutation is written through to IndexedDB asynchronously.
 */
const memory: Record<string, SessionLog> = {};
let cur: Cur = { ...DEFAULT_CUR };

export async function initStore(): Promise<void> {
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('logs')) d.createObjectStore('logs');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    },
  });

  await migrateFromLocalStorage();

  const keys = await db.getAllKeys('logs');
  for (const k of keys) memory[k as string] = await db.get('logs', k);

  const savedCur = (await db.get('meta', 'cur')) as Cur | undefined;
  if (savedCur) cur = savedCur;
}

/** One-time import of the single-file prototype's localStorage data. */
async function migrateFromLocalStorage(): Promise<void> {
  const existing = await db.getAllKeys('logs');
  if (existing.length) return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const tx = db.transaction(['logs', 'meta'], 'readwrite');
    for (const key of Object.keys(obj)) {
      if (key === 'cur') {
        await tx.objectStore('meta').put(obj.cur, 'cur');
      } else {
        await tx.objectStore('logs').put(obj[key], key);
      }
    }
    await tx.done;
  } catch {
    /* ignore malformed legacy data */
  }
}

export const getMemory = (): Record<string, SessionLog> => memory;
export const getCur = (): Cur => cur;

export function setCur(next: Cur): void {
  cur = next;
  void db.put('meta', cur, 'cur');
}

/** Persist a single session-log entry (write-through). */
export function saveLog(lk: string): void {
  void db.put('logs', memory[lk], lk);
}

/** Create the entry for an exercise if it does not exist yet, then return it. */
export function ensureEntry(
  phase: string,
  week: string,
  session: string,
  ex: Exercise,
): ExEntry {
  const lk = logKey(phase, week, session);
  const log = memory[lk] || (memory[lk] = {});
  const ek = exKey(ex.letter, ex.name);
  if (!log[ek]) {
    const n = Math.max(1, topOf(ex.sets));
    const sets: SetEntry[] = [];
    for (let i = 0; i < n; i++) sets.push({ reps: '', load: '', done: false });
    log[ek] = { sets, note: '' };
    saveLog(lk);
  }
  return log[ek];
}

/** Backup blob — same flat shape the prototype produced (cur + logKeys). */
export function exportData(): Record<string, unknown> {
  const out: Record<string, unknown> = { cur };
  for (const k of Object.keys(memory)) out[k] = memory[k];
  return out;
}

/** Replace all data from a restored backup blob. */
export async function importData(obj: Record<string, unknown>): Promise<void> {
  await clearAll();
  const tx = db.transaction(['logs', 'meta'], 'readwrite');
  for (const key of Object.keys(obj)) {
    if (key === 'cur') {
      cur = obj.cur as Cur;
      await tx.objectStore('meta').put(cur, 'cur');
    } else {
      memory[key] = obj[key] as SessionLog;
      await tx.objectStore('logs').put(obj[key], key);
    }
  }
  await tx.done;
}

export async function clearAll(): Promise<void> {
  for (const k of Object.keys(memory)) delete memory[k];
  cur = { ...DEFAULT_CUR };
  const tx = db.transaction(['logs', 'meta'], 'readwrite');
  await tx.objectStore('logs').clear();
  await tx.objectStore('meta').put(cur, 'cur');
  await tx.done;
}

/** Just the workout logs (no `cur`), for cloud sync. */
export function getLogs(): Record<string, SessionLog> {
  const out: Record<string, SessionLog> = {};
  for (const k of Object.keys(memory)) out[k] = memory[k];
  return out;
}

/** Replace all logs (e.g. after a sync merge), leaving `cur` untouched. */
export async function setLogs(logs: Record<string, SessionLog>): Promise<void> {
  for (const k of Object.keys(memory)) delete memory[k];
  Object.assign(memory, logs);
  const tx = db.transaction('logs', 'readwrite');
  await tx.objectStore('logs').clear();
  for (const k of Object.keys(logs)) await tx.objectStore('logs').put(logs[k], k);
  await tx.done;
}
