// Mirrored in elm/Sim/PatrolReports.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {bearing, distance, log, rad, type LogEntry} from './mechanics.ts';
import {hash01} from './environment.ts';
import {addDebrief, type DebriefEntry} from './debrief.ts';

type Report = {id: string; text: string; time: number};
type Ship = {id: string; name: string; military?: boolean; side?: string; playerDamaged?: boolean; neutralHitAt?: number; wreckMark?: {x: number; y: number; observed: boolean}};
type Patrol = {time: number; events: LogEntry[]; debrief?: DebriefEntry[]};

export function report(s: Patrol & {reports: Report[]}, id: string, text: string): void {
  s.reports = s.reports.filter(r => r.id !== id && s.time - r.time < 18);
  s.reports.push({id, text, time: s.time});
  log(s, text);
}

export function recordCivilianHit(s: Patrol, ship: Ship, cause: string): void {
  if (ship.neutralHitAt !== undefined) return;
  ship.neutralHitAt = s.time;
  addDebrief(s, cause);
}

export function disciplinaryFinding(s: {ships: Ship[]; patrol: {seed: number}}) {
  const civilians = s.ships.filter(v => !v.military && v.neutralHitAt !== undefined);
  const allies = s.ships.filter(v => v.side === 'friendly' && v.playerDamaged);
  if (!civilians.length && !allies.length) return null;
  const seed = s.patrol.seed;
  return {title: hash01(seed, 951) < .5 ? 'COURT MARTIALED' : 'RANK DEMOTION',
    angle: (hash01(seed, 952) < .5 ? -1 : 1) * (3 + 17 * hash01(seed, 953)),
    reason: [civilians.length ? 'Civilian casualties. Your fire struck ' + civilians.map(v => v.name).join(', ') + '.' : '',
      allies.length ? 'Friendly fire. Your fire struck ' + allies.map(v => v.name).join(', ') + '.' : ''].filter(Boolean).join(' ')};
}

export function hearWreck(s: {x: number; y: number; ships: Ship[]}, source: {id: number; vessel?: string; x: number; y: number}): void {
  const ship = s.ships.find(v => v.id === source.vessel);
  if (!ship || ship.wreckMark) return;
  // A single acoustic report plots an approximate site, even for an unknown hull.
  const range = distance(s, source), angle = rad(bearing(s, source) + (hash01(source.id, 51) - .5) * 7);
  const estimate = range * (.89 + .22 * hash01(source.id, 52));
  ship.wreckMark = {x: s.x + Math.sin(angle) * estimate, y: s.y + Math.cos(angle) * estimate, observed: false};
}
