import { normalizeLogKey } from '../logic/progression';
import type { ExEntry, SessionLog } from './db';

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

async function pull(
  token: string,
  gistId: string,
): Promise<Record<string, SessionLog>> {
  const data = await gh(`/gists/${gistId}`, token);
  const file = data.files?.[FILE];
  if (!file) return {};
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
    return out;
  } catch {
    return {};
  }
}

async function push(
  token: string,
  gistId: string | undefined,
  logs: Record<string, SessionLog>,
): Promise<string> {
  const blob: SyncBlob = {
    app: 'bbr',
    version: 1,
    updatedAt: new Date().toISOString(),
    logs,
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
}

/**
 * Pull → merge → write locally → push. Returns the new config + a small summary.
 * Throws (with a readable message) on auth/network errors.
 */
export async function syncNow(
  localLogs: Record<string, SessionLog>,
  applyMerged: (logs: Record<string, SessionLog>) => Promise<void>,
): Promise<SyncResult> {
  const cfg = getCfg();
  if (!cfg.token) throw new Error('Add a GitHub token first (gist scope).');

  const remote = cfg.gistId ? await pull(cfg.token, cfg.gistId) : {};
  const merged = mergeLogs(localLogs, remote);
  await applyMerged(merged);
  const gistId = await push(cfg.token, cfg.gistId, merged);

  const lastSynced = new Date().toISOString();
  setCfg({ ...cfg, gistId, lastSynced });
  return { gistId, lastSynced, sessions: Object.keys(merged).length };
}

/**
 * Download-only: replace THIS device's data with the cloud copy (no merge).
 * Useful for restoring a device whose local data got messed up.
 */
export async function downloadFromCloud(
  applyRemote: (logs: Record<string, SessionLog>) => Promise<void>,
): Promise<SyncResult> {
  const cfg = getCfg();
  if (!cfg.token) throw new Error('Add a GitHub token first (gist scope).');
  if (!cfg.gistId)
    throw new Error('No gist yet — run Sync once to create one first.');

  const remote = await pull(cfg.token, cfg.gistId);
  await applyRemote(remote);

  const lastSynced = new Date().toISOString();
  setCfg({ ...cfg, lastSynced });
  return { gistId: cfg.gistId, lastSynced, sessions: Object.keys(remote).length };
}
