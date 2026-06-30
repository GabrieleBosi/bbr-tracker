import type { ProgramId } from '../data/program';

export interface DayTarget {
  program: ProgramId;
  session: string;
}

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
  return SPLIT[d.getDay()];
}
