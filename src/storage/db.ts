import { openDB, type IDBPDatabase } from 'idb';
import {
  defaultSel,
  type Exercise,
  type ProgramId,
  type Sel,
} from '../data/program';
import {
  exKey,
  isProgramKey,
  logKey,
  normalizeLogKey,
  topOf,
} from '../logic/progression';

export interface SetEntry {
  reps: string;
  load: string;
  done: boolean;
}
export interface ExEntry {
  sets: SetEntry[];
  note: string;
}
/** All exercises logged for one program|phase|week|session, keyed by exKey. */
export type SessionLog = Record<string, ExEntry>;
export interface Cur extends Sel {
  program: ProgramId;
}

/** PR-tracker progress for one ATG standard. */
export interface StandardEntry {
  best: string;
  date: string;
  met: boolean;
}
/** Keyed by standard name. */
export type StandardsMap = Record<string, StandardEntry>;
/** Reserved key under which standards travel inside a backup/export blob. */
export const STANDARDS_KEY = '__standards__';

/** One logged cardio/core entry in the Extras diary. */
export interface ExtraEntry {
  id: string;
  activity: string;
  /** Free-text name when activity is "Other". */
  name: string;
  min: string;
  km: string;
  rpe: string;
  hr: string;
  loadKg: string;
  elevM: string;
  note: string;
  /** Creation timestamp — conflict tiebreaker in sync merges. */
  ts: number;
}
/** Keyed by local date (YYYY-MM-DD); multiple entries per day allowed. */
export type ExtrasMap = Record<string, ExtraEntry[]>;
/** Reserved key under which extras travel inside a backup/export blob. */
export const EXTRAS_KEY = '__extras__';

const DB_NAME = 'bbr';
const DB_VERSION = 2; // v2 adds the 'extras' store
const LEGACY_KEY = 'bbr_log_v1';
const SCHEMA = 2; // 2 = program-namespaced log keys

let db: IDBPDatabase;

/**
 * In-memory mirror of the log so the UI can read/write synchronously (matching
 * the prototype). Every mutation is written through to IndexedDB asynchronously.
 */
const memory: Record<string, SessionLog> = {};
const defaultCur = (): Cur => ({ program: 'bbr', ...defaultSel('bbr') });
let cur: Cur = defaultCur();
/** Last-used selection per program, so switching restores where you left off. */
const curByProgram: Partial<Record<ProgramId, Sel>> = {};
/** ATG standards PR-tracker progress, keyed by standard name. */
let standards: StandardsMap = {};
/** Extras diary (cardio + core), keyed by local date. */
const extras: ExtrasMap = {};
let migrated = false;

const upgrade = (d: IDBPDatabase) => {
  if (!d.objectStoreNames.contains('logs')) d.createObjectStore('logs');
  if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
  if (!d.objectStoreNames.contains('extras')) d.createObjectStore('extras');
};

