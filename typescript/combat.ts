import {playerSignal} from './cold-watch.ts';
import {recordLocalLaunch} from './mess-watch.ts';
import {isOpponent} from './fleet-action.ts';
import {freshTubeTimes, RELOAD_SECONDS, torpedoTubes} from './torpedo-tubes.ts';
import {replayEvent} from './replay-events.ts';
import {descentSpeed, submergedDepth, surfaceCollapseAge} from './foundering.ts';
import {advanceCarrierFlood, carrierDescentFactor, carrierDoomed, incidentalHull} from './carrier.ts';
import {operatingFraction} from './equipment.ts';
import {recordCivilianHit} from './patrol-reports.ts';
import {floorSurface} from './seafloor.ts';
import {clamp, rad, bearing, distance, log, rand} from './mechanics.ts';
import {hash01, boatSurfacePose} from './environment.ts';
import {emitSound, launchNoise} from './acoustics.ts';
import {hurt} from './systems.ts';
import {isSurfaced, boatPoint} from './vehicle-status.ts';
import {estimateAt, type Contact} from './track-estimates.ts';
import {scatterAim, type Track} from './hostile-tracks.ts';
import {SUB_DESIGN as D} from './hull-design.ts';
import {addDebrief} from './debrief.ts';
import {requestSupport, updateAircraft, raiseCarrierAlarm} from './air-support.ts';
import {ARMING_TIME, MAX_RUN, SURFACE_RUN_DEPTH, TORPEDO_SPEED, putTorpedoInWater, torpedoOrders, updateTorpedoes} from './torpedo-run.ts';
import {shipHit, sphereHit, wrap} from './combat-geometry.ts';
import {slice} from './world-slice.ts';
import {reportInvalidNumber} from './invalid-numbers.ts';
import type {Aircraft, Aloft, Blast, CombatWorld, Point3, Round, Ship, Torpedo} from './combat-types.ts';
export {MAX_RUN, TORPEDO_SPEED, ENEMY_DECOY_SUPPLY} from './torpedo-run.ts';

// Fictional combat tuning. Positions are meters; gun aim is compass/elevation.
export const freshCombat = () => ({crewQuietUntil: 0, tubeReadyAt: freshTubeTimes(), runSetting: MAX_RUN, reports: [], gun: {ammo: 240, cooldown: 0, shots: 0, angle: 0, elevation: 0},
  gunRounds: [], impacts: [], aircraft: [], airSupport: {status: 'idle', requestedAt: null, launchAt: null, base: {x: -3200, y: 3400}, lastKnown: null}, weaponSequence: 1, gunLoudUntil: 0});

export function chargeAltitude(charge: Blast): number {
  if (charge.exploded) return -charge.depth;
  const elapsed = clamp(charge.totalDelay - charge.delay, 0, charge.totalDelay), air = charge.airTime || 0;
  if (air && elapsed < air) return (charge.airHeight || 0) * (1 - (elapsed / air) ** 2);
  return -charge.depth * clamp((elapsed - air) / Math.max(.001, charge.totalDelay - air), 0, 1) || 0;
}

export function firingBearing(s: {time: number; x: number; y: number}, contact: Contact): number {
  const estimate = contact.fix ? estimateAt(contact, s.time) : null;
  return estimate ? bearing(s, estimate) : contact.bearing;
}

export function launchTorpedo(s: CombatWorld, id: string): boolean {
  const c = s.contacts.find(v => v.id === id);
  if (!c || c.side === 'friendly' || c.identified && !c.military || s.status !== 'patrol' || s.depth > 100) return false;
  const condition = operatingFraction(s.systems.tubes);
  if (!condition) return false;
  const tube = torpedoTubes(s).next;
  if (tube === null) return false;
  const tubeSide = tube === 'port' ? -1 : 1;
  s.tubeReadyAt[tube] = s.time + RELOAD_SECONDS / condition;
  s.torps--;
  const pose = boatSurfacePose(s);
  const origin = boatPoint(pose, {side: tubeSide * D.tubeSide, down: D.tubeDown, forward: D.tubeForward});
  const heading = firingBearing(s, c), depth = c.kind === 'sub' ? (c.depthEstimate as number | undefined) ?? s.depth : SURFACE_RUN_DEPTH;
  // Hold the gyro course out to the estimated range before circling. A bearing
  // alone gives no range, so that shot runs half its distance down the bearing.
  const estimate = c.fix ? estimateAt(c, s.time) : null;
  const runOut = Math.min(s.runSetting, estimate ? distance(origin, estimate) : s.runSetting / 2);
  putTorpedoInWater(s, 'player', origin, heading, depth, {intended: id, heading: pose.heading, pitch: pose.pitch, tubeSide, runOut});
  const target = s.ships.find(v => v.id === id);
  if (target && distance(s, target) < 3500) playerSignal(slice(s), slice(target), s.runSetting + 50 >= distance(origin, target));
  recordLocalLaunch(s, s); launchNoise(s, s, true);
  log(s, `Tube away. Bearing ${Math.round(heading)}. Seeker arms after its run-out.`, 'warning');
  return true;
}

