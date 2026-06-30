import type { ExEntry, SessionLog } from '../storage/db';

/** Program prefixes that mark an already-namespaced log key. */
export const KNOWN_PROGRAMS = ['bbr', 'atg'] as const;

/** `program|phase|week|session` */
export const logKey = (
  program: string,
  phase: string,
  week: string,
  session: string,
): string => `${program}|${phase}|${week}|${session}`;

/** True if a key is already namespaced by program (4 parts, known prefix). */
export function isProgramKey(k: string): boolean {
  const p = k.split('|');
  return (
    p.length === 4 && (KNOWN_PROGRAMS as readonly string[]).includes(p[0])
  );
}

/** Old 3-part keys (`phase|week|session`) belong to BBR — prefix them. */
export function normalizeLogKey(k: string): string {
  return isProgramKey(k) ? k : `bbr|${k}`;
}

export const exKey = (letter: string, name: string): string => `${letter} ${name}`;

/** Top of a "3-4" / "8-10" range. Falls back to 3 for "-" or non-numeric. */
export function topOf(range: string): number {
  if (!range || range === '-') return 3;
  const m = range.match(/(\d+)\s*(?:[-–]\s*(\d+))?/);
  if (!m) return 3;
  return parseInt(m[2] || m[1]);
}

/**
 * A reps value that encodes distance or time (e.g. "40m", "15s", "2:00-4:00",
 * "20 min") rather than a rep count. Double-progression doesn't apply to these.
 */
export function isDistanceOrTime(reps: string): boolean {
  return /:/.test(reps) || /\d\s*(?:m|yd|s|min)\b/i.test(reps);
}

/**
 * Double-progression suggestion based on the previous session.
 * - Distance/time exercises (sled drags, sprints, holds) get no suggestion.
 * - If every logged set already hit the top of the rep range → bump to a new set
 *   or a harder variation, resetting reps to the low end.
 * - Otherwise → add one rep to any set below the top.
 */
export function suggest(prev: ExEntry, repsRange: string): string {
  if (isDistanceOrTime(repsRange)) return '';
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

/** Most recent earlier week (same program + group) that logged this exercise. */
export function lastTime(
  store: Record<string, SessionLog>,
  program: string,
  phase: string,
  session: string,
  ek: string,
  curWeek: string,
  weeks: string[],
): LastResult | null {
  const order = weeks.indexOf(curWeek);
  let best: ExEntry | null = null;
  let bestRank = -1;
  for (let wi = 0; wi < weeks.length; wi++) {
    if (order !== -1 && wi >= order) continue;
    const e = (store[logKey(program, phase, weeks[wi], session)] || {})[ek];
    if (e && e.sets.some((x) => x.reps !== '') && wi > bestRank) {
      best = e;
      bestRank = wi;
    }
  }
  return best ? { week: weeks[bestRank], e: best } : null;
}

/** Seconds from a rest string like "1:30" or "2:00-3:00" (uses the first value). */
export function parseRest(rest: string): number {
  const m = rest.match(/(\d+):(\d+)/);
  if (!m) return 90;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
