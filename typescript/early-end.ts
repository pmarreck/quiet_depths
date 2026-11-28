// Mirrored in elm/Sim/EarlyEnd.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// Ending a patrol early at extraction: when the captain is asked, and what an
// early end has earned. The Elm mission definition owns each mission's rule.
import {missions} from './mission-catalog.ts';
import {carrierDoomed} from './carrier.ts';
import {addDebrief, type DebriefEntry} from './debrief.ts';
import {distance, log, type LogEntry} from './mechanics.ts';

type Mission = (typeof missions)[number];
export type PartialRule = NonNullable<Mission['earlyEnd']>;
export type EarlyEndOutcome = 'partial' | 'withdrawn';

// Surfacing inside this radius of extraction completes a finished patrol.
export const pickupRadius = 400;

type Point = {x: number; y: number};
export interface EarlyEndPatrol extends Point {
  mission: string; status: string; phase?: string; depth: number; time: number; home: Point;
  patrol: {photoGoal: number; trackGoal: number};
  photos: readonly unknown[]; trackTime: number;
  ships: readonly {id: string; hull: number; directHits?: number}[];
  operation: {rescued: number; scan: number; photoAngles: readonly number[]} | null;
  events: LogEntry[]; debrief?: DebriefEntry[];
}

const byId = new Map<string, Mission>(missions.map(m => [m.id, m]));
function missionOf(id: string): Mission {
  const mission = byId.get(id);
  if (!mission) throw new Error('Unknown patrol mission: ' + id);
  return mission;
}

export function earlyEndRule(mission: string): PartialRule | null {
  return missionOf(mission).earlyEnd;
}

// The briefed targets of a sinking objective; any other objective has none.
function briefedTargets(mission: string): readonly string[] {
  const goal = missionOf(mission).objective;
  if (goal.kind !== 'sink') throw new Error('Mission ' + mission + ' has no briefed targets');
  return goal.targets;
}

function surveySeconds(mission: string): number {
  const goal = missionOf(mission).objective;
  if (goal.kind !== 'survey') throw new Error('Mission ' + mission + ' has no wreck survey');
  return goal.scanSeconds;
}

export const insidePickup = (s: EarlyEndPatrol) => distance(s, s.home) < pickupRadius;

// Surfaced inside the pickup circle with the objective still open, on a
// mission whose extraction does not already end the patrol.
export function earlyEndOffered(s: EarlyEndPatrol): boolean {
  return s.status === 'patrol' && s.phase === 'objective' && earlyEndRule(s.mission) !== null && insidePickup(s) && s.depth <= 1;
}

const sunkTargets = (s: EarlyEndPatrol) => briefedTargets(s.mission).filter(id => s.ships.find(v => v.id === id)?.hull === 0).length;

export function partialCredit(s: EarlyEndPatrol): boolean {
  const rule = earlyEndRule(s.mission);
  if (!rule) return false;
  switch (rule.kind) {
    case 'none': return false;
    case 'photographs': return s.photos.length >= rule.atLeast;
    case 'sunk': return sunkTargets(s) >= rule.atLeast;
    case 'carrierFoundering': return briefedTargets(s.mission).some(id => carrierDoomed({directHits: s.ships.find(v => v.id === id)?.directHits ?? 0}));
    case 'survivors': return (s.operation?.rescued ?? 0) >= rule.atLeast;
    case 'scanOrPhotographs': return !!s.operation && (s.operation.scan >= rule.scanShare * surveySeconds(s.mission) || s.operation.photoAngles.length >= rule.photographs);
    case 'tracking': return s.trackTime >= rule.share * s.patrol.trackGoal;
  }
}

// Ask once per entry into the pickup circle: asking disarms the prompt, and
// only leaving the circle arms it again.
export function extractionPrompt(armed: boolean, s: EarlyEndPatrol): {ask: boolean; armed: boolean} {
  if (!insidePickup(s)) return {ask: false, armed: true};
  if (armed && earlyEndOffered(s)) return {ask: true, armed: false};
  return {ask: false, armed};
}

// The captain's order to end the patrol now. Returns the outcome, or null when
// the order no longer applies.
export function endPatrolEarly(s: EarlyEndPatrol): EarlyEndOutcome | null {
  if (!earlyEndOffered(s)) return null;
  const outcome: EarlyEndOutcome = partialCredit(s) ? 'partial' : 'withdrawn';
  s.status = outcome;
  if (outcome === 'partial') {
    log(s, 'Patrol ended at extraction with part of the objective complete.', 'success');
    addDebrief(s, 'You ended the patrol at extraction with part of the objective complete.');
  } else {
    log(s, 'Patrol ended at extraction. The objective was not met.', 'warning');
    addDebrief(s, 'You ended the patrol at extraction before any part of the objective was met.');
  }
  return outcome;
}

// What came home from a patrol ended early with partial credit.
export function partialSummary(s: EarlyEndPatrol): string {
  const rule = earlyEndRule(s.mission);
  if (!rule || rule.kind === 'none') throw new Error('Mission ' + s.mission + ' has no partial credit');
  switch (rule.kind) {
    case 'photographs': return `${s.photos.length} of ${s.patrol.photoGoal} merchant photographs came home.`;
    case 'sunk': return `${sunkTargets(s)} of ${briefedTargets(s.mission).length} military transports sank before you withdrew.`;
    case 'carrierFoundering': return 'The carrier was already sinking when you withdrew.';
    case 'survivors': return `${s.operation?.rescued ?? 0} survivors came home with you.`;
    case 'scanOrPhotographs': return 'Part of the wreck survey came home.';
    case 'tracking': return `${Math.floor(s.trackTime)} of ${s.patrol.trackGoal} seconds of convoy tracking came home.`;
  }
}
