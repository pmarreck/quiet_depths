// Mirrored in elm/Sim/HostileTracks.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// Its reports, projection, scatter and search time are elm/Sim/HunterReports.elm.
import {exp} from './sim-math.ts';
import {scopeExtension} from './periscope.ts';
import {searchSeconds} from './suspicion.ts';
import {bearing, clamp, delta, distance, log, rad, rand, type LogEntry} from './mechanics.ts';
import {emitSound, type Sound} from './acoustics.ts';
import {addDebrief, type DebriefEntry} from './debrief.ts';
import {restingStealth} from './seabed-rest.ts';

type Difficulty = {pursuit?: number; depthStealth?: number; detection?: number};
export interface Report {x: number; y: number; depth?: number; heading?: number; speed?: number; time: number; reason?: string; [key: string]: unknown}
export type Track = Report & {age: number};
type Noisemaker = {x: number; y: number; depth?: number; time: number};
type Shell = {id: number; x: number; y: number; depth: number; delay: number; fromX: number; fromY: number; total: number; hit?: boolean};
interface Patrol {
  x: number; y: number; depth: number; heading: number; speed: number; targetSpeed?: number; time: number; rng: number;
  difficulty?: Difficulty; systems: {periscope: number}; scope: boolean; scopeTravel?: number; noise: number; bottomed: boolean;
  noisemaker?: Noisemaker; engine?: string; events: LogEntry[]; debrief?: DebriefEntry[];
  shells: Shell[]; soundSequence: number; acoustics: Sound[];
}
interface Hunter {
  x: number; y: number; depth: number; kind: string; name: string; heading: number; speed: number; alert: number; attack: number;
  report?: Report; tracking?: string | null; patrolSpeed?: number; lastAttackAt?: number;
}
type Charge = {x: number; y: number; depth: number; delay: number; kind: 'charge'};

export function playerReport(s: Patrol): Report {
  return {x: s.x, y: s.y, depth: s.depth, heading: s.heading, speed: s.speed, time: s.time};
}

export const searchDuration = (s: {difficulty?: Difficulty}) => searchSeconds(s.difficulty?.pursuit ?? 1);

export function projectedReport<R extends Report>(report: R, time: number, lead = 0): R & {age: number} {
  const age = Math.max(0, time - report.time), travel = (age + lead) * (report.speed ?? 0) * .514444, course = rad(report.heading ?? 0);
  return {...report, age, x: report.x + Math.sin(course) * travel, y: report.y + Math.cos(course) * travel};
}

export function validReport(report: Record<string, unknown> | null | undefined, time: number, legacy = false): boolean {
  if (!report || !['x', 'y', 'time'].every(key => Number.isFinite(report[key])) || (report.time as number) < 0 || (report.time as number) > time) return false;
  const fields = ['depth', 'heading', 'speed'];
  return fields.every(key => Number.isFinite(report[key]) || legacy && report[key] === undefined);
}

export function scatterAim(s: {rng: number}, target: {x: number; y: number}, radius: number) {
  const direction = 2 * Math.PI * rand(s), offset = radius * Math.sqrt(rand(s));
  return {x: target.x + Math.sin(direction) * offset, y: target.y + Math.cos(direction) * offset};
}

export function updateHostileTrack(s: Patrol, ship: Hunter, env: {subVisualRange: number; storm: number}, dt: number): Track | null {
  const range = distance(s, ship);
  const mast = s.depth <= 15 && s.systems.periscope > 0 ? scopeExtension(s) : 0;
  const exposure = s.depth < 3 ? 90 + 5 * mast : 23 * mast;
  const visual = ship.kind === 'sub' && ship.depth > 15 ? 0 : clamp(1 - range / env.subVisualRange, 0, 1) * exposure;
  const depthStealth = s.difficulty?.depthStealth ?? 1;
  const noise = s.noise * (1 - .45 * depthStealth * clamp(s.depth / 120, 0, 1));
  const acoustic = clamp(1 - range / 5500, 0, 1) * noise * .7 * (1 - env.storm * .38 * exp(-s.depth / 70)) *
    restingStealth(s.bottomed, Math.max(Math.abs(s.speed), Math.abs(s.targetSpeed ?? s.speed)));
  const pursuit = s.difficulty?.pursuit ?? 1, sensitivity = s.difficulty?.detection ?? 1;
  const canSee = visual * sensitivity >= 9;
  const decoy = s.noisemaker, decoyRange = decoy ? distance(ship, decoy) : Infinity;
  const fooled = !canSee && decoyRange < 1050 && s.time - decoy!.time <= 32 && (acoustic * sensitivity < 8 || decoyRange < range * .65);
  const observed = canSee || acoustic * sensitivity >= 8;
  if (fooled) { ship.report = {...decoy!, time: s.time, reason: 'noisemaker'}; ship.alert = clamp(ship.alert + dt * 1.35, 0, 100); }
  else if (observed && (!ship.report || s.time - ship.report.time >= 2 || ship.report.reason === 'noisemaker')) {
    const reason = canSee ? (s.depth < 3 ? 'surfaced hull' : 'raised periscope') : s.engine === 'diesel' && s.depth <= 14 ? 'diesel noise' : 'propulsion noise';
    ship.report = {...playerReport(s), reason};
  }
  if (!fooled) ship.alert = clamp(ship.alert + dt * ((observed ? (visual + acoustic) * sensitivity * .06 : 0) - .65 / pursuit), 0, 100);
  if (!ship.report || s.time - ship.report.time > searchDuration(s) || ship.alert <= 42) return null;
  return projectedReport(ship.report, s.time);
}

