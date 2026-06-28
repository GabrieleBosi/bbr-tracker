import {
  clearAll,
  exportData,
  getLogs,
  importData,
  setLogs,
  type SessionLog,
} from '../storage/db';
import { getCfg, setCfg, syncNow } from '../storage/sync';

const today = (): string => new Date().toISOString().slice(0, 10);

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJSON(): void {
  download(
    `bbr-backup-${today()}.json`,
    JSON.stringify(exportData(), null, 1),
    'application/json',
  );
}

function exportCSV(): void {
  const data = exportData();
  const rows: (string | number)[][] = [
    ['phase', 'week', 'session', 'exercise', 'set', 'reps', 'load', 'note'],
  ];
  for (const lk of Object.keys(data)) {
    if (lk === 'cur') continue;
    const [phase, week, session] = lk.split('|');
    const log = data[lk] as SessionLog;
    for (const ek of Object.keys(log)) {
      const entry = log[ek];
      entry.sets.forEach((st, i) => {
        if (st.reps !== '') {
          rows.push([
            phase,
            week,
            session,
            ek,
            i + 1,
            st.reps,
            st.load,
            (entry.note || '').replace(/[\n,]/g, ' '),
          ]);
        }
      });
    }
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  download(`bbr-history-${today()}.csv`, csv, 'text/csv');
}

/** Wire the Data sheet. `rerender` redraws the app after restore/wipe. */
export function initDataMenu(rerender: () => void): void {
  const menu = () => document.getElementById('menu')!;
  const open = () => menu().classList.add('show');
  const close = () => menu().classList.remove('show');

  document.querySelector('[data-open-menu]')!.addEventListener('click', open);
  document.querySelector('[data-close-menu]')!.addEventListener('click', close);
  menu().addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'menu') close();
  });

  document
    .querySelector('[data-export-json]')!
    .addEventListener('click', exportJSON);
  document
    .querySelector('[data-export-csv]')!
    .addEventListener('click', exportCSV);

  const fileInput = document.getElementById('imp') as HTMLInputElement;
  document
    .querySelector('[data-restore]')!
    .addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const obj = JSON.parse(String(reader.result));
        await importData(obj);
        rerender();
        close();
        alert('Backup restored.');
      } catch {
        alert('Could not read that file.');
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  document.querySelector('[data-wipe]')!.addEventListener('click', async () => {
    if (
      confirm(
        'Delete ALL logged sets? Export a backup first — this cannot be undone.',
      )
    ) {
      await clearAll();
      rerender();
      close();
    }
  });

  initSync(rerender);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initSync(rerender: () => void): void {
  const tokenEl = document.getElementById('syncToken') as HTMLInputElement;
  const gistEl = document.getElementById('syncGist') as HTMLInputElement;
  const statusEl = document.getElementById('syncStatus')!;
  const syncBtn = document.querySelector('[data-sync-now]') as HTMLButtonElement;

  const cfg = getCfg();
  if (cfg.token) tokenEl.value = cfg.token;
  if (cfg.gistId) gistEl.value = cfg.gistId;
  if (cfg.lastSynced) {
    statusEl.className = 'syncstatus';
    statusEl.textContent = `Last synced ${fmtTime(cfg.lastSynced)}.`;
  }

  const persistFields = () => {
    const current = getCfg();
    setCfg({
      ...current,
      token: tokenEl.value.trim() || undefined,
      gistId: gistEl.value.trim() || undefined,
    });
  };
  tokenEl.addEventListener('change', persistFields);
  gistEl.addEventListener('change', persistFields);

  syncBtn.addEventListener('click', async () => {
    persistFields();
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing…';
    statusEl.className = 'syncstatus';
    statusEl.textContent = 'Contacting GitHub…';
    try {
      const res = await syncNow(getLogs(), setLogs);
      gistEl.value = res.gistId;
      statusEl.className = 'syncstatus ok';
      statusEl.textContent = `Synced ${res.sessions} sessions at ${fmtTime(res.lastSynced)}. Gist: ${res.gistId}`;
      rerender();
    } catch (e) {
      statusEl.className = 'syncstatus err';
      statusEl.textContent = e instanceof Error ? e.message : 'Sync failed.';
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync now';
    }
  });
}
