import { normalizeLogKey } from '../logic/progression';
import type { ExEntry, SessionLog, StandardsMap } from './db';

/**
 * Cross-device sync via a private GitHub Gist.
 *
 * Local-first and additive: the app works fully offline; sync is a manual
 * "Sync now" that pulls the remote gist, merges it with local data (union,
 * never dropping a logged entry), writes the merged result back to this device,
 * then pushes it to the gist. Both devices converge.
 *
 * The token lives ONLY in this browser's localStorage — never in the repo and
 * never in the JSON backup export.
 */

const CFG_KEY = 'bbr_sync_v1';
const FILE = 'bbr-data.json';
const API = 'https://api.github.com';

export interface SyncCfg {
  token?: string;
  gistId?: string;
  lastSynced?: string;
}

export interface SyncBlob {
  app: 'bbr';
  version: 1;
  updatedAt: string;
  logs: Record<string, SessionLog>;
  standards?: StandardsMap;
}

interface RemoteData {
  logs: Record<string, SessionLog>;
  standards: StandardsMap;
}

export function getCfg(): SyncCfg {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') as SyncCfg;
  } catch {
    return {};
  }
}

export function setCfg(cfg: SyncCfg): void {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

/** "Logged-ness" of an entry — more logged sets / reps wins a conflict. */
function score(e: ExEntry): number {
  const logged = e.sets.filter((s) => s.reps !== '').length;
  const total = e.sets.reduce((a, s) => a + (parseInt(s.reps) || 0), 0);
  return logged * 1000 + total;
}

/** Union merge: keep every entry; on conflict keep the more-logged one. */
export function mergeLogs(
  a: Record<string, SessionLog>,
  b: Record<string, SessionLog>,
): Record<string, SessionLog> {
  const out: Record<string, SessionLog> = {};
  for (const lk of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const la = a[lk] || {};
    const lb = b[lk] || {};
    const merged: SessionLog = {};
    for (const ek of new Set([...Object.keys(la), ...Object.keys(lb)])) {
      const ea = la[ek];
      const eb = lb[ek];
      merged[ek] = ea && eb ? (score(eb) > score(ea) ? eb : ea) : ea || eb;
    }
    out[lk] = merged;
  }
  return out;
}

/** Merge standards: per name keep the later-dated entry; met sticks if either met. */
export function mergeStandards(a: StandardsMap, b: StandardsMap): StandardsMap {
  const out: StandardsMap = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ea = a[k];
    const eb = b[k];
    if (!ea || !eb) {
      out[k] = ea || eb;
      continue;
    }
    let chosen = eb;
    if ((ea.date || '') !== (eb.date || '')) {
      chosen = (ea.date || '') > (eb.date || '') ? ea : eb;
    } else if ((ea.best !== '') !== (eb.best !== '')) {
      chosen = ea.best !== '' ? ea : eb;
    }
    out[k] = { best: chosen.best, date: chosen.date, met: ea.met || eb.met };
  }
  return out;
}

async function gh(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 140)}`);
  }
  return res.json();
}

async function pull(token: string, gistId: string): Promise<RemoteData> {
  const data = await gh(`/gists/${gistId}`, token);
  const file = data.files?.[FILE];
  if (!file) return { logs: {}, standards: {} };
  // GitHub inlines content up to ~1MB; fetch raw_url if truncated.
  const content: string = file.truncated
    ? await (await fetch(file.raw_url)).text()
    : file.content;
  try {
    const blob = JSON.parse(content) as SyncBlob;
    const logs = blob.logs || {};
    // Normalize legacy 3-part keys so they merge instead of duplicating.
    const out: Record<string, SessionLog> = {};
    for (const k of Object.keys(logs)) out[normalizeLogKey(k)] = logs[k];
    return { logs: out, standards: blob.standards || {} };
  } catch {
    return { logs: {}, standards: {} };
  }
}

async function push(
  token: string,
  gistId: string | undefined,
  logs: Record<string, SessionLog>,
  standards: StandardsMap,
): Promise<string> {
  const blob: SyncBlob = {
    app: 'bbr',
    version: 1,
    updatedAt: new Date().toISOString(),
    logs,
    standards,
  };
  const body = JSON.stringify({
    ...(gistId ? {} : { description: 'Body By Rings Tracker data', public: false }),
    files: { [FILE]: { content: JSON.stringify(blob) } },
  });
  const data = gistId
    ? await gh(`/gists/${gistId}`, token, { method: 'PATCH', body })
    : await gh(`/gists`, token, { method: 'POST', body });
  return data.id as string;
}

export interface SyncResult {
  gistId: string;
  lastSynced: string;
  sessions: number;
  standards: number;
}

/**
 * Pull → merge → write locally → push. Returns the new config + a small summary.
 * Throws (with a readable message) on auth/network errors.
 */
export async function syncNow(
  localLogs: Record<string, SessionLog>,
  applyLogs: (logs: Record<string, SessionLog>) => Promise<void>,
  localStandards: StandardsMap,
  applyStandards: (s: StandardsMap) => Promise<void>,
): Promise<SyncResult> {
  const cfg = getCfg();
  if (!cfg.token) throw new Error('Add a GitHub token first (gist scope).');

  const remote = cfg.gistId
    ? await pull(cfg.token, cfg.gistId)
    : { logs: {}, standards: {} };
  const mergedLogs = mergeLogs(localLogs, remote.logs);
  await applyLogs(mergedLogs);
  const mergedStd = mergeStandards(localStandards, remote.standards);
  await applyStandards(mergedStd);
  const gistId = await push(cfg.token, cfg.gistId, mergedLogs, mergedStd);

  const lastSynced = new Date().toISOString();
  setCfg({ ...cfg, gistId, lastSynced });
  return {
    gistId,
    lastSynced,
    sessions: Object.keys(mergedLogs).length,
    standards: Object.keys(mergedStd).length,
  };
}

/**
 * Download-only: replace THIS device's data with the cloud copy (no merge).
 * Useful for restoring a device whose local data got messed up.
 */
export async function downloadFromCloud(
  applyLogs: (logs: Record<string, SessionLog>) => Promise<void>,
  applyStandards: (s: StandardsMap) => Promise<void>,
): Promise<SyncResult> {
  const cfg = getCfg();
  if (!cfg.token) throw new Error('Add a GitHub token first (gist scope).');
  if (!cfg.gistId)
    throw new Error('No gist yet — run Sync once to create one first.');

  const remote = await pull(cfg.token, cfg.gistId);
  await applyLogs(remote.logs);
  await applyStandards(remote.standards);

  const lastSynced = new Date().toISOString();
  setCfg({ ...cfg, lastSynced });
  return {
    gistId: cfg.gistId,
    lastSynced,
    sessions: Object.keys(remote.logs).length,
    standards: Object.keys(remote.standards).length,
  };
}
