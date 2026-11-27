import {playerSignal} from './cold-watch.ts';
import {exitPitch} from './torpedo-tubes.ts';
import {replayEvent} from './replay-events.ts';
import {gameEcho} from './torpedo-watch.ts';
import {registerCarrierHit} from './carrier.ts';
import {recordCivilianHit, report} from './patrol-reports.ts';
import {clamp, rad, bearing, delta, distance, rand} from './mechanics.ts';
import {hash01} from './environment.ts';
import {emitSound} from './acoustics.ts';
import {hurt} from './systems.ts';
import {addDebrief} from './debrief.ts';
import {raiseCarrierAlarm} from './air-support.ts';
import {shipHit, sphereHit, wrap} from './combat-geometry.ts';
import {slice} from './world-slice.ts';
import type {Aloft, CombatWorld, Point3, Ship, Torpedo} from './combat-types.ts';

// Fictional combat tuning. Positions are meters.
export const MAX_RUN = 4320;
export const TORPEDO_SPEED = 24;
export const TORPEDO_LIFE = 180, ARMING_TIME = 4;
const MAX_PITCH = Math.PI / 4;
export const SURFACE_RUN_DEPTH = 3;
export const ENEMY_DECOY_SUPPLY = 2;

export function torpedoOrders(s: CombatWorld, id: number, heading: number, depth: number) {
  return {orderedHeading: heading, orderedDepth: depth, pitch: 0, tubeSide: 0, searchAge: 0, runOut: 0,
    searchDirection: hash01(s.patrol.seed, id + 673) < .5 ? -1 : 1, decoysChecked: [] as string[], decoyTarget: null, diverted: false};
}

export function putTorpedoInWater(s: CombatWorld, owner: string, origin: Point3, heading: number, depth: number, launch: Partial<Torpedo>): Torpedo {
  const id = s.weaponSequence++;
  const shot: Torpedo = {id, owner, runLimit: owner === 'player' ? s.runSetting : MAX_RUN, traveled: 0, ...origin, age: 0, intended: null, lock: null, pingAge: 99,
    ...torpedoOrders(s, id, heading, depth), heading, ...launch, path: [{...origin, time: s.time}]};
  s.projectiles.push(shot);
  return shot;
}

const targetRunDepth = (ship: Ship) => ship.kind === 'sub' ? ship.depth ?? 65 : SURFACE_RUN_DEPTH;

function seekerReturn(s: CombatWorld, p: Torpedo): Ship | null {
  let best: Ship | null = null, score = 0;
  for (const ship of s.ships) {
    if (ship.hull <= 0) continue;
    const d = Math.hypot(distance(p, ship), targetRunDepth(ship) - p.depth);
    if (d > 1800 || Math.abs(delta(bearing(p, ship), p.heading)) > 40) continue;
    const loud = ship.noise ?? (ship.kind === 'merchant' ? 75 : ship.kind === 'escort' ? 65 : ship.kind === 'sub' ? 28 : 40) + Math.abs(ship.speed) * 3;
    const preference = ship.id === p.intended && !p.diverted ? 2.5 : 1, value = loud * preference / (d + 80);
    if (value > score) { best = ship; score = value; }
  }
  return best;
}

function releaseEnemyDecoy(s: CombatWorld, p: Torpedo, ship: Ship | null) {
  if (!ship || ship.kind !== 'sub' || !ship.military || p.decoysChecked.includes(ship.id)) return;
  const depth = targetRunDepth(ship);
  if (Math.hypot(distance(p, ship), depth - p.depth) > 220) return;
  const remaining = ship.torpedoDecoys ?? ENEMY_DECOY_SUPPLY;
  if (remaining === 0) return;
  ship.torpedoDecoys = remaining - 1;
  p.decoysChecked.push(ship.id);
  if (rand(s) >= .25) return;
  // Drop the decoy short of the sub and to one side of the incoming shot.
  const a = rad(bearing(p, ship)), side = p.searchDirection;
  p.decoyTarget = {x: ship.x - Math.sin(a) * 60 + Math.cos(a) * 24 * side, y: ship.y - Math.cos(a) * 60 - Math.sin(a) * 24 * side, depth, expiresAt: s.time + 18};
}

