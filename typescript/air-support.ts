import {scopeExtension} from './periscope.ts';
import {canAttackPlayer} from './cold-watch.ts';
import {isOpponent} from './fleet-action.ts';
import {carrierId, carrierSize} from './carrier.ts';
import {clamp, rad, bearing, delta, distance, log, bottom} from './mechanics.ts';
import {hash01, environmentAt} from './environment.ts';
import {emitSound} from './acoustics.ts';
import {playerReport, projectedReport, scatterAim, searchDuration, type Report} from './hostile-tracks.ts';
import {addDebrief} from './debrief.ts';
import {wrap} from './combat-geometry.ts';
import {slice} from './world-slice.ts';
import type {Aircraft, CombatWorld, Ship} from './combat-types.ts';

// A strike raises the alarm at the impact site. No shooter position is known.
export function raiseCarrierAlarm(s: CombatWorld, carrier: Ship): void {
  const alarm = {x: carrier.x, y: carrier.y, depth: 0, heading: 0, speed: 0, time: s.time, reason: 'an explosion near the carrier'};
  if (s.airSupport.status === 'idle' && s.difficulty.airSupport) prepareSortie(s, carrier, alarm);
  for (const escort of s.ships) if (escort.kind === 'escort' && escort.hull > 0) {
    escort.alert = Math.max(60, escort.alert);
  }
}

function prepareSortie(s: CombatWorld, carrier: Ship | null | undefined, report: Report) {
  const support = s.airSupport;
  support.lastKnown = {...report}; support.status = 'arming'; support.requestedAt = s.time;
  support.launchAt = s.time + (carrier ? 2 : 45 + Math.floor(hash01(s.patrol.seed, 591) * 15));
  log(s, carrier ? 'Intercepted flight-deck alarm. Fighters scrambling.' : 'Intercepted radio traffic. Island aircraft are preparing to launch.', 'warning');
}

export function requestSupport(s: CombatWorld): void {
  if (s.difficulty?.airSupport === false) return;
  const support = s.airSupport, carrier = s.mission === 'big-kahuna' ? s.ships.find(v => v.id === carrierId) : null;
  const deckOpen = carrier && carrier.hull > 0;
  if (carrier) support.base = deckOpen ? {x: carrier.x, y: carrier.y} : {x: -3200, y: 3400};
  if (support.status === 'spent') return;
  if (carrier && !deckOpen && support.status !== 'airborne') { support.status = 'spent'; return; }
  for (const v of s.ships) {
    if (!isOpponent(v) || v.hull <= 0 || v.alert <= 55) continue;
    const report = v.report;
    if (!canAttackPlayer(slice(s), slice(v)) || !report || report.reason === 'noisemaker' || s.time - report.time > 4 || report.time < (support.lastKnown?.time ?? 0)) continue;
    if (support.status === 'idle') prepareSortie(s, carrier, report);
    else support.lastKnown = {...report};
  }
  if (support.status !== 'arming' || s.time < (support.launchAt as number)) return;
  support.status = 'airborne';
  const count = carrier ? carrier.fighterCount as number : 2;
  for (let i = 0; i < count; i++) {
    const heading = carrier?.heading ?? 45, along = carrier ? 25 - i * 18 : 0;
    const x = carrier ? carrier.x + Math.sin(rad(heading)) * along : support.base.x - i * 20;
    const y = carrier ? carrier.y + Math.cos(rad(heading)) * along : support.base.y;
    s.aircraft.push({id: 'air-' + s.weaponSequence++, name: (carrier ? 'Carrier fighter ' : 'Island attack aircraft ') + (i + 1), x, y,
      altitude: carrier ? carrierSize.deckHeight + 2 : Math.max(8, -bottom(support.base.x, support.base.y, s.environment.chartSeed) + 8 + i * 12),
      heading, speed: 70, hull: 100, phase: 'takeoff', takeoffUntil: s.time + (carrier ? 2 : 6), attack: 0, bank: 0, bombDropped: false});
  }
  log(s, carrier ? 'Flight-deck transmission. ' + (count === 1 ? 'One fighter is' : count + ' fighters are') + ' airborne.' : 'Aircraft airborne from Greybank. They still have to reach the patrol area.', 'warning');
}

function dropBomb(s: CombatWorld, plane: Aircraft, report: Report) {
  if (report.reason === 'an explosion near the carrier') return;
  const depth = clamp((report.depth || 40), 15, 90), airTime = 2 + plane.altitude / 70, delay = airTime + depth / 6;
  const aim = projectedReport(report, s.time, delay), point = scatterAim(s, aim, 45 + aim.age * .9);
  s.blasts.push({id: s.soundSequence++, ...point, depth, delay, totalDelay: delay, airTime, airHeight: plane.altitude, age: 0, exploded: false, kind: 'bomb'});
  plane.bombDropped = true; addDebrief(s, 'An aircraft dropped its charge over the last reported position.');
}

