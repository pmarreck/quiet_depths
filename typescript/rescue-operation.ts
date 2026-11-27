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
}

export const underseaRescue: RescueCriteria = missions.find(m => m.id === 'undersea-rescue')!.objective;
export const surfaceRescue: RescueCriteria = missions.find(m => m.id === 'surface-rescue')!.objective;

// A surface casualty uses the surface rules; any other site uses the undersea rules.
export const rescueCriteriaFor = (siteKind: string): RescueCriteria => siteKind === 'surface' ? surfaceRescue : underseaRescue;

export function stationKeeping(range: number, speed: number, depthError: number, c: RescueCriteria) {
  const onStation = range >= c.closestRange && range <= c.farthestRange && Math.abs(speed) <= c.fastestKnots;
  return {onStation, holding: onStation && Math.abs(depthError) < c.depthTolerance};
}