function searchCourse(p: Torpedo, dt: number) {
  p.searchAge += dt;
  const turnRate = 8 / (1 + p.searchAge / 24);
  return {heading: p.heading + p.searchDirection * turnRate * dt, depth: p.orderedDepth};
}

function torpedoCourse(s: CombatWorld, p: Torpedo, dt: number): {heading: number; depth: number} {
  if (p.tubeSide !== 0 && p.age <= ARMING_TIME / 2) return {heading: p.heading, depth: p.orderedDepth};
  if (p.age < ARMING_TIME) return {heading: p.orderedHeading, depth: p.orderedDepth};
  if (p.pingAge >= 2.4) {
    p.pingAge = 0;
    emitSound(s, {type: 'seeker', x: p.x, y: p.y, depth: p.depth, power: .24, echo: gameEcho(s, p, s.time, TORPEDO_SPEED)});
  }
  if (p.owner === 'enemy') {
    // The incoming shot knows only the launch report. Passing that point
    // starts a search even when the player has since moved somewhere else.
    const decoy = s.noisemaker;
    if (decoy && p.decoyCheckedAt !== decoy.time && distance(p, decoy) < 650) {
      p.decoyCheckedAt = decoy.time;
      if (hash01(s.patrol.seed, p.id + Math.floor(decoy.time) * 19) < .25) { p.diverted = true; p.aim = null; }
    }
    if (p.diverted) {
      const other = s.ships.find(v => v.military && v.id !== p.launcher && v.hull > 0 && distance(p, v) < 750);
      if (other) { p.lock = other.id; return {heading: bearing(p, other), depth: targetRunDepth(other)}; }
      p.lock = null;
    }
    if (p.aim) {
      const a = rad(p.orderedHeading), ahead = (p.aim.x - p.x) * Math.sin(a) + (p.aim.y - p.y) * Math.cos(a);
      if (ahead > 0) return {heading: bearing(p, p.aim), depth: p.orderedDepth};
      p.aim = null;
    }
    return searchCourse(p, dt);
  }
  if (p.decoyTarget && s.time >= p.decoyTarget.expiresAt) p.decoyTarget = null;
  const best = p.decoyTarget ? null : seekerReturn(s, p);
  releaseEnemyDecoy(s, p, best);
  p.lock = p.decoyTarget ? null : best?.id ?? null;
  const target = p.decoyTarget ?? best;
  if (target) {
    // After an acquisition, a lost return starts the search where it was lost.
    p.searchAge = 0; p.runOut = 0;
    if (p.lock) p.orderedDepth = targetRunDepth(best!);
    return {heading: bearing(p, target), depth: target === best ? targetRunDepth(best) : (target as Point3).depth};
  }
  if (p.traveled < (p.runOut ?? 0)) return {heading: p.orderedHeading, depth: p.orderedDepth};
  return searchCourse(p, dt);
}

