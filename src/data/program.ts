import raw from './program.json';

/** One exercise row from the program. */
export interface Exercise {
  letter: string;
  name: string;
  cue: string;
  sets: string;
  reps: string;
  tempo: string;
  rest: string;
}

export interface Phase {
  name: string;
  /** Keyed by session name: "Push 1", "Pull 1", "Push 2", "Pull 2". */
  sessions: Record<string, Exercise[]>;
}

export type Program = Record<string, Phase>;

type RawPhase = { name: string; sessions: Record<string, string[][]> };
type RawProgram = {
  meta: Record<string, unknown>;
  phases: Record<string, RawPhase>;
};

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

const phases = (raw as RawProgram).phases;

export const PROGRAM: Program = Object.fromEntries(
  Object.entries(phases).map(([key, phase]) => [
    key,
    {
      name: phase.name,
      sessions: Object.fromEntries(
        Object.entries(phase.sessions).map(([sName, rows]) => [
          sName,
          rows.map(toExercise),
        ]),
      ),
    } satisfies Phase,
  ]),
);

export const PHASE_KEYS = Object.keys(PROGRAM);

/** Default starting selection. */
export const DEFAULT_CUR = { phase: '1', week: 'Week 1', session: 'Push 1' };
