import type { SessionLog } from '../storage/db';
import { logKey } from './progression';

export interface WeekStat {
  week: string;
  label: string;
  total: number;
  top: number;
  hasData: boolean;
}

/** Total reps and top set per week (current program + group) for one exercise. */
export function weeklyStats(
  store: Record<string, SessionLog>,
  program: string,
  phase: string,
  session: string,
  ek: string,
  weeks: string[],
): WeekStat[] {
  return weeks.map((week) => {
    const label = week === 'Deload' ? 'D' : week.replace('Week ', 'W');
    const e = (store[logKey(program, phase, week, session)] || {})[ek];
    if (e && e.sets.some((x) => x.reps !== '')) {
      const reps = e.sets.map((x) => parseInt(x.reps) || 0);
      return {
        week,
        label,
        total: reps.reduce((a, b) => a + b, 0),
        top: Math.max(...reps),
        hasData: true,
      };
    }
    return { week, label, total: 0, top: 0, hasData: false };
  });
}