export async function initStore(): Promise<void> {
  try {
    db = await openDB(DB_NAME, DB_VERSION, { upgrade });
  } catch (e) {
    // DB is newer than this code expects (e.g. rollback) — open as-is.
    if (e instanceof DOMException && e.name === 'VersionError') {
      db = await openDB(DB_NAME, undefined, { upgrade });
    } else {
      throw e;
    }
  }
  // Self-heal: if the DB somehow committed a version without all stores
  // (interrupted upgrade), force one more versionchange to create them.
  if (!db.objectStoreNames.contains('extras')) {
    const v = db.version + 1;
    db.close();
    db = await openDB(DB_NAME, v, { upgrade });
  }

  await migrateFromLocalStorage();

  const keys = await db.getAllKeys('logs');
  for (const k of keys) memory[k as string] = await db.get('logs', k);

  await migrateToProgramKeys();

  const savedCur = (await db.get('meta', 'cur')) as Partial<Cur> | undefined;
  if (savedCur && savedCur.phase && savedCur.week && savedCur.session) {
    cur = {
      program: savedCur.program ?? 'bbr',
      phase: savedCur.phase,
      week: savedCur.week,
      session: savedCur.session,
    };
  }
  const savedMap = (await db.get('meta', 'curByProgram')) as
    | Partial<Record<ProgramId, Sel>>
    | undefined;
  if (savedMap) Object.assign(curByProgram, savedMap);
  curByProgram[cur.program] = {
    phase: cur.phase,
    week: cur.week,
    session: cur.session,
  };

  const savedStd = (await db.get('meta', 'atgStandards')) as
    | StandardsMap
    | undefined;
  if (savedStd) standards = savedStd;

  const extraKeys = await db.getAllKeys('extras');
  for (const k of extraKeys) extras[k as string] = await db.get('extras', k);
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

/**
 * Schema v2: re-key any pre-program log (`phase|week|session`) under `bbr|…`.
 * Idempotent — keys already namespaced are left alone. Sets `migrated` so the
 * UI can prompt for a backup the first time this runs on existing data.
 */
async function migrateToProgramKeys(): Promise<void> {
  const schema = ((await db.get('meta', 'schema')) as number | undefined) ?? 1;
  if (schema >= SCHEMA) return;
  const stale = Object.keys(memory).filter((k) => !isProgramKey(k));
  if (stale.length) {
    migrated = true;
    const tx = db.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');
    for (const k of stale) {
      const nk = normalizeLogKey(k);
      memory[nk] = memory[k];
      delete memory[k];
      await store.delete(k);
      await store.put(memory[nk], nk);
    }
    await tx.done;
  }
  await db.put('meta', SCHEMA, 'schema');
}

/** True if existing BBR logs were re-keyed this session (prompt for a backup). */
export const justMigrated = (): boolean => migrated;

export const getMemory = (): Record<string, SessionLog> => memory;
export const getCur = (): Cur => cur;

/** Remembered selection for a program, or its default. */
export const rememberedSel = (id: ProgramId): Sel =>
  curByProgram[id] ?? defaultSel(id);

export function setCur(next: Cur): void {
  cur = next;
  curByProgram[next.program] = {
    phase: next.phase,
    week: next.week,
    session: next.session,
  };
  void db.put('meta', cur, 'cur');
  void db.put('meta', { ...curByProgram }, 'curByProgram');
}

/** Persist a single session-log entry (write-through). */
export function saveLog(lk: string): void {
  void db.put('logs', memory[lk], lk);
}

/** Create the entry for an exercise if it does not exist yet, then return it. */
export function ensureEntry(
  program: string,
  phase: string,
  week: string,
  session: string,
  ex: Exercise,
): ExEntry {
  const lk = logKey(program, phase, week, session);
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

/** ATG standards progress (a copy). */
export function getStandards(): StandardsMap {
  const out: StandardsMap = {};
  for (const k of Object.keys(standards)) out[k] = { ...standards[k] };
  return out;
}

/** Upsert one standard's progress (write-through). */
export function setStandard(name: string, entry: StandardEntry): void {
  standards[name] = entry;
  void db.put('meta', standards, 'atgStandards');
}

/** Replace all standards (after a sync merge or restore). */
export async function setStandards(map: StandardsMap): Promise<void> {
  standards = map;
  await db.put('meta', map, 'atgStandards');
}

export const getExtras = (): ExtrasMap => extras;

/** Append one diary entry under a date (write-through). */
export function addExtra(date: string, entry: ExtraEntry): void {
  const list = extras[date] || (extras[date] = []);
  list.push(entry);
  void db.put('extras', list, date);
}

/** Delete one diary entry by id (write-through). */
export function deleteExtra(date: string, id: string): void {
  const list = extras[date];
  if (!list) return;
  const next = list.filter((e) => e.id !== id);
  if (next.length) {
    extras[date] = next;
    void db.put('extras', next, date);
  } else {
    delete extras[date];
    void db.delete('extras', date);
  }
}

/** Replace the whole diary (after a sync merge or restore). */
export async function setExtras(map: ExtrasMap): Promise<void> {
  for (const k of Object.keys(extras)) delete extras[k];
  Object.assign(extras, map);
  const tx = db.transaction('extras', 'readwrite');
  await tx.objectStore('extras').clear();
  for (const k of Object.keys(map)) await tx.objectStore('extras').put(map[k], k);
  await tx.done;
}

/** Backup blob — same flat shape the prototype produced (cur + logKeys). */
export function exportData(): Record<string, unknown> {
  const out: Record<string, unknown> = { cur };
  for (const k of Object.keys(memory)) out[k] = memory[k];
  if (Object.keys(standards).length) out[STANDARDS_KEY] = standards;
  if (Object.keys(extras).length) out[EXTRAS_KEY] = extras;
  return out;
}

/** Replace all data from a restored backup blob (normalizing legacy keys). */
export async function importData(obj: Record<string, unknown>): Promise<void> {
  await clearAll();
  const tx = db.transaction(['logs', 'meta'], 'readwrite');
  for (const key of Object.keys(obj)) {
    if (key === 'cur') {
      const c = obj.cur as Partial<Cur>;
      cur = {
        program: c.program ?? 'bbr',
        phase: c.phase ?? defaultSel('bbr').phase,
        week: c.week ?? defaultSel('bbr').week,
        session: c.session ?? defaultSel('bbr').session,
      };
      await tx.objectStore('meta').put(cur, 'cur');
    } else if (key === STANDARDS_KEY) {
      standards = obj[key] as StandardsMap;
      await tx.objectStore('meta').put(standards, 'atgStandards');
    } else if (key === EXTRAS_KEY) {
      // Restored outside this tx (separate store); memory updated in setExtras.
      continue;
    } else {
      const nk = normalizeLogKey(key);
      memory[nk] = obj[key] as SessionLog;
      await tx.objectStore('logs').put(memory[nk], nk);
    }
  }
  await tx.objectStore('meta').put(SCHEMA, 'schema');
  await tx.done;
  if (obj[EXTRAS_KEY]) await setExtras(obj[EXTRAS_KEY] as ExtrasMap);
  curByProgram[cur.program] = {
    phase: cur.phase,
    week: cur.week,
    session: cur.session,
  };
}

export async function clearAll(): Promise<void> {
  for (const k of Object.keys(memory)) delete memory[k];
  cur = defaultCur();
  for (const k of Object.keys(curByProgram))
    delete curByProgram[k as ProgramId];
  standards = {};
  for (const k of Object.keys(extras)) delete extras[k];
  const tx = db.transaction(['logs', 'meta', 'extras'], 'readwrite');
  await tx.objectStore('logs').clear();
  await tx.objectStore('extras').clear();
  await tx.objectStore('meta').put(cur, 'cur');
  await tx.objectStore('meta').delete('curByProgram');
  await tx.objectStore('meta').delete('atgStandards');
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
