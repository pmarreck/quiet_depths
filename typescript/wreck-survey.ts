// Mirrored in elm/Sim/WreckSurvey.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {operatingFraction} from './equipment.ts';
import {missions} from './mission-catalog.ts';

// The Elm mission definition owns these values. The briefing, the scan rule,
// progress text and ROV photographs all read the same generated record.
export interface SurveyCriteria {
  scanSeconds: number;
  horizontalRange: number;
  verticalRange: number;
  slowestKnots: number;
  fastestKnots: number;
  photographs: number;
  photoSeparation: number;
}

export const surveyCriteria: SurveyCriteria = missions.find(m => m.id === 'survey')!.objective;

export interface SurveyPass {
  range: number;
  vertical: number;
  speed: number;
  sonar: number;
}

// Scan seconds earned per patrol second. Both ranges are strict limits and
// the knot band is inclusive. Sonar below its working threshold earns nothing.
export function scanRate(pass: SurveyPass, c: SurveyCriteria): number {
  const speed = Math.abs(pass.speed);
  const inside = pass.range < c.horizontalRange && pass.vertical < c.verticalRange &&
    speed >= c.slowestKnots && speed <= c.fastestKnots;
  return inside ? operatingFraction(pass.sonar) : 0;
}

export function addScan(scan: number, rate: number, dt: number, c: SurveyCriteria): number {
  return Math.min(c.scanSeconds, scan + dt * rate);
}

export function surveyComplete(op: {scan: number; photoAngles: readonly number[]}, c: SurveyCriteria): boolean {
  return op.scan >= c.scanSeconds || op.photoAngles.length >= c.photographs;
}
