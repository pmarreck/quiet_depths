import {leaveClue} from './suspicion.ts';
import {gameEcho, observeTorpedo} from './torpedo-watch.ts';
import {operatingFraction} from './equipment.ts';
import {environmentAt, scopeWashed, type Environment} from './environment.ts';
import {emitSound} from './acoustics.ts';
import {framed, photoCriteria} from './recon-photos.ts';
import {clamp, rad, bearing, delta, distance, separation, rand, log} from './mechanics.ts';
import {activeVolleys, classifyEcho, fleetShotPose, isOpponent} from './fleet-action.ts';
import {TORPEDO_SPEED, launchTorpedo} from './combat.ts';
import {designation, fixContact, estimateAt, type Contact} from './track-estimates.ts';
import {observationBias} from './contact-readings.ts';
import type {LampFix} from './signal-lamp.ts';
import {slice} from './world-slice.ts';
import type {World} from './patrol-world.ts';

import type {Ship} from './patrol-world.ts';
type Sighted = {id: string; x: number; y: number; kind?: string; depth?: number; name?: string; military?: boolean; side?: 'friendly' | 'hostile'};
type Measurement = {x: number; y: number; time: number; positionSigma: number; velocitySigma: number; maneuverSigma: number; source: string; vx?: number; vy?: number};

export function isVisible(s: World, ship: Ship, look: number | null = null, env: Environment = environmentAt(s)): boolean {
  if (ship.hull <= 0 || ship.kind === 'sub' || s.depth > 15 || !s.scope) return false;
  return !scopeWashed(s, env) && distance(s, ship) < env.opticalRange * operatingFraction(s.systems.periscope) && (look === null || Math.abs(delta(bearing(s, ship), look)) < 19);
}

export function contact(s: World, ship: Sighted, method: string): Contact {
  let c = s.contacts.find(c => c.id === ship.id);
  const b = bearing(s, ship), d = distance(s, ship);
  if (!c) {
    c = {id: ship.id, label: designation(s.nextId++), bearing: b, range: 0, confidence: 0, age: 0, identified: false, method: 'passive', x: 0, y: 0};
    s.contacts.push(c);
    log(s, `New contact. ${c.label}, bearing ${Math.round(b)}.`, 'contact');
  }
  // Patrol saves share a random stream across systems. Reserve the original
  // draw for every observation so changing the display preserves seeded events.
  const observationRoll = rand(s);
  c.bearing = (b + (method === 'passive' ? 3 * observationBias(s.patrol.seed, c.id, 'passive') : 0) + 360) % 360; c.age = 0; c.method = method;
  if (s.convoy && method === 'passive') { c.passiveBearing = c.bearing; c.passiveAt = s.time; c.passiveX = s.x; c.passiveY = s.y; }
  if (method !== 'passive' && method !== 'lights') {
    const sigma = method === 'visual' ? Math.max(25, d * .045) : Math.max(15, d * .03);
    const continuedSight = method === 'visual' && c.fix?.source === 'visual';
    if (!c.fix || s.time - c.fix.time >= 5 && (continuedSight || estimateAt(c, s.time)!.major > sigma * 2.448)) {
      c.range = d * (method === 'visual' ? 1 + .06 * observationBias(s.patrol.seed, c.id, 'visual') : .97 + observationRoll * .06);
      c.x = s.x + Math.sin(rad(b)) * c.range; c.y = s.y + Math.cos(rad(b)) * c.range; c.confidence = method === 'visual' ? .9 : .75;
      const measurement: Measurement = {x: c.x, y: c.y, time: s.time, positionSigma: sigma, velocitySigma: 1.5, maneuverSigma: .03, source: method};
      if (method === 'active' && ship.kind === 'sub') {
        c.kind = 'sub'; c.depthEstimate = clamp(Math.round(((ship.depth as number) + (rand(s) - .5) * (12 + d * .012)) / 10) * 10, 0, 320);
        if (c.fix) {
          const dt = s.time - c.fix.time, dx = (c.x - c.fix.x) / dt, dy = (c.y - c.fix.y) / dt, scale = Math.max(1, Math.hypot(dx, dy) / 9);
          measurement.vx = dx / scale; measurement.vy = dy / scale; c.courseEstimated = true;
        }
      }
      fixContact(c, measurement);
    }
    if (method === 'visual') { c.identified = true; c.name = ship.name; c.kind = ship.kind; c.military = ship.military; if (ship.side) c.side = ship.side; }
    if (method === 'active' && s.mission === 'tiebreaker' && !c.identified && !c.probableSide) {
      const guess = classifyEcho(s.battle!, slice(ship), c, observationRoll);
      if (guess) c.probableSide = guess;
    }
  } else c.confidence = Math.max(.24, c.confidence);
  return c;
}

