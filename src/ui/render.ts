import { PHASE_KEYS, PROGRAM, type Exercise } from '../data/program';
import {
  WEEKS,
  exKey,
  lastTime,
  logKey,
  suggest,
} from '../logic/progression';
import {
  ensureEntry,
  getCur,
  getMemory,
  saveLog,
  setCur,
  type ExEntry,
} from '../storage/db';
import { initDataMenu } from './dataMenu';
import { initRestControls, startRest } from './restTimer';

const cssId = (s: string): string => s.replace(/[^a-zA-Z0-9]/g, '_');

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/** The live entry for an exKey in the currently selected session. */
function curEntry(ek: string): ExEntry {
  const cur = getCur();
  return getMemory()[logKey(cur.phase, cur.week, cur.session)][ek];
}

function persistCur(): void {
  const cur = getCur();
  saveLog(logKey(cur.phase, cur.week, cur.session));
}

function pill(label: string, on: boolean, sess: boolean, onClick: () => void) {
  const b = makeEl('button', `pill${sess ? ' sess' : ''}${on ? ' on' : ''}`);
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderSelectors(): void {
  const cur = getCur();

  const pp = document.getElementById('phasePills')!;
  pp.replaceChildren(
    ...PHASE_KEYS.map((p) =>
      pill(`Phase ${p}`, cur.phase === p, false, () => {
        const next = { ...cur, phase: p };
        if (!PROGRAM[p].sessions[next.session]) {
          next.session = Object.keys(PROGRAM[p].sessions)[0];
        }
        setCur(next);
        render();
      }),
    ),
  );

  const wp = document.getElementById('weekPills')!;
  wp.replaceChildren(
    ...WEEKS.map((w) =>
      pill(w, cur.week === w, false, () => {
        setCur({ ...cur, week: w });
        render();
      }),
    ),
  );

  const sp = document.getElementById('sessPills')!;
  sp.replaceChildren(
    ...Object.keys(PROGRAM[cur.phase].sessions).map((s) =>
      pill(s, cur.session === s, true, () => {
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
  const store = getMemory();
  let rows = '';
  for (const w of WEEKS) {
    const e = (store[logKey(cur.phase, w, cur.session)] || {})[ek];
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
  const ek = exKey(ex.letter, ex.name);
  const entry = ensureEntry(cur.phase, cur.week, cur.session, ex);
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
  const lt = lastTime(getMemory(), cur.phase, cur.session, ek, cur.week);
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
  foot.append(addBtn, delBtn, restBtn, histBtn);
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

  const noteWrap = makeEl('div', 'cardnote');
  const note = makeEl('input', 'note');
  note.placeholder = 'Notes (variation, RPE, pain…)';
  note.value = entry.note || '';
  note.addEventListener('input', () => {
    curEntry(ek).note = note.value;
    persistCur();
  });
  noteWrap.append(note);
  c.append(noteWrap);

  return c;
}

export function render(): void {
  const cur = getCur();
  renderSelectors();

  const db = document.getElementById('deloadBanner')!;
  db.innerHTML =
    cur.week === 'Deload'
      ? '<div class="deload"><b>Deload week.</b> Cut volume hard — do <b>1–2 sets</b> per exercise (2–3 for your main pull-up/chin-up). Same reps and tempo, leave 3–4 reps in the tank. Recover.</div>'
      : '';

  const list = document.getElementById('exList')!;
  list.replaceChildren(
    ...PROGRAM[cur.phase].sessions[cur.session].map((ex) => card(ex)),
  );

  document.getElementById('footNote')!.textContent =
    `${PROGRAM[cur.phase].name} · ${cur.session} · ${cur.week}  ·  saved on this device`;
}

export function renderApp(): void {
  initRestControls();
  initDataMenu(render);
  render();
}
