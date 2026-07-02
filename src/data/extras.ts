/** Activity catalogue for the Extras diary (cardio + core). */
export interface ActivityDef {
  name: string;
  /** Show the distance (km) field. */
  dist: boolean;
  /** Show the elevation-gain (m) field. */
  elev: boolean;
  /** Show the carried-load (kg) field (ruck/vest). */
  load: boolean;
  /** Free-text activity name (the "Other" slot). */
  custom?: boolean;
}

export const ACTIVITIES: ActivityDef[] = [
  { name: 'Running', dist: true, elev: false, load: false },
  { name: 'Cycling', dist: true, elev: false, load: false },
  { name: 'Swimming', dist: true, elev: false, load: false },
  { name: 'Rucking', dist: true, elev: true, load: true },
  { name: 'Hiking', dist: true, elev: true, load: false },
  { name: 'Abs', dist: false, elev: false, load: false },
  { name: 'Other', dist: true, elev: false, load: false, custom: true },
];

export const activityDef = (name: string): ActivityDef =>
  ACTIVITIES.find((a) => a.name === name) ?? ACTIVITIES[ACTIVITIES.length - 1];

/** Local (not UTC) YYYY-MM-DD — the diary is keyed by the user's day. */
export function localDateISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Activity-appropriate pace/speed string from duration + distance, or '' when
 * it can't be derived. Running/rucking/hiking → min/km, cycling → km/h,
 * swimming → min/100m.
 */
export function paceString(activity: string, min: string, km: string): string {
  const m = parseFloat(min);
  const k = parseFloat(km);
  if (!m || !k || m <= 0 || k <= 0) return '';
  if (activity === 'Cycling') return `${((k / m) * 60).toFixed(1)} km/h`;
  const perUnit = activity === 'Swimming' ? m / (k * 10) : m / k;
  const unit = activity === 'Swimming' ? '/100m' : '/km';
  const mm = Math.floor(perUnit);
  const ss = Math.round((perUnit - mm) * 60);
  return `${mm}:${String(ss).padStart(2, '0')}${unit}`;
}
