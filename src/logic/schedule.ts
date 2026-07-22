import type { ProgramId } from '../data/program';
import { localDateISO } from '../data/extras';

export interface DayTarget {
  program: ProgramId;
  session: string;
}

/** Trip window (inclusive ISO dates). Device-local — no need to sync. */
export interface TripCfg {
  start?: string;
  end?: string;
}

const TRIP_KEY = 'bbr_trip_v1';

export function getTrip(): TripCfg {
  try {
    return JSON.parse(localStorage.getItem(TRIP_KEY) || '{}') as TripCfg;
  } catch {
    return {};
  }
}

export function setTrip(cfg: TripCfg): void {
  if (!cfg.start && !cfg.end) localStorage.removeItem(TRIP_KEY);
  else localStorage.setItem(TRIP_KEY, JSON.stringify(cfg));
}

/** True while today falls inside the configured trip window. */
export function onTrip(d: Date = new Date()): boolean {
  const t = getTrip();
  if (!t.start || !t.end) return false;
  const iso = localDateISO(d);
  return iso >= t.start && iso <= t.end;
}

/**
 * Travel-week suggestion: two near-failure strength days (Mon Upper, Thu Lower)
 * maximally spread, one conditioning day (Sat Circuit); every other day defaults
 * to easy Knee Zero maintenance so the default action is "move a little".
 */
const TRAVEL_SPLIT: Record<number, string> = {
  1: 'Upper',
  4: 'Lower',
  6: 'Circuit',
};

/**
 * Gabriele's weekly split. A suggestion only — the user can always navigate
 * elsewhere; nothing here forces a selection.
 *   Mon BBR Push 1 · Tue BBR Pull 1 · Wed ATG Day 1 · Thu BBR Push 2
 *   Fri BBR Pull 2 · Sat ATG Day 2 · Sun ATG Day 3
 */
const SPLIT: Record<number, DayTarget> = {
  1: { program: 'bbr', session: 'Push 1' },
  2: { program: 'bbr', session: 'Pull 1' },
  3: { program: 'atg', session: 'Day 1' },
  4: { program: 'bbr', session: 'Push 2' },
  5: { program: 'bbr', session: 'Pull 2' },
  6: { program: 'atg', session: 'Day 2' },
  0: { program: 'atg', session: 'Day 3' },
};

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Suggested program + session for a given date (defaults to today). */
export function todayTarget(d: Date = new Date()): DayTarget {
  if (onTrip(d)) {
    return {
      program: 'travel',
      session: TRAVEL_SPLIT[d.getDay()] ?? 'Knee Zero',
    };
  }
  return SPLIT[d.getDay()];
}
