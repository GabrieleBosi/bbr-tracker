import { parseRest } from '../logic/progression';

let restT: number | null = null;
let restLeft = 0;

const restEl = () => document.getElementById('rest')!;
const restTimeEl = () => document.getElementById('restTime')!;

function draw(): void {
  const m = Math.floor(Math.max(0, restLeft) / 60);
  const s = Math.max(0, restLeft) % 60;
  restTimeEl().textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function beep(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const a = new Ctx();
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
  restLeft = parseRest(rest);
  restEl().classList.add('show');
  draw();
  if (restT) clearInterval(restT);
  restT = window.setInterval(() => {
    restLeft--;
    draw();
    if (restLeft <= 0) {
      if (restT) clearInterval(restT);
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      beep();
      setTimeout(stopRest, 1500);
    }
  }, 1000);
}

export function addRest(s: number): void {
  restLeft += s;
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