export function launchHostileTorpedo(s: CombatWorld, ship: Ship & {depth: number; pitch: number}, track: Track): void {
  const range = distance(ship, track), tubeSide = ship.lastTubeSide === 1 ? -1 : 1;
  const origin = boatPoint(ship, {side: tubeSide * D.tubeSide, down: D.tubeDown, forward: D.tubeForward});
  const aim = scatterAim(s, track, 12 + range * .04 + track.age);
  const depth = clamp((track.depth as number) + (rand(s) - .5) * (4 + track.age * .25), SURFACE_RUN_DEPTH, 220);
  putTorpedoInWater(s, 'enemy', origin, bearing(origin, aim), depth, {heading: ship.heading, tubeSide, launcher: ship.id, aim});
  recordLocalLaunch(s, ship); launchNoise(s, ship);
  ship.lastTubeSide = tubeSide;
  addDebrief(s, ship.name + ' fired a torpedo at a reported contact.');
}

// Old saves kept only the blast point and countdown. Reconstruct the remaining
// approach along the bearing from the nearest submarine when one is available.
export function restoreIncomingRun(s: CombatWorld, blast: Point3 & {delay: number}): void {
  const source = s.ships.filter(ship => ship.kind === 'sub').sort((a, b) => distance(a, blast) - distance(b, blast))[0];
  const heading = source ? bearing(source, blast) : 0, remaining = TORPEDO_SPEED * Math.max(0, blast.delay);
  const origin = {x: blast.x - remaining * Math.sin(rad(heading)), y: blast.y - remaining * Math.cos(rad(heading)), depth: blast.depth};
  putTorpedoInWater(s, 'enemy', origin, heading, blast.depth, {age: ARMING_TIME, launcher: source?.id ?? null, aim: {x: blast.x, y: blast.y}});
}

// Save validation: a torpedo arrives as untrusted JSON. Older saves gain the
// fields added since, then every field is checked at run time.
export function restoreTorpedo(s: CombatWorld, input: unknown): boolean {
  const fields = input as Record<string, unknown> | null | undefined;
  if (!fields || !['x', 'y', 'heading', 'age'].every(k => Number.isFinite(fields[k]))) return false;
  const p = fields as unknown as Torpedo & {lock: string | null};
  if (p.id === undefined) p.id = s.weaponSequence++;
  const depth = p.depth ?? Math.min(s.depth, 6);
  for (const [k, v] of Object.entries({runLimit: MAX_RUN, traveled: Math.min(MAX_RUN, p.age * TORPEDO_SPEED), owner: 'player', intended: p.lock ?? null, lock: null, depth, pingAge: 99,
    path: [{x: p.x, y: p.y, depth, time: s.time}], ...torpedoOrders(s, p.id, p.heading, depth)})) if (fields[k] === undefined) fields[k] = v;
  const decoy = p.decoyTarget as Record<string, unknown> | null;
  return Number.isFinite(p.runLimit) && p.runLimit >= 100 && p.runLimit <= MAX_RUN && Number.isFinite(p.traveled) && p.traveled >= 0 && p.traveled <= p.runLimit &&
    Number.isSafeInteger(p.id) && ['depth', 'pingAge', 'orderedHeading', 'orderedDepth', 'pitch', 'searchAge', 'runOut'].every(k => Number.isFinite(fields[k])) && p.runOut >= 0 &&
    (p.owner === 'player' || p.owner === 'enemy' && (p.launcher === null || typeof p.launcher === 'string') &&
      (p.aim === null || !!p.aim && Number.isFinite(p.aim.x) && Number.isFinite(p.aim.y))) &&
    [-1, 1].includes(p.searchDirection) && [-1, 0, 1].includes(p.tubeSide) && typeof p.diverted === 'boolean' &&
    Array.isArray(p.decoysChecked) && p.decoysChecked.every(id => typeof id === 'string') &&
    (p.decoyCheckedAt === undefined || Number.isFinite(p.decoyCheckedAt) && p.decoyCheckedAt >= 0 && p.decoyCheckedAt <= s.time) &&
    (decoy === null || ['x', 'y', 'depth', 'expiresAt'].every(k => Number.isFinite(decoy[k]))) &&
    Array.isArray(p.path) && p.path.every(v => (['x', 'y', 'depth', 'time'] as const).every(k => Number.isFinite(v[k])));
}

