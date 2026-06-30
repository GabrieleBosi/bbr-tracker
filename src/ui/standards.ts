import { getProgram } from '../data/program';
import {
  getStandards,
  setStandard,
  type StandardEntry,
} from '../storage/db';

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function row(name: string, target: string, saved?: StandardEntry): HTMLElement {
  const entry: StandardEntry = saved ?? { best: '', date: '', met: false };
  const card = makeEl('div', `std${entry.met ? ' met' : ''}`);

  const top = makeEl('div', 'std-top');
  const title = makeEl('div', 'std-name');
  title.textContent = name;
  const met = makeEl('button', `done${entry.met ? ' on' : ''}`);
  met.innerHTML = '&#10003;';
  met.title = 'Mark standard met';
  top.append(title, met);

  const tgt = makeEl('div', 'std-target');
  tgt.textContent = target;

  const fields = makeEl('div', 'std-fields');
  const best = makeEl('input', 'syncin');
  best.placeholder = 'Best result (e.g. 20kg × 18)';
  best.value = entry.best;
  const date = makeEl('input', 'syncin std-date');
  date.type = 'date';
  date.value = entry.date;
  fields.append(best, date);

  card.append(top, tgt, fields);

  const save = () =>
    setStandard(name, {
      best: best.value,
      date: date.value,
      met: met.classList.contains('on'),
    });

  best.addEventListener('input', save);
  date.addEventListener('change', save);
  met.addEventListener('click', () => {
    const on = !met.classList.contains('on');
    met.classList.toggle('on', on);
    card.classList.toggle('met', on);
    if (on && navigator.vibrate) navigator.vibrate(15);
    save();
  });

  return card;
}

function renderList(): void {
  const list = document.getElementById('stdList')!;
  const standards = getProgram('atg').standards ?? [];
  const saved = getStandards();
  list.replaceChildren(...standards.map((s) => row(s.name, s.target, saved[s.name])));
}

/** Wire the ATG Standards sheet (open/close + render on open). */
export function initStandards(): void {
  const sheet = () => document.getElementById('standards')!;
  document.querySelector('[data-open-standards]')!.addEventListener('click', () => {
    renderList();
    sheet().classList.add('show');
  });
  document
    .querySelector('[data-close-standards]')!
    .addEventListener('click', () => sheet().classList.remove('show'));
  sheet().addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'standards') {
      sheet().classList.remove('show');
    }
  });
}