function torpedoStrike(s: CombatWorld, p: Torpedo, from: Aloft): boolean {
  const to = {x: p.x, y: p.y, altitude: -p.depth};
  const hullHit = p.owner === 'enemy' ? shipHit(from, to, s, 'sub') : null;
  let hit: Ship | CombatWorld | null = hullHit === null ? null : s, fraction = hullHit ?? Infinity;
  for (const ship of s.ships) {
    if (ship.hull <= 0) continue;
    const t = shipHit(from, to, ship);
    if (t !== null && t < fraction) { hit = ship; fraction = t; }
  }
  if (!hit) return false;
  p.x = from.x + (p.x - from.x) * fraction; p.y = from.y + (p.y - from.y) * fraction;
  p.depth = -from.altitude + (p.depth + from.altitude) * fraction; p.age = TORPEDO_LIFE;
  emitSound(s, {type: 'detonation', x: p.x, y: p.y, depth: p.depth, power: 1, ownHit: p.owner === 'player'});
  s.impacts.push({id: p.id, x: p.x, y: p.y, altitude: -p.depth, time: s.time, kind: 'torpedo'});
  replayEvent(s, {kind: 'torpedo', shot: p.id, target: hit === s ? undefined : (hit as Ship).id, enemy: hit !== s && p.owner !== 'player',
    point: {x: p.x, y: p.y, depth: p.depth}, heading: p.heading});
  if (hit === s) {
    hurt(slice(s), 36, 'Torpedo struck the hull. Damage control responding.', null, p);
    addDebrief(s, 'An incoming torpedo struck your sub.');
    return true;
  }
  const ship = hit as Ship;
  if (ship.kind === 'carrier') {
    registerCarrierHit(slice(ship));
    raiseCarrierAlarm(s, ship);
    if (p.owner === 'player') { playerSignal(slice(s), slice(ship), true, null); ship.playerDamaged = true; addDebrief(s, 'Your torpedo struck ' + ship.name + ' (direct hit ' + ship.directHits + ').'); }
    return true;
  }
  if (p.owner === 'enemy') {
    ship.hull = Math.max(0, ship.hull - 100);
    return true;
  }
  ship.playerDamaged = true; ship.hull = Math.max(0, ship.hull - 100 * 2 ** (s.difficulty?.damage ?? 0));
  if (ship.military) addDebrief(s, 'Your torpedo struck ' + (ship.side === 'friendly' ? 'the friendly ' : '') + ship.name + '.');
  else recordCivilianHit(s, ship, p.diverted && p.intended !== ship.id
    ? 'A decoy diverted your torpedo before it acquired and struck the neutral ' + ship.name + '.'
    : 'Your torpedo struck the neutral ' + ship.name + '.');
  return true;
}

export function updateTorpedoes(s: CombatWorld, dt: number): void {
  for (const p of s.projectiles) {
    p.runLimit ??= MAX_RUN; p.traveled ??= Math.min(MAX_RUN, p.age * TORPEDO_SPEED);
    const flight = Math.min(dt, Math.max(0, TORPEDO_LIFE - p.age), Math.max(0, p.runLimit - p.traveled) / TORPEDO_SPEED);
    const travel = TORPEDO_SPEED * flight, from = {x: p.x, y: p.y, altitude: -p.depth};
    p.age += flight; p.pingAge += flight; p.traveled = Math.min(p.runLimit, p.traveled + travel);
    const course = torpedoCourse(s, p, flight);
    p.heading = wrap(p.heading + clamp(delta(course.heading, p.heading), -flight * 10, flight * 10));
    const drop = course.depth - p.depth, requestedPitch = clamp(Math.atan2(-drop, 32), -MAX_PITCH, MAX_PITCH);
    const pitch = p.tubeSide ? exitPitch(p.pitch, requestedPitch, p.age, flight, ARMING_TIME) : requestedPitch;
    const depthStep = -travel * Math.sin(pitch);
    const dz = depthStep * drop > 0 && Math.abs(depthStep) > Math.abs(drop) ? drop : depthStep;
    const horizontal = Math.sqrt(travel ** 2 - dz ** 2);
    p.pitch = dz === 0 ? 0 : Math.atan2(-dz, horizontal); p.depth += dz;
    p.x += Math.sin(rad(p.heading)) * horizontal; p.y += Math.cos(rad(p.heading)) * horizontal;
    const decoy = p.decoyTarget;
    if (decoy && sphereHit(from, {x: p.x, y: p.y, altitude: -p.depth}, {x: decoy.x, y: decoy.y, altitude: -decoy.depth}, 12) !== null) {
      p.decoyTarget = null; p.diverted = true; p.orderedDepth = p.depth;
      addDebrief(s, 'A torpedo followed a submarine decoy, passed it, then resumed its search.');
    }
    const hit = flight > 0 && p.age >= ARMING_TIME && torpedoStrike(s, p, from);
    if (!hit && (p.traveled >= p.runLimit || p.age >= TORPEDO_LIFE)) {
      p.age = TORPEDO_LIFE;
      if (p.owner === 'player') report(s, 'run-' + p.id, 'Torpedo run ended at its distance limit. No impact reported.');
    }
    if (!p.path.length || s.time - p.path.at(-1)!.time >= .24 || p.age >= TORPEDO_LIFE) p.path.push({x: p.x, y: p.y, depth: p.depth, time: s.time});
    p.path = p.path.filter(v => s.time - v.time < 40).slice(-80);
  }
  s.projectiles = s.projectiles.filter(p => p.age < TORPEDO_LIFE);
}