export function fireDeckGun(s: CombatWorld, aim: {bearing: number; elevation: number}): boolean {
  // An aim that is not a finite number is a bug upstream: refuse it, and say so.
  if (!Number.isFinite(aim.bearing) || !Number.isFinite(aim.elevation)) {
    if (!Number.isFinite(aim.bearing)) reportInvalidNumber('fireDeckGun bearing', aim.bearing);
    if (!Number.isFinite(aim.elevation)) reportInvalidNumber('fireDeckGun elevation', aim.elevation);
    return false;
  }
  if (s.status !== 'patrol' || !isSurfaced(s) || s.gun.ammo <= 0 || s.gun.cooldown > 0 || !operatingFraction(s.systems.deckgun)) return false;
  s.gun.ammo--; s.gun.shots++; s.gun.cooldown = .25 / operatingFraction(s.systems.deckgun);
  const a = rad(s.heading), b = rad(aim.bearing), e = rad(clamp(aim.elevation, -15, 85)), speed = 600;
  s.gunRounds.push({id: s.weaponSequence++, owner: 'player', x: s.x + Math.sin(a) * 16, y: s.y + Math.cos(a) * 16, altitude: 6 - s.depth,
    vx: Math.sin(b) * Math.cos(e) * speed, vy: Math.cos(b) * Math.cos(e) * speed, vz: Math.sin(e) * speed, age: 0, tracer: s.gun.shots % 5 === 0});
  emitSound(s, {type: 'gunfire', x: s.x, y: s.y, altitude: 6, power: .6}); s.gunLoudUntil = s.time + 3;
  for (const ship of s.ships) if (isOpponent(ship) && distance(s, ship) < 6000) ship.alert = Math.max(ship.alert, 65);
  return true;
}

export function aimGunAt(s: CombatWorld, point: {x: number; y: number; vx?: number; vy?: number; altitude?: number}): void {
  const a = rad(s.heading), mount = {x: s.x + Math.sin(a) * 16, y: s.y + Math.cos(a) * 16}, d = distance(mount, point), travel = d / 600;
  const future = {x: point.x + (point.vx || 0) * travel, y: point.y + (point.vy || 0) * travel};
  s.gun.angle = wrap(bearing(mount, future) - s.heading); s.gun.elevation = clamp(Math.atan2((point.altitude ?? 2) - 6, d) * 180 / Math.PI, -15, 85);
}

function impact(s: CombatWorld, round: Round, point: Aloft, kind: string) { s.impacts.push({id: round.id, x: point.x, y: point.y, altitude: point.altitude, time: s.time, kind}); }

function updateRounds(s: CombatWorld, dt: number) {
  for (const r of s.gunRounds) {
    const from = {x: r.x, y: r.y, altitude: r.altitude};
    r.age += dt; r.previous = from; r.x += r.vx * dt; r.y += r.vy * dt; r.altitude += r.vz * dt;
    let nearest = Infinity, target: Ship | Aircraft | CombatWorld | null = null, type: 'ship' | 'aircraft' | 'own' | null = null;
    if (r.owner === 'player') {
      for (const ship of s.ships) {
        if (ship.hull <= 0 || ship.kind === 'sub' && (ship.depth || 0) > 8) continue;
        const t = shipHit(from, r, ship);
        if (t !== null && t < nearest) { nearest = t; target = ship; type = 'ship'; }
      }
      for (const plane of s.aircraft) {
        if (plane.hull <= 0) continue;
        const t = sphereHit(from, r, plane, 10);
        if (t !== null && t < nearest) { nearest = t; target = plane; type = 'aircraft'; }
      }
    } else if (s.depth <= 2) {
      const body = {x: s.x, y: s.y, altitude: 2}, t = sphereHit(from, r, body, 8);
      if (t !== null) { nearest = t; target = s; type = 'own'; }
    }
    if (target) {
      const point = {x: from.x + (r.x - from.x) * nearest, y: from.y + (r.y - from.y) * nearest, altitude: from.altitude + (r.altitude - from.altitude) * nearest};
      r.age = 99; impact(s, r, point, 'hit');
      const damageScale = 2 ** (s.difficulty?.damage ?? 0);
      if (type === 'ship') {
        const ship = target as Ship;
        playerSignal(slice(s), slice(ship), true, null); ship.playerDamaged = true;
        if (ship.kind === 'carrier') raiseCarrierAlarm(s, ship);
        ship.hull = incidentalHull(ship, 12 * damageScale);
        if (point.altitude + (ship.sinkDepth || 0) < 5) ship.flood = (ship.flood || 0) + 2.4 * damageScale;
        if (ship.side === 'friendly') addDebrief(s, 'Your deck gun struck the friendly ' + ship.name + '.');
        if (!ship.military) recordCivilianHit(s, ship, 'Deck-gun fire struck the neutral ' + ship.name + '.');
        if (s.time - (ship.lastHitLog ?? -99) > 2) { ship.lastHitLog = s.time; log(s, 'Gun impact observed.', 'info'); }
      } else if (type === 'aircraft') {
        const plane = target as Aircraft;
        plane.hull = Math.max(0, plane.hull - 38 * damageScale);
        if (plane.hull <= 0) log(s, 'Aircraft hit. Going down.', 'success');
      } else hurt(slice(s), 3, 'Aircraft strafing the surfaced hull. Dive!', 'deckgun');
    } else if (r.altitude < 0) {
      const f = clamp(from.altitude / (from.altitude - r.altitude), 0, 1);
      const point = {x: from.x + (r.x - from.x) * f, y: from.y + (r.y - from.y) * f, altitude: 0};
      impact(s, r, point, 'splash'); r.age = 99;
      if (r.owner === 'player') for (const v of s.ships) if (v.kind !== 'sub' && distance(v, point) < 150) playerSignal(slice(s), slice(v), false);
    }
  }
  s.gunRounds = s.gunRounds.filter(r => r.age < 6); s.impacts = s.impacts.filter(p => s.time - p.time < 3).slice(-64);
}

