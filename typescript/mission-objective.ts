import {missions} from './mission-catalog.ts';
import {friendlyLead} from './fleet-action.ts';
import type {SurveyCriteria} from './wreck-survey.ts';
import type {RescueCriteria} from './rescue-operation.ts';

export {missions as MISSIONS};
type Mission = (typeof missions)[number];
type Point = {x: number; y: number};
interface Patrol extends Point {
  mission: Mission['id'];
  home: Point;
  patrol: {photoGoal: number; trackGoal: number};
  photos: readonly unknown[];
  ships: readonly {id: string; hull: number}[];
  trackTime: number;
}

const objectives = new Map(missions.map(m => [m.id, m.objective] as const));
export const convoyTransportIds = missions.find(m => m.id === 'seek-and-destroy')!.objective.targets;

export function allSunk(ships: Patrol['ships'], targets: readonly string[]): boolean {
  return targets.every(id => ships.find(ship => ship.id === id)?.hull === 0);
}

// Mission work that changes patrol state each tick stays with the simulation.
export interface ObjectiveWork<P> {
  rescue: (state: P, dt: number, criteria: RescueCriteria) => boolean;
  survey: (state: P, dt: number, criteria: SurveyCriteria) => boolean;
}

export function evaluateObjective<P extends Patrol>(state: P, dt: number, work: ObjectiveWork<P>): boolean {
  const goal = objectives.get(state.mission);
  if (!goal) throw new Error('Unknown patrol mission: ' + state.mission);
  switch (goal.kind) {
    case 'photographs':
      return state.photos.length >= state.patrol.photoGoal;
    case 'sink':
      return allSunk(state.ships, goal.targets);
    case 'survive':
      return true;
    case 'fleetLead':
      return friendlyLead(state.ships) >= goal.margin;
    case 'protectConvoy':
      return allSunk(state.ships,[goal.hunter]);
    case 'gate':
      return Math.hypot(state.x - state.home.x, state.y - state.home.y) <= goal.radius;
    case 'track':
      return state.trackTime >= state.patrol.trackGoal;
    case 'rescue':
      return work.rescue(state, dt, goal);
    case 'survey':
      return work.survey(state, dt, goal);
  }
}
