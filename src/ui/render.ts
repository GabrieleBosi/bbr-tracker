import {
  PROGRAM_IDS,
  getProgram,
  type Exercise,
  type ProgramId,
} from '../data/program';
import { exKey, lastTime, logKey, suggest } from '../logic/progression';
import {
  ensureEntry,
  getCur,
  getMemory,
  justMigrated,
  rememberedSel,
  saveLog,
  setCur,
  type ExEntry,
} from '../storage/db';
import { weeklyStats } from '../logic/stats';
import { renderChartSVG } from './chart';
import { initDataMenu } from './dataMenu';
import { initRestControls, startRest } from './restTimer';

const cssId = (s: string): string => s.replace(/[^a-zA-Z0-9]/g, '_');
const MIGRATE_ACK = 'bbr_migrate_ack_v2';

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function curLogKey(): string {
  const cur = getCur();
  return logKey(cur.program, cur.phase, cur.week, cur.session);
}

/** The live entry for an exKey in the currently selected session. */
function curEntry(ek: string): ExEntry {
  return getMemory()[curLogKey()][ek];
}

function persistCur(): void {
  saveLog(curLogKey());
}

function pill(
  label: string,
  on: boolean,
  variant: '' | 'sess' | 'prog',
  onClick: () => void,
) {
  const cls = ['pill', variant, on ? 'on' : ''].filter(Boolean).join(' ');
  const b = makeEl('button', cls);
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderSelectors(): void {
  const cur = getCur();
  const prog = getProgram(cur.program);

  const programPills = document.getElementById('programPills')!;
  programPills.replaceChildren(
    ...PROGRAM_IDS.map((id) =>
      pill(getProgram(id).short, cur.program === id, 'prog', () => {
        if (id === cur.program) return;
        setCur({ program: id, ...rememberedSel(id) });
        render();
      }),
    ),
  );

  const pp = document.getElementById('phasePills')!;
  pp.replaceChildren(
    ...Object.keys(prog.groups).map((g) =>
      pill(prog.groups[g].name, cur.phase === g, '', () => {
        const next = { ...cur, phase: g };
        if (!prog.groups[g].sessions[next.session]) {
          next.session = Object.keys(prog.groups[g].sessions)[0];
        }
        setCur(next);
        render();
      }),
    ),
  );

  const wp = document.getElementById('weekPills')!;
  wp.replaceChildren(
    ...prog.weeks.map((w) =>
      pill(w, cur.week === w, '', () => {
        setCur({ ...cur, week: w });
        render();
      }),
    ),
  );

  const sp = document.getElementById('sessPills')!;
  sp.replaceChildren(
    ...Object.keys(prog.groups[cur.phase].sessions).map((s) =>
      pill(s, cur.session === s, 'sess', () => {
        setCur({ ...cur, session: s });
        render();
      }),
    ),
  );
}

function setRow(ek: string, i: number, st: ExEntry['sets'][number]) {
  const row = makeEl('div', 'setrow');

  const no = makeEl('div', 'setno');
  no.textContent = String(i + 1);

  const stepper = makeEl('div', 'stepper');
  const minus = makeEl('button');
  minus.textContent = '−';
  const input = makeEl('input');
  input.setAttribute('inputmode', 'numeric');
  input.placeholder = 'reps';
  input.value = st.reps;
  const plus = makeEl('button');
  plus.textContent = '+';

  const bump = (delta: number) => {
    const entry = curEntry(ek);
    let v = parseInt(entry.sets[i].reps) || 0;
    v = Math.max(0, v + delta);
    entry.sets[i].reps = String(v);
    input.value = String(v);
    persistCur();
  };
  minus.addEventListener('click', () => bump(-1));
  plus.addEventListener('click', () => bump(1));
  input.addEventListener('input', () => {
    const v = input.value.replace(/[^0-9]/g, '');
    input.value = v;
    curEntry(ek).sets[i].reps = v;
    persistCur();
  });
  stepper.append(minus, input, plus);

  const loadWrap = makeEl('div', 'load');
  const loadInput = makeEl('input');
  loadInput.setAttribute('inputmode', 'decimal');
  loadInput.placeholder = 'kg';
  loadInput.value = st.load;
  loadInput.addEventListener('input', () => {
    curEntry(ek).sets[i].load = loadInput.value;
    persistCur();
  });
  loadWrap.append(loadInput);

  const done = makeEl('button', `done${st.done ? ' on' : ''}`);
  done.innerHTML = '&#10003;';
  done.addEventListener('click', () => {
    const s = curEntry(ek).sets[i];
    s.done = !s.done;
    done.classList.toggle('on', s.done);
    persistCur();
    if (s.done && navigator.vibrate) navigator.vibrate(15);
  });

  row.append(no, stepper, loadWrap, done);
  return row;
}

function historyRows(ek: string): string {
  const cur = getCur();
  const prog = getProgram(cur.program);
  const store = getMemory();
  let rows = '';
  for (const w of prog.weeks) {
    const e = (store[logKey(cur.program, cur.phase, w, cur.session)] || {})[ek];
    if (e && e.sets.some((x) => x.reps !== '')) {
      const v = e.sets
        .filter((x) => x.reps !== '')
        .map((x) => x.reps + (x.load ? `@${x.load}` : ''))
        .join(', ');
      const tot = e.sets.reduce((a, x) => a + (parseInt(x.reps) || 0), 0);
      rows += `<div class="hist-line"><span>${w}</span><b>${v} &nbsp;(${tot})</b></div>`;
    }
  }
  return rows || '<div class="hist-line"><span>No history yet</span></div>';
}

function card(ex: Exercise): HTMLElement {
  const cur = getCur();
  const prog = getProgram(cur.program);
  const ek = exKey(ex.letter, ex.name);
  const entry = ensureEntry(cur.program, cur.phase, cur.week, cur.session, ex);
  const c = makeEl('div', 'card');

  const head = makeEl('div', 'chead');
  head.innerHTML = `<div class="badge">${ex.letter}</div>
    <div><div class="ex-name">${ex.name}</div>${
      ex.cue ? `<div class="ex-cue">${ex.cue}</div>` : ''
    }</div>`;
  c.append(head);

  const meta = makeEl('div', 'meta');
  meta.innerHTML = `<span class="tag">Sets <b>${ex.sets}</b></span>
    <span class="tag">Reps <b>${ex.reps}</b></span>
    <span class="tag">Tempo <b>${ex.tempo}</b></span>
    <span class="tag">Rest <b>${ex.rest}</b></span>`;
  c.append(meta);

  const last = makeEl('div', 'last');
  const lt = lastTime(
    getMemory(),
    cur.program,
    cur.phase,
    cur.session,
    ek,
    cur.week,
    prog.weeks,
  );
  if (lt) {
    const prev = lt.e.sets
      .filter((x) => x.reps !== '')
      .map((x) => x.reps + (x.load ? `@${x.load}` : ''))
      .join(', ');
    const sug = suggest(lt.e, ex.reps);
    last.innerHTML = `Last (${lt.week}): <b>${prev || '—'}</b>${
      sug ? ` &nbsp;&middot;&nbsp; try <b>${sug}</b>` : ''
    }`;
  } else {
    last.innerHTML = `First time — aim for the low end of <b>${ex.reps}</b> with clean tempo.`;
  }
  c.append(last);

  const setsWrap = makeEl('div', 'sets');
  entry.sets.forEach((st, i) => setsWrap.append(setRow(ek, i, st)));
  c.append(setsWrap);

  const foot = makeEl('div', 'cfoot');
  const addBtn = makeEl('button', 'mini');
  addBtn.textContent = '+ set';
  addBtn.addEventListener('click', () => {
    curEntry(ek).sets.push({ reps: '', load: '', done: false });
    persistCur();
    render();
  });
  const delBtn = makeEl('button', 'mini');
  delBtn.textContent = '− set';
  delBtn.addEventListener('click', () => {
    const sets = curEntry(ek).sets;
    if (sets.length > 1) {
      sets.pop();
      persistCur();
      render();
    }
  });
  const restBtn = makeEl('button', 'mini acc');
  restBtn.textContent = 'Rest timer';
  restBtn.addEventListener('click', () => startRest(ex.rest));
  const histBtn = makeEl('button', 'mini');
  histBtn.textContent = 'History';
  const chartBtn = makeEl('button', 'mini');
  chartBtn.textContent = 'Chart';
  foot.append(addBtn, delBtn, restBtn, histBtn, chartBtn);
  c.append(foot);

  const hist = makeEl('div', 'hist');
  hist.id = `hist_${cssId(ek)}`;
  hist.style.display = 'none';
  histBtn.addEventListener('click', () => {
    if (hist.style.display === 'none') {
      hist.innerHTML = historyRows(ek);
      hist.style.display = 'block';
      histBtn.classList.add('acc');
    } else {
      hist.style.display = 'none';
      histBtn.classList.remove('acc');
    }
  });
  c.append(hist);

  const chart = makeEl('div', 'chart');
  chart.style.display = 'none';
  chartBtn.addEventListener('click', () => {
    if (chart.style.display === 'none') {
      chart.innerHTML = renderChartSVG(
        weeklyStats(
          getMemory(),
          cur.program,
          cur.phase,
          cur.session,
          ek,
          prog.weeks,
        ),
      );
      chart.style.display = 'block';
      chartBtn.classList.add('acc');
    } else {
      chart.style.display = 'none';
      chartBtn.classList.remove('acc');
    }
  });
  c.append(chart);

  const noteWrap = makeEl('div', 'cardnote');
  const note = makeEl('input', 'note');
  note.placeholder =
    cur.program === 'atg'
      ? 'Pain-free? Add load next set · notes…'
      : 'Notes (variation, RPE, pain…)';
  note.value = entry.note || '';
  note.addEventListener('input', () => {
    curEntry(ek).note = note.value;
    persistCur();
  });
  noteWrap.append(note);
  c.append(noteWrap);

  return c;
}

function renderMigrateBanner(): void {
  const el = document.getElementById('migrateBanner')!;
  if (!justMigrated() || localStorage.getItem(MIGRATE_ACK)) {
    el.innerHTML = '';
    return;
  }
  const banner = makeEl('div', 'migrate');
  banner.innerHTML =
    '<b>Big update: ATG added.</b> Your existing BBR logs were upgraded to the new format. ' +
    'Tap <b>Data → Backup (JSON)</b> to keep a safety copy.';
  const ack = makeEl('button', 'mini');
  ack.textContent = 'Got it';
  ack.addEventListener('click', () => {
    localStorage.setItem(MIGRATE_ACK, '1');
    el.innerHTML = '';
  });
  banner.append(' ', ack);
  el.replaceChildren(banner);
}

function setBrand(program: ProgramId): void {
  const brand = document.getElementById('brand');
  if (brand) brand.innerHTML = getProgram(program).brandHtml;
}

export function render(): void {
  const cur = getCur();
  const prog = getProgram(cur.program);
  setBrand(cur.program);
  renderSelectors();
  renderMigrateBanner();

  const db = document.getElementById('deloadBanner')!;
  db.innerHTML = cur.week === 'Deload' ? prog.deloadHtml : '';

  const list = document.getElementById('exList')!;
  list.replaceChildren(
    ...prog.groups[cur.phase].sessions[cur.session].map((ex) => card(ex)),
  );

  document.getElementById('footNote')!.textContent =
    `${prog.short} · ${prog.groups[cur.phase].name} · ${cur.session} · ${cur.week}  ·  saved on this device`;
}

export function renderApp(): void {
  initRestControls();
  initDataMenu(render);
  render();
}