function shipDamage(s: CombatWorld, dt: number) {
  for (const v of s.ships) {
    const flood = v.flood = v.flood || 0;
    v.sinkDepth = v.sinkDepth || 0;
    if (v.hull > 0 && flood > 0) {
      if (v.kind === 'carrier') advanceCarrierFlood(slice(v), dt);
      else v.hull = Math.max(0, v.hull - flood * .05 * dt);
      if (v.hull < 48 || flood > 8) { if (!v.disabled) addDebrief(s, v.name + ' was disabled by flooding.'); v.disabled = true; v.speed = 0; }
      v.sinkDepth = v.kind === 'carrier' && carrierDoomed(slice(v)) ? Math.max(v.sinkDepth, (1 - v.hull / 40) * 7) : Math.min(4, v.sinkDepth + dt * flood * .002);
    }
    if (v.hull > 0 || v.settled) continue;
    const origin = v.kind === 'sub' ? v.depth as number : 0;
    if (v.sunkAt === undefined) { v.sunkAt = s.time; addDebrief(s, v.name + ' began sinking.'); }
    // Keep the grounded hull against the same triangles the underwater camera displays.
    const clearance = v.kind === 'sub' || v.kind === 'fishing' ? 3 : 8;
    const bed = Math.max(0, -floorSurface(v.x, v.y, s.environment.chartSeed).height - clearance - origin);
    const beforeDrop = v.sinkDepth, age = s.time - v.sunkAt, sub = v.kind === 'sub';
    const rate = sub ? 1.3 : descentSpeed(age) * (v.kind === 'carrier' ? carrierDescentFactor(slice(v)) : 1);
    v.speed = 0; v.sinkDepth = Math.min(bed, v.sinkDepth + dt * rate);
    const depth = origin + v.sinkDepth, lastVisible = sub ? 0 : submergedDepth(v.kind as Parameters<typeof submergedDepth>[0]);
    if (!sub && beforeDrop < lastVisible && v.sinkDepth >= lastVisible)
      replayEvent(s, {kind: 'sinking', enemy: true, target: v.id, point: {x: v.x, y: v.y, depth}});
    if (age >= (v.nextCreak ?? 4)) {
      emitSound(s, {type: 'creak', x: v.x, y: v.y, depth, power: .65});
      v.nextCreak = age + 9 + hash01(s.patrol.seed, v.sunkAt + Math.floor(age)) * 20;
    }
    if (!v.collapsed && depth > 45 && v.sinkDepth > 18 && (sub || age >= surfaceCollapseAge && depth > lastVisible + 20 && hash01(s.patrol.seed, v.sunkAt) > .45)) {
      v.collapsed = true; v.collapsedAt = s.time;
      if (v.kind === 'sub') {
        s.impacts.push({id: s.weaponSequence++, x: v.x, y: v.y, altitude: -depth, time: s.time, kind: 'collapse'});
        replayEvent(s, {kind: 'collapse', enemy: true, target: v.id, point: {x: v.x, y: v.y, depth}});
      }
      emitSound(s, {type: 'collapse', x: v.x, y: v.y, depth, vessel: v.id, power: 1.3});
      addDebrief(s, 'Compartments aboard ' + v.name + ' collapsed during the descent.');
    }
    if (v.sinkDepth >= bed) {
      v.settled = true;
      emitSound(s, {type: 'settling', x: v.x, y: v.y, depth, vessel: v.id, power: .9});
      addDebrief(s, v.name + ' came to rest on the seabed.');
    }
  }
}

export function updateCombat(s: CombatWorld, dt: number): void {
  s.gun.cooldown = Math.max(0, s.gun.cooldown - dt);
  requestSupport(s); updateAircraft(s, dt); updateTorpedoes(s, dt); updateRounds(s, dt); shipDamage(s, dt);
}
