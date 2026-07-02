import { parseRest } from '../logic/progression';

/**
 * Countdown computed from an end timestamp, not a decremented counter —
 * browsers throttle intervals in background tabs / locked phones, and a
 * per-tick counter silently drifts long. A timestamp stays correct no matter
 * how rarely the tick fires.
 */
let endAt = 0;
let restT: number | null = null;
let audio: AudioContext | null = null;

const restEl = () => document.getElementById('rest')!;
const restTimeEl = () => document.getElementById('restTime')!;

const secsLeft = (): number => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));

function draw(): void {
  const left = secsLeft();
  const m = Math.floor(left / 60);
  const s = left % 60;
  restTimeEl().textContent = `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * iOS Safari only lets audio start from a user gesture. startRest() IS a tap,
 * so we create/resume the context there and reuse it when the timer expires.
 */
function ensureAudio(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    audio = audio ?? new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* audio not available */
  }
}

function beep(): void {
  try {
    const a = audio;
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.frequency.value = 880;
    o.start();
    g.gain.setValueAtTime(0.3, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.5);
    o.stop(a.currentTime + 0.5);
  } catch {
    /* audio not available */
  }
}

export function startRest(rest: string): void {
  ensureAudio();
  endAt = Date.now() + parseRest(rest) * 1000;
  restEl().classList.add('show');
  draw();
  if (restT) clearInterval(restT);
  restT = window.setInterval(() => {
    draw();
    if (secsLeft() <= 0) {
      if (restT) clearInterval(restT);
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      beep();
      setTimeout(stopRest, 1500);
    }
  }, 250);
}

export function addRest(s: number): void {
  endAt += s * 1000;
  draw();
}

export function stopRest(): void {
  if (restT) clearInterval(restT);
  restEl().classList.remove('show');
}

/** Wire the +30s / Done buttons once at startup. */
export function initRestControls(): void {
  document
    .querySelector('[data-rest-add]')!
    .addEventListener('click', () => addRest(30));
  document
    .querySelector('[data-rest-done]')!
    .addEventListener('click', () => stopRest());
}