export function recordLampContact(s: World, fix: LampFix): void {
  let c = s.contacts.find(v => v.id === fix.target);
  if (!c) {
    c = {id: fix.target, label: designation(s.nextId++), identified: false, range: 0, bearing: 0, confidence: 0, age: 0, x: fix.x, y: fix.y, method: 'lamp'};
    s.contacts.push(c);
  }
  const speed = fix.speed * .514444, angle = rad(fix.course);
  if (!fixContact(c, {time: fix.time, x: fix.x, y: fix.y, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed, positionSigma: 10, velocitySigma: .4, maneuverSigma: .015, source: 'lamp'})) return;
  Object.assign(c, {x: fix.x, y: fix.y, range: distance(s, fix), bearing: bearing(s, fix), age: s.time - fix.time, confidence: .92, method: 'lamp', kind: 'sub', probableSide: 'hostile',
    depthEstimate: fix.depth, courseEstimated: true});
}

export function ping(s: World): boolean {
  if (s.pingCooldown > 0 || s.status !== 'patrol' || !operatingFraction(s.systems.sonar)) return false;
  s.pingAge = 0; s.pingCooldown = 15;
  if (s.search && !s.search.located && s.site && separation(s, s.site) < 1500 * operatingFraction(s.systems.sonar)) {
    s.search.located = true; log(s, 'Mission site echo identified. Position marked on chart.', 'success');
  }
  for (const p of s.projectiles) if (Math.hypot(distance(s, p), s.depth - p.depth) < 6000 * operatingFraction(s.systems.sonar)) observeTorpedo(s, gameEcho(s, p, s.time, TORPEDO_SPEED), true);
  for (const volley of activeVolleys(s)) {
    if (!volley.underwater) continue;
    const p = fleetShotPose(volley, s.time);
    if (separation(s, p) < 6000 * operatingFraction(s.systems.sonar)) observeTorpedo(s, gameEcho(s, slice(p), s.time, p.speed), true);
  }
  for (const ship of s.ships) if (ship.hull > 0 && distance(s, ship) < 6000 * operatingFraction(s.systems.sonar)) contact(s, ship, 'active');
  for (const ship of s.ships) {
    if (!isOpponent(ship) || ship.hull <= 0 || ship.disabled) continue;
    const chance = s.difficulty.pingDetection * clamp(1 - distance(s, ship) / 7500, 0, 1);
    if (chance > 0 && rand(s) < chance) leaveClue(s, ship, 65);
  }
  log(s, 'Active ping. Ranges resolved. Nearby hunters may have heard it.', 'warning');
  return true;
}

export function photograph(s: World, look: number): boolean {
  if (s.photoCooldown > 0) return false;
  const seen = s.ships.filter(c => !c.incidental && isVisible(s, c, look) && framed(delta(bearing(s, c), look), photoCriteria) && c.kind === 'merchant')
    .sort((a, b) => Math.abs(delta(bearing(s, a), look)) - Math.abs(delta(bearing(s, b), look))).slice(0, 1);
  if (!seen.length) { log(s, 'No merchant silhouette in the camera reticle.', 'warning'); return false; }
  for (const ship of seen) { contact(s, ship, 'visual'); if (!s.photos.includes(ship.id)) s.photos.push(ship.id); }
  s.photoCooldown = 4; log(s, `Photograph recorded. ${s.photos.length}/${s.patrol.photoGoal} merchant silhouettes.`, 'success');
  return true;
}

export function fire(s: World, id: string): boolean {
  return launchTorpedo(s, id);
}

export function decoy(s: World): boolean {
  if (s.decoys <= 0 || s.status !== 'patrol') return false;
  s.decoys--; s.alert = Math.max(0, s.alert - 35);
  s.noisemaker = {x: s.x, y: s.y, depth: s.depth, heading: s.heading, speed: 0, time: s.time};
  for (const v of s.ships) v.alert = Math.max(0, v.alert - 50);
  log(s, 'Noisemaker away. Change course and go quiet.');
  return true;
}

export function dropDepthCharge(s: World, {x, y, depth, delay = 7, kind = 'charge'}: {x: number; y: number; depth: number; delay?: number; kind?: string}) {
  const charge = {id: s.soundSequence++, x, y, depth, delay, totalDelay: delay, age: 0, exploded: false, kind};
  s.blasts.push(charge);
  emitSound(s, {type: 'splashdown', x, y, depth: 0, power: .65});
  return charge;
}