const ahead = (p: Aircraft) => ({x: p.x + Math.sin(rad(p.heading)) * 1000, y: p.y + Math.cos(rad(p.heading)) * 1000});

export function updateAircraft(s: CombatWorld, dt: number): void {
  const support = s.airSupport, e = environmentAt(s);
  for (const p of s.aircraft) {
    p.previous = {x: p.x, y: p.y, altitude: p.altitude}; p.attack = Math.max(0, (p.attack || 0) - dt);
    if (p.hull <= 0) { p.phase = 'down'; p.altitude -= dt * 45; p.bank = (p.bank || 0) + dt * 1.3; if (p.altitude < -10) p.phase = 'gone'; continue; }
    if (p.phase === 'return') {
      const home = support.base, remaining = distance(p, home), travel = p.speed * dt;
      if (remaining <= Math.max(10, travel)) { p.phase = 'gone'; continue; }
      p.heading = bearing(p, home); p.bank = 0;
      p.x += (home.x - p.x) * travel / remaining; p.y += (home.y - p.y) * travel / remaining;
      continue;
    }
    let report = support.lastKnown;
    if (report) {
      const d = distance(p, s), sensitivity = s.difficulty?.detection ?? 1;
      const visible = s.depth <= 2 && d < Math.min(2600, e.subVisualRange) * sensitivity || s.depth <= 15 && s.systems.periscope > 0 && d < 400 * sensitivity * scopeExtension(s);
      if (visible) { support.lastKnown = playerReport(slice(s)); report = support.lastKnown; }
      const target = projectedReport(report, s.time), r = distance(p, target);
      if (p.phase === 'takeoff' && s.time >= p.takeoffUntil) p.phase = 'approach';
      if (p.phase === 'approach' && r < 1300) p.phase = 'search';
      if (visible && r < 1800 && p.phase !== 'egress' && (s.mission !== 'big-kahuna' || p.phase !== 'takeoff')) p.phase = 'attack';
      let destination: {x: number; y: number} = target;
      if (p.phase === 'takeoff') destination = ahead(p);
      if (p.phase === 'search' && !visible) { const a = s.time * .06; destination = {x: target.x + Math.sin(a) * 650, y: target.y + Math.cos(a) * 650}; }
      if (p.phase === 'egress') { p.egress = (p.egress || 0) - dt; destination = ahead(p); if (p.egress <= 0) p.phase = 'search'; }
      const turn = clamp(delta(bearing(p, destination), p.heading), -dt * 22, dt * 22);
      p.heading = wrap(p.heading + turn); p.bank = turn === 0 ? 0 : clamp(-turn / Math.max(dt, .001) * .02, -.5, .5);
      const desiredAltitude = p.phase === 'attack' ? 65 : 180;
      p.altitude += clamp(desiredAltitude - p.altitude, -dt * 10, dt * 5);
      if (p.phase === 'attack' && r < 900 && p.attack <= 0) {
        if (visible && s.depth <= 2) {
          p.attack = .45;
          const from = {x: p.x, y: p.y, altitude: p.altitude}, to = {...scatterAim(s, projectedReport(report, s.time, r / 500), 8 + r * .045), altitude: 2};
          const n = Math.hypot(to.x - from.x, to.y - from.y, to.altitude - from.altitude);
          s.gunRounds.push({id: s.weaponSequence++, owner: 'aircraft', ...from, vx: (to.x - from.x) / n * 500, vy: (to.y - from.y) / n * 500, vz: (to.altitude - from.altitude) / n * 500, age: 0, tracer: true});
          emitSound(s, {type: 'gunfire', x: p.x, y: p.y, altitude: p.altitude, power: .5});
        }
        if (r < 450 && !p.bombDropped) dropBomb(s, p, report);
      }
      if ((p.phase === 'attack' || p.phase === 'search') && r < 180) { if (!p.bombDropped) dropBomb(s, p, report); p.phase = 'egress'; p.egress = 10; }
      // A lost visual contact does not grant clairvoyance: bombs follow the report.
      if (!visible && r < 450 && !p.bombDropped) dropBomb(s, p, report);
    }
    p.x += Math.sin(rad(p.heading)) * p.speed * dt; p.y += Math.cos(rad(p.heading)) * p.speed * dt;
  }
  s.aircraft = s.aircraft.filter(p => p.phase !== 'gone');
  if (support.status !== 'airborne') return;
  const flying = s.aircraft.filter(p => p.hull > 0);
  if (!flying.length) { support.status = 'spent'; return; }
  const lastReport = Math.max(support.launchAt ?? 0, support.lastKnown?.time ?? 0);
  if (s.time - lastReport > searchDuration(s)) {
    support.status = 'spent';
    for (const plane of flying) plane.phase = 'return';
    log(s, 'Intercepted radio traffic. Air search called off.');
  }
}
