import bbrRaw from './program.json';
import atgRaw from './atg_program.json';
import travelRaw from './travel_program.json';

/** One exercise row from a program. */
export interface Exercise {
  letter: string;
  name: string;
  cue: string;
  sets: string;
  reps: string;
  tempo: string;
  rest: string;
}

/** One group of sessions: a BBR Phase or an ATG Block. */
export interface ProgramGroup {
  name: string; // "Phase 1" / "Block 1" — used as the group pill label
  sessions: Record<string, Exercise[]>;
}

export interface AtgStandard {
  name: string;
  target: string;
}

export type ProgramId = 'bbr' | 'atg' | 'travel';

/** How a session is meant to be run — drives the format banner above the cards. */
export interface SessionNote {
  style: string;
  detail: string;
}

export interface ProgramDef {
  id: ProgramId;
  name: string; // full name
  short: string; // pill label: "BBR" / "ATG"
  brandHtml: string; // header brand markup
  groupNoun: string; // "Phase" / "Block"
  weeks: string[]; // week names, in order
  /** Keyed by group key ("1","2","3"). */
  groups: Record<string, ProgramGroup>;
  deloadHtml: string;
  standards?: AtgStandard[];
  /** Optional per-session format note, keyed by session name. */
  sessionNotes?: Record<string, SessionNote>;
}

/** A selection within a program (no program id). */
export interface Sel {
  phase: string; // group key
  week: string;
  session: string;
}

function toExercise(t: string[]): Exercise {
  return {
    letter: t[0],
    name: t[1],
    cue: t[2],
    sets: t[3],
    reps: t[4],
    tempo: t[5],
    rest: t[6],
  };
}

type RawGroup = { name: string; sessions?: Record<string, string[][]> };
type RawDays = Record<string, string[][]>;

function buildSessions(rows: RawDays): Record<string, Exercise[]> {
  return Object.fromEntries(
    Object.entries(rows).map(([s, list]) => [s, list.map(toExercise)]),
  );
}

// --- BBR: { meta, phases: { "1": { name, sessions } } } ---
const bbrPhases = (bbrRaw as { phases: Record<string, RawGroup> }).phases;
const bbrGroups: Record<string, ProgramGroup> = Object.fromEntries(
  Object.entries(bbrPhases).map(([key, phase]) => [
    key,
    { name: phase.name, sessions: buildSessions(phase.sessions ?? {}) },
  ]),
);

const BBR: ProgramDef = {
  id: 'bbr',
  name: 'Body By Rings',
  short: 'BBR',
  brandHtml: 'Body By <span>Rings</span>',
  groupNoun: 'Phase',
  weeks: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Deload'],
  groups: bbrGroups,
  deloadHtml:
    '<div class="deload"><b>Deload week.</b> Cut volume hard — do <b>1–2 sets</b> per exercise (2–3 for your main pull-up/chin-up). Same reps and tempo, leave 3–4 reps in the tank. Recover.</div>',
};

// --- ATG: { meta, weeks, blocks: { "1": { name, days }, "2": { days: "SAME_AS_BLOCK_1" } } } ---
type RawAtgBlock = { name: string; days: RawDays | 'SAME_AS_BLOCK_1' };
const atg = atgRaw as {
  weeks: string[];
  blocks: Record<string, RawAtgBlock>;
  atg_standards?: AtgStandard[];
};

const block1Days = atg.blocks['1'].days as RawDays;
const atgGroups: Record<string, ProgramGroup> = Object.fromEntries(
  Object.entries(atg.blocks).map(([key, block]) => {
    // Resolve the SAME_AS_BLOCK_1 sentinel: blocks 2 & 3 reuse block 1's days.
    const days = block.days === 'SAME_AS_BLOCK_1' ? block1Days : block.days;
    return [key, { name: block.name, sessions: buildSessions(days) }];
  }),
);

const ATG: ProgramDef = {
  id: 'atg',
  name: 'ATG · Knees Over Toes',
  short: 'ATG',
  brandHtml: '<span>ATG</span> Knees Over Toes',
  groupNoun: 'Block',
  weeks: atg.weeks,
  groups: atgGroups,
  deloadHtml:
    '<div class="deload"><b>Deload week.</b> Cut total sets ~40%, keep loads moderate, no new PRs. Use the recovery to retest 2–3 ATG standards instead of pushing load.</div>',
  standards: atg.atg_standards,
};

// --- Travel: BBR-shaped raw ({ phases }) plus its own weeks array ---
const travel = travelRaw as {
  weeks: string[];
  phases: Record<string, RawGroup>;
};
const travelGroups: Record<string, ProgramGroup> = Object.fromEntries(
  Object.entries(travel.phases).map(([key, phase]) => [
    key,
    { name: phase.name, sessions: buildSessions(phase.sessions ?? {}) },
  ]),
);

const TRAVEL: ProgramDef = {
  id: 'travel',
  name: 'Travel · Minimum Effective Dose',
  short: 'TRAVEL',
  brandHtml: '<span>Travel</span> Min Dose',
  groupNoun: 'Cycle',
  weeks: travel.weeks,
  groups: travelGroups,
  // No Deload week in the cycle, so this banner never renders — kept for shape.
  deloadHtml:
    '<div class="deload"><b>Deload.</b> Ease off: keep moving, skip the hard sets.</div>',
  sessionNotes: {
    Upper: {
      style: 'Antagonist supersets',
      detail:
        'Do A1, rest ~45s, A2, rest ~60s, repeat. Push paired with pull — ~half the time, same gains. Take the last superset near failure, then the drop-set finisher.',
    },
    Lower: {
      style: 'Antagonist supersets',
      detail:
        'Alternate each paired quad/hamstring move with short rest. Use furniture for balance on pistols/shrimps. Finish with the squat drop set if you have gas.',
    },
    Circuit: {
      style: 'Circuit · AMRAP',
      detail:
        'All six moves back to back for one round, ~15s transitions, rest 60–90s between rounds. 3–5 rounds, or AMRAP in 20 min. Log each round as a set.',
    },
    HIIT: {
      style: 'HIIT · Tabata',
      detail:
        'Each move: 20s max effort / 10s rest × 8 (4 min), then 1 min rest before the next. Bring a stopwatch or interval app. Tick the set done when the block is complete.',
    },
    'Knee Zero': {
      style: 'Easy maintenance',
      detail:
        'Do as often as daily — never to failure. This is knee health and mobility, not a hard session.',
    },
  },
};

export const PROGRAMS: Record<ProgramId, ProgramDef> = {
  bbr: BBR,
  atg: ATG,
  travel: TRAVEL,
};
export const PROGRAM_IDS: ProgramId[] = ['bbr', 'atg', 'travel'];

export const getProgram = (id: ProgramId): ProgramDef => PROGRAMS[id];

/** Default selection for a program: first group, first week, first session. */
export function defaultSel(id: ProgramId): Sel {
  const p = PROGRAMS[id];
  const phase = Object.keys(p.groups)[0];
  return { phase, week: p.weeks[0], session: Object.keys(p.groups[phase].sessions)[0] };
}
