// Mirrored in elm/Sim/ConvoyTracking.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {operatingFraction} from './equipment.ts';
import {missions} from './mission-catalog.ts';

// The Elm mission definition owns these values. The briefing, the tracking
// rule and each patrol's seeded goal read the same generated record.
export interface TrackingCriteria {
  listeningRange: number;
  quieterThan: number;
  deeperThan: number;
  shortestGoal: number;
  goalStep: number;
  goalSteps: number;
}

export const trackingCriteria: TrackingCriteria = missions.find(m => m.id === 'shadow')!.objective;

export function trackingGoal(roll: number, c: TrackingCriteria): number {
  return c.shortestGoal + c.goalStep * Math.floor(roll * c.goalSteps);
}

type Vessel = {x: number; y: number; kind: string; hull: number; incidental?: boolean};
type Listener = {x: number; y: number; noise: number; depth: number; systems: {sonar: number}; ships: readonly Vessel[]};

// Damaged sonar shortens the listening range. Passing traffic is not the convoy.
export function trackingConvoy(s: Listener, c: TrackingCriteria): boolean {
  if (!(s.noise < c.quieterThan && s.depth > c.deeperThan)) return false;
  const range = c.listeningRange * operatingFraction(s.systems.sonar);
  return s.ships.some(v => !v.incidental && v.kind === 'merchant' && v.hull > 0 && Math.hypot(s.x - v.x, s.y - v.y) < range);
}
