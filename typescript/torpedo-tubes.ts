export const RELOAD_SECONDS = 20;
export type BowTube = 'port' | 'starboard';
type ReadyTimes = Record<BowTube, number>;

interface TubeState {
  time: number;
  torps: number; // Total remaining, including rounds already in the tubes.
  tubeReadyAt: ReadyTimes;
}

export function freshTubeTimes(): ReadyTimes {
  return {port: 0, starboard: 0};
}

export function validTubeTimes(value: unknown, now: number): value is ReadyTimes {
  if (!value || typeof value !== 'object') return false;
  const valid = (t: unknown) => typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= now + RELOAD_SECONDS;
  return 'port' in value && valid(value.port) && 'starboard' in value && valid(value.starboard);
}

// A single remaining round belongs to the tube that finishes reloading first.
export function torpedoTubes(state: TubeState): Record<BowTube, number | null> & {next: BowTube | null} {
  const {port, starboard} = state.tubeReadyAt;
  const first: BowTube = port === starboard
    ? (state.torps % 2 ? 'starboard' : 'port')
    : (port < starboard ? 'port' : 'starboard');
  const hasRound = (tube: BowTube) => state.torps > 1 || (state.torps === 1 && tube === first);
  return {
    port: hasRound('port') ? Math.max(0, port - state.time) : null,
    starboard: hasRound('starboard') ? Math.max(0, starboard - state.time) : null,
    next: state.torps > 0 && state.tubeReadyAt[first] <= state.time ? first : null,
  };
}
