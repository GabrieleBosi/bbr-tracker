import {
  ACTIVITIES,
  activityDef,
  localDateISO,
  paceString,
} from '../data/extras';
import {
  addExtra,
  deleteExtra,
  getExtras,
  type ExtraEntry,
} from '../storage/db';

let selected = 'Running';
let onChanged: () => void = () => {};

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function numInput(placeholder: string, mode = 'decimal'): HTMLInputElement {
  const i = makeEl('input', 'syncin');
  i.setAttribute('inputmode', mode);
  i.placeholder = placeholder;
  return i;
}

const newId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function renderForm(): void {
  const wrap = document.getElementById('extraForm')!;
  const def = activityDef(selected);
  wrap.replaceChildren();

  const chips = makeEl('div', 'chips');
  for (const a of ACTIVITIES) {
    const b = makeEl('button', `pill${selected === a.name ? ' on' : ''}`);
    b.textContent = a.name;
    b.addEventListener('click', () => {
      selected = a.name;
      renderForm();
    });
    chips.append(b);
  }
  wrap.append(chips);

  const date = makeEl('input', 'syncin xdate');
  date.type = 'date';
  date.value = localDateISO();
  wrap.append(date);

  let name: HTMLInputElement | null = null;
  if (def.custom) {
    name = makeEl('input', 'syncin');
    name.placeholder = 'Activity name (e.g. Rowing, Padel…)';
    wrap.append(name);
  }

  const grid = makeEl('div', 'xgrid');
  const min = numInput('Minutes', 'numeric');
  grid.append(min);
  const km = def.dist ? numInput('Distance (km)') : null;
  if (km) grid.append(km);
  const rpe = numInput('RPE 1–10', 'numeric');
  grid.append(rpe);
  const hr = numInput('Avg HR (bpm)', 'numeric');
  grid.append(hr);
  const loadKg = def.load ? numInput('Ruck load (kg)') : null;
  if (loadKg) grid.append(loadKg);
  const elevM = def.elev ? numInput('Elevation gain (m)', 'numeric') : null;
  if (elevM) grid.append(elevM);
  wrap.append(grid);

  const note = makeEl('input', 'syncin');
  note.placeholder = 'Note (optional)';
  wrap.append(note);

  const save = makeEl('button', 'bigbtn acc xsave');
  save.textContent = 'Save entry';
  save.addEventListener('click', () => {
    if (!min.value.trim() && !(km && km.value.trim())) {
      alert('Log at least minutes or distance.');
      return;
    }
    const entry: ExtraEntry = {
      id: newId(),
      activity: selected,
      name: name?.value.trim() ?? '',
      min: min.value.trim(),
      km: km?.value.trim() ?? '',
      rpe: rpe.value.trim(),
      hr: hr.value.trim(),
      loadKg: loadKg?.value.trim() ?? '',
      elevM: elevM?.value.trim() ?? '',
      note: note.value.trim(),
      ts: Date.now(),
    };
    addExtra(date.value || localDateISO(), entry);
    if (navigator.vibrate) navigator.vibrate(15);
    renderForm(); // reset fields, keep activity + reopen fresh
    renderList();
    onChanged();
  });
  wrap.append(save);
}

function summary(e: ExtraEntry): string {
  const parts: string[] = [];
  if (e.min) parts.push(`${e.min}min`);
  if (e.km) parts.push(`${e.km}km`);
  const pace = paceString(e.activity, e.min, e.km);
  if (pace) parts.push(pace);
  if (e.loadKg) parts.push(`${e.loadKg}kg`);
  if (e.elevM) parts.push(`${e.elevM}m↑`);
  if (e.rpe) parts.push(`RPE ${e.rpe}`);
  if (e.hr) parts.push(`♥${e.hr}`);
  return parts.join(' · ');
}

function renderList(): void {
  const list = document.getElementById('extraList')!;
  list.replaceChildren();
  const extras = getExtras();
  const dates = Object.keys(extras).sort().reverse().slice(0, 30);
  if (!dates.length) {
    const empty = makeEl('div', 'hist-line');
    empty.innerHTML = '<span>No extras logged yet.</span>';
    list.append(empty);
    return;
  }
  for (const date of dates) {
    const h = makeEl('div', 'xdatehead');
    h.textContent = date;
    list.append(h);
    for (const e of extras[date]) {
      const row = makeEl('div', 'xrow');
      const body = makeEl('div', 'xbody');
      const title = makeEl('div', 'xtitle');
      title.textContent = e.activity === 'Other' && e.name ? e.name : e.activity;
      const sub = makeEl('div', 'xsub');
      sub.textContent = summary(e) + (e.note ? ` — ${e.note}` : '');
      body.append(title, sub);
      const del = makeEl('button', 'xdel');
      del.textContent = '✕';
      del.addEventListener('click', () => {
        if (confirm(`Delete this ${e.activity} entry (${date})?`)) {
          deleteExtra(date, e.id);
          renderList();
          onChanged();
        }
      });
      row.append(body, del);
      list.append(row);
    }
  }
}

/** Open the Extras sheet, optionally preselecting an activity (e.g. "Abs"). */
export function openExtras(preset?: string): void {
  if (preset) selected = preset;
  renderForm();
  renderList();
  document.getElementById('extras')!.classList.add('show');
}

/** Wire the Extras sheet. `changed` re-renders the app (Today banner state). */
export function initExtras(changed: () => void): void {
  onChanged = changed;
  const sheet = () => document.getElementById('extras')!;
  document
    .querySelector('[data-open-extras]')!
    .addEventListener('click', () => openExtras());
  document
    .querySelector('[data-close-extras]')!
    .addEventListener('click', () => sheet().classList.remove('show'));
  sheet().addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'extras') {
      sheet().classList.remove('show');
    }
  });
}