export function reportHunterState(s: {time: number; debrief?: DebriefEntry[]}, ship: Hunter, track: Track | null): void {
  const name = ship.kind === 'sub' ? 'An enemy submarine' : ship.name;
  const status = track ? (track.reason === 'noisemaker' ? 'decoy' : track.age > 4 ? 'searching' : 'tracking') : null;
  if ((ship.tracking ?? null) === status) return;
  if (status === 'tracking') addDebrief(s, `${name} ${ship.tracking ? 'reacquired' : 'detected'} you by ${track!.reason || 'a sonar ping'}.`);
  if (status === 'searching') addDebrief(s, `${name} lost contact and searched along your last observed course of ${Math.round(track!.heading as number)}° at ${Math.abs(track!.speed as number).toFixed(1)} kn.`);
  if (status === 'decoy') addDebrief(s, `${name} followed the noisemaker.`);
  if (!status) {
    addDebrief(s, `${name} broke off pursuit.`);
    if (ship.patrolSpeed !== undefined) { ship.speed = ship.patrolSpeed; delete ship.patrolSpeed; }
  }
  ship.tracking = status;
}

export function pursueAndAttack(s: Patrol, ship: Hunter, track: Track, dt: number,
  dropCharge: (s: Patrol, charge: Charge) => void, launchTorpedo: (s: Patrol, ship: Hunter, track: Track) => void): void {
  ship.patrolSpeed ??= ship.speed;
  ship.heading = (ship.heading + clamp(delta(bearing(ship, track), ship.heading), -dt * 2.5, dt * 2.5) + 360) % 360;
  ship.speed = ship.kind === 'escort' ? 15 : 8;
  if (ship.alert <= 55) return;
  const range = distance(ship, track), guns = ship.kind === 'escort' && (track.depth as number) <= 2;
  const reach = guns ? 2600 : ship.kind === 'sub' ? 2300 : 420;
  if (range >= reach) return;
  ship.attack -= dt;
  if (ship.attack > 0) return;
  ship.lastAttackAt = s.time;
  if (guns) {
    const delay = 1.5 + range / 550, aim = projectedReport(ship.report!, s.time, delay);
    const point = scatterAim(s, aim, 25 + range * .065 + track.age * .6);
    ship.attack = 12;
    s.shells.push({id: s.soundSequence++, ...point, depth: 0, delay, fromX: ship.x, fromY: ship.y, total: delay});
    emitSound(s, {type: 'gunfire', x: ship.x, y: ship.y, altitude: 12, power: 1});
    log(s, 'Escort firing. Shells incoming. Dive or return fire.', 'damage');
  } else if (ship.kind === 'sub') {
    ship.attack = 35;
    launchTorpedo(s, ship, track);
  } else {
    const depth = clamp((track.depth as number) + (rand(s) - .5) * (12 + track.age * .35), 0, 220);
    const delay = Math.max(4, depth / 4.5), aim = projectedReport(ship.report!, s.time, delay);
    const point = scatterAim(s, aim, 70 + range * .48 + track.age * 1.4);
    ship.attack = 35;
    dropCharge(s, {...point, depth, delay, kind: 'charge'});
    addDebrief(s, ship.name + ' dropped a depth charge.');
  }
}
