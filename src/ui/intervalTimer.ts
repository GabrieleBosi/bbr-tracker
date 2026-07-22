/**
 * Full-screen interval / Tabata timer: GET READY → (WORK → REST) × rounds → DONE.
 * Countdown is computed from an end timestamp (not a decremented counter) so it
 * stays accurate even when the phone throttles timers in the background.
 * Audio is created on the Start tap (a user gesture) so iOS Safari allows beeps.
 */

export interface IntervalSpec {
  rounds: number;
  work: number;
}

/** Parse a "8×20s" / "8x20s" reps string into rounds × work-seconds. */
export function parseInterval(reps: string): IntervalSpec | null {
  const m = reps.match(/(\d+)\s*[×x]\s*(\d+)\s*s/i);
  if (!m) return null;
  return { rounds: parseInt(m[1]), work: parseInt(m[2]) };
}

type Kind = 'prep' | 'work' | 'rest' | 'done';
interface Phase {
  label: string;
  kind: Kind;
  secs: number;
  round: number;
}

let phases: Phase[] = [];
let idx = 0;
let phaseEndAt = 0;
let paused = false;
let remainingOnPause = 0;
let timer: number | null = null;
let stopTimeout: number | null = null;
let lastTick = -1;
let cfg = { rounds: 8, work: 20, rest: 10 };
let audio: AudioContext | null = null;

const el = (id: string) => document.getElementById(id)!;
const overlay = () => el('interval');

function ensureAudio(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    audio = audio ?? new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no audio */
  }
}

function tone(freq: number, dur: number, delay = 0): void {
  try {
    const a = audio;
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.frequency.value = freq;
    const t = a.currentTime + delay;
    o.start(t);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.stop(t + dur);
  } catch {
    /* no audio */
  }
}

const workBeep = () => {
  tone(880, 0.15);
  tone(880, 0.15, 0.2);
};
const restBeep = () => tone(440, 0.25);
const tickBeep = () => tone(660, 0.08);
const doneBeep = () => {
  tone(880, 0.3);
  tone(660, 0.3, 0.32);
  tone(990, 0.5, 0.64);
};
const buzz = (p: number | number[]) => {
  if (navigator.vibrate) navigator.vibrate(p);
};

function buildPhases(rounds: number, work: number, rest: number): Phase[] {
  const p: Phase[] = [{ label: 'GET READY', kind: 'prep', secs: 5, round: 0 }];
  for (let r = 1; r <= rounds; r++) {
    p.push({ label: 'WORK', kind: 'work', secs: work, round: r });
    if (r < rounds && rest > 0) {
      p.push({ label: 'REST', kind: 'rest', secs: rest, round: r });
    }
  }
  p.push({ label: 'DONE', kind: 'done', secs: 0, round: rounds });
  return p;
}

function paint(ph: Phase, left: number): void {
  el('ivPhase').textContent = ph.label;
  el('ivCount').textContent = ph.kind === 'done' ? '✓' : String(Math.max(0, left));
  el('ivRound').textContent =
    ph.kind === 'prep'
      ? `${cfg.rounds} × ${cfg.work}s work / ${cfg.rest}s rest`
      : ph.kind === 'done'
        ? `${cfg.rounds} rounds done 🎉`
        : `Round ${ph.round} / ${cfg.rounds}`;
  overlay().className = `ivoverlay show ${ph.kind}`;
}

function enter(i: number): void {
  idx = i;
  const ph = phases[i];
  lastTick = -1;
  if (ph.kind === 'work') {
    workBeep();
    buzz(80);
  } else if (ph.kind === 'rest') {
    restBeep();
    buzz(40);
  } else if (ph.kind === 'done') {
    doneBeep();
    buzz([120, 60, 120]);
    paint(ph, 0);
    if (timer) clearInterval(timer);
    timer = null;
    if (stopTimeout) clearTimeout(stopTimeout);
    stopTimeout = window.setTimeout(stop, 2500);
    return;
  }
  phaseEndAt = Date.now() + ph.secs * 1000;
  paint(ph, ph.secs);
}

function loop(): void {
  if (paused) return;
  const ph = phases[idx];
  if (ph.kind === 'done') return;
  const left = Math.ceil((phaseEndAt - Date.now()) / 1000);
  if (left <= 0) {
    enter(idx + 1);
    return;
  }
  paint(ph, left);
  if (left <= 3 && left !== lastTick) {
    tickBeep();
    lastTick = left;
  }
}

export function startInterval(rounds: number, work: number, rest: number): void {
  ensureAudio();
  cfg = { rounds, work, rest };
  phases = buildPhases(rounds, work, rest);
  paused = false;
  const pauseBtn = document.querySelector(
    '[data-iv-pause]',
  ) as HTMLButtonElement;
  pauseBtn.textContent = 'Pause';
  el('ivConfig').style.display = 'none';
  el('ivRun').style.display = '';
  enter(0);
  if (timer) clearInterval(timer);
  timer = window.setInterval(loop, 200);
}

function togglePause(): void {
  const ph = phases[idx];
  if (ph.kind === 'done') return;
  paused = !paused;
  const btn = document.querySelector('[data-iv-pause]') as HTMLButtonElement;
  if (paused) {
    remainingOnPause = phaseEndAt - Date.now();
    btn.textContent = 'Resume';
  } else {
    phaseEndAt = Date.now() + remainingOnPause;
    btn.textContent = 'Pause';
  }
}

export function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (stopTimeout) clearTimeout(stopTimeout);
  stopTimeout = null;
  overlay().className = 'ivoverlay';
  el('ivConfig').style.display = '';
  el('ivRun').style.display = 'none';
}

/** Open the config view, prefilling rounds/work from an exercise's reps. */
export function openInterval(spec?: IntervalSpec): void {
  const rounds = el('ivRounds') as HTMLInputElement;
  const work = el('ivWork') as HTMLInputElement;
  const rest = el('ivRest') as HTMLInputElement;
  if (spec) {
    rounds.value = String(spec.rounds);
    work.value = String(spec.work);
  }
  if (!rounds.value) rounds.value = '8';
  if (!work.value) work.value = '20';
  if (!rest.value) rest.value = '10';
  el('ivConfig').style.display = '';
  el('ivRun').style.display = 'none';
  overlay().classList.add('show');
}

export function initIntervalTimer(): void {
  document.querySelector('[data-iv-start]')!.addEventListener('click', () => {
    const rounds = parseInt((el('ivRounds') as HTMLInputElement).value) || 8;
    const work = parseInt((el('ivWork') as HTMLInputElement).value) || 20;
    const rest = parseInt((el('ivRest') as HTMLInputElement).value) || 0;
    startInterval(rounds, work, Math.max(0, rest));
  });
  document
    .querySelector('[data-iv-pause]')!
    .addEventListener('click', togglePause);
  document.querySelector('[data-iv-stop]')!.addEventListener('click', stop);
  document
    .querySelector('[data-iv-close]')!
    .addEventListener('click', () => overlay().classList.remove('show'));
  // Backdrop tap closes only when idle (never mid-workout).
  overlay().addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'interval' && !timer) {
      overlay().classList.remove('show');
    }
  });
}
