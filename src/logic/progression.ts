import type { ExEntry, SessionLog } from '../storage/db';

/** The six weeks of a phase. Index order matters for "last time" lookups. */
export const WEEKS = [
  'Week 1',
  'Week 2',
  'Week 3',
  'Week 4',
  'Week 5',
  'Deload',
] as const;
export type Week = (typeof WEEKS)[number];

export const logKey = (phase: string, week: string, session: string): string =>
  `${phase}|${week}|${session}`;

export const exKey = (letter: string, name: string): string => `${letter} ${name}`;

/** Top of a "3-4" / "8-10" range. Falls back to 3 for "-" or non-numeric. */
export function topOf(range: string): number {
  if (!range || range === '-') return 3;
  const m = range.match(/(\d+)\s*(?:[-–]\s*(\d+))?/);
  if (!m) return 3;
  return parseInt(m[2] || m[1]);
}

/**
 * Double-progression suggestion based on the previous session.
 * - If every logged set already hit the top of the rep range → bump to a new set
 *   or a harder variation, resetting reps to the low end.
 * - Otherwise → add one rep to any set below the top.
 */
export function suggest(prev: ExEntry, repsRange: string): string {
  const mm = repsRange.match(/(\d+)\s*(?:[-–]\s*(\d+))?/);
  if (!mm) return '';
  const top = parseInt(mm[2] || mm[1]);
  if (!top) return '';
  const done = prev.sets
    .filter((x) => x.reps !== '')
    .map((x) => parseInt(x.reps))
    .filter((n) => !isNaN(n));
  if (!done.length) return '';
  if (done.every((n) => n >= top)) {
    return `${done.length}x${top} → add a set or harder variation`;
  }
  return done.map((n) => (n >= top ? n : n + 1)).join(', ');
}

export interface LastResult {
  week: string;
  e: ExEntry;
}

/** Most recent earlier week (within the current phase) that logged this exercise. */
export function lastTime(
  store: Record<string, SessionLog>,
  phase: string,
  session: string,
  ek: string,
  curWeek: string,
): LastResult | null {
  const order = WEEKS.indexOf(curWeek as Week);
  let best: ExEntry | null = null;
  let bestRank = -1;
  for (let wi = 0; wi < WEEKS.length; wi++) {
    if (order !== -1 && wi >= order) continue;
    const e = (store[logKey(phase, WEEKS[wi], session)] || {})[ek];
    if (e && e.sets.some((x) => x.reps !== '') && wi > bestRank) {
      best = e;
      bestRank = wi;
    }
  }
  return best ? { week: WEEKS[bestRank], e: best } : null;
}

/** Seconds from a rest string like "1:30" or "2:00-3:00" (uses the first value). */
export function parseRest(rest: string): number {
  const m = rest.match(/(\d+):(\d+)/);
  if (!m) return 90;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
