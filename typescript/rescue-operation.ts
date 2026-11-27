// Mirrored in elm/Sim/RescueOperation.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {missions} from './mission-catalog.ts';

// The Elm mission definitions own these values. The briefing, station keeping,
// the team's timings and the progress text all read the same generated records.
export interface RescueCriteria {
  closestRange: number;
  farthestRange: number;
  depthTolerance: number;
  fastestKnots: number;
  assessmentSeconds: number;
  transferSeconds: number;
  returnSeconds: number;
  emptySiteChance: number;
  fewestSurvivors: number;
  survivorSpread: number;
  casualtyClockStart: number;
  firstLossDelay: number;
  firstLossSpread: number;
  laterLossDelay: number;
  laterLossSpread: number;
  sinking: SinkingCasualty | null;
}

export interface SinkingCasualty {
  startDepth: number;
  settleSeconds: number;
  foundersAfter: number;
  foundersSpread: number;
  sinkRate: number;
  lostBelow: number;
}

// Depth of a sinking casualty, never below its resting place on the seabed.
export function casualtyDepth(age: number, roll: number, sink: SinkingCasualty, restingDepth: number): number {
  return Math.min(restingDepth, sink.startDepth + age / sink.settleSeconds + Math.max(0, age - (sink.foundersAfter + roll * sink.foundersSpread)) * sink.sinkRate);
}

export const underseaRescue: RescueCriteria = missions.find(m => m.id === 'undersea-rescue')!.objective;
export const surfaceRescue: RescueCriteria = missions.find(m => m.id === 'surface-rescue')!.objective;

// A surface casualty uses the surface rules; any other site uses the undersea rules.
export const rescueCriteriaFor = (siteKind?: string): RescueCriteria => siteKind === 'surface' ? surfaceRescue : underseaRescue;

export function initialSurvivors(emptyRoll: number, countRoll: number, c: RescueCriteria): number {
  return emptyRoll < c.emptySiteChance ? 0 : c.fewestSurvivors + Math.floor(countRoll * c.survivorSpread);
}

export function nextLossDelay(dead: number, roll: number, c: RescueCriteria): number {
  return dead === 0 ? c.firstLossDelay + roll * c.firstLossSpread : c.laterLossDelay + roll * c.laterLossSpread;
}

export function stationKeeping(range: number, speed: number, depthError: number, c: RescueCriteria) {
  const onStation = range >= c.closestRange && range <= c.farthestRange && Math.abs(speed) <= c.fastestKnots;
  return {onStation, holding: onStation && Math.abs(depthError) < c.depthTolerance};
}
