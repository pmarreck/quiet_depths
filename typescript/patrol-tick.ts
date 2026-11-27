import {exp} from './sim-math.ts';
import {activeClue, imagerClue, leaveClue, searchClue} from './suspicion.ts';
import {recordWake} from './surface-wake.ts';
import {advanceTraffic, canAttackPlayer, playerSignal} from './cold-watch.ts';
import {recordLocalLaunch} from './mess-watch.ts';
import {updateAlliedWatch, convoyLosses, updateLamp, updateConvoyRaid, resolveConvoyCharge} from './convoy-watch.ts';
import {replayEvent} from './instant-replay.ts';
import {observeTorpedo} from './torpedo-watch.ts';
import {operatingFraction} from './equipment.ts';
import {report, hearWreck} from './patrol-reports.ts';
import {incidentalHull} from './carrier.ts';
import {resolveTraffic} from './hull-contacts.ts';
import {environmentAt, scopeWashed, hash01} from './environment.ts';
import {emitSound, launchNoise, updateAcoustics, type Sound} from './acoustics.ts';
import {sweepClutter} from './seabed-rest.ts';
import {trackingConvoy, trackingCriteria} from './convoy-tracking.ts';
import {patrolTiming} from './mission-objective.ts';
import {clamp, rad, bearing, delta, distance, separation, rand, log} from './mechanics.ts';
import {MISSIONS, objectiveComplete, updateFleetBattle} from './missions.ts';
import {isOpponent, sidesAfloat} from './fleet-action.ts';
import {hurt, updateBoat, updateDrone} from './systems.ts';
import {launchHostileTorpedo, updateCombat} from './combat.ts';
import {updateRecon} from './recon.ts';
import {applyReconPacket} from './track-estimates.ts';
import {playerReport, pursueAndAttack, reportHunterState, updateHostileTrack} from './hostile-tracks.ts';
import {advanceApproach, approachProgress} from './patrol-search.ts';
import {addDebrief} from './debrief.ts';
import {updateWatchWarnings} from './patrol-create.ts';
import {contact, dropDepthCharge, isVisible, recordLampContact} from './patrol-contacts.ts';
import type {Instrument, Profile} from './sonar-transmitters.ts';
import {slice} from './world-slice.ts';
import type {Ship, World} from './patrol-world.ts';

export interface StepInput {
  paused?: boolean; modal?: boolean; afterTick?: (s: World) => void; timeRate?: number; look?: number; observation?: string;
  imaging?: {mode: Instrument; profile: Profile}; lampInView?: string | null;
}
type Signal = Parameters<typeof advanceTraffic>[2];

export function step(s: World, dt: number, input: StepInput = {}): void {
  if (s.status !== 'patrol' || dt <= 0 || input.paused || input.modal) return;
  // Fixed substeps make time compression obey the same collision and resource rules.
  let left = Math.min(dt, 60);
  while (left > 0 && s.status === 'patrol') { const t = Math.min(.25, left); tick(s, t, input); input.afterTick?.(s); left -= t; }
}

function patrolSweep(s: World, ship: Ship, inquiry = false) {
  if (ship.disabled || !inquiry && (ship.nextSweep === undefined || s.time < ship.nextSweep)) return;
  if (!inquiry) ship.nextSweep = s.time + 28 + rand(s) * 45;
  const nearby = clamp(1 - distance(ship, s) / 4500, 0, 1);
  const heard = rand(s) < s.difficulty.pingDetection * nearby * operatingFraction(s.systems.sonar);
  const touched = rand(s) < .25 * nearby * s.difficulty.detection * sweepClutter(s.bottomed, Math.max(Math.abs(s.speed), Math.abs(s.targetSpeed)));
  if (heard) emitSound(s, {type: 'sweep', x: ship.x, y: ship.y, depth: ship.depth ?? 0, power: .85, vessel: ship.id, touched});
  if (touched) { ship.report = {...playerReport(s), reason: 'a patrol sweep'}; ship.alert = Math.max(55, ship.alert); }
}

function patrolReceipt(s: World, source: Sound) {
  const heard = source.perceived!;
  if ((source.type === 'launch' || source.type === 'splashdown') && !source.own) {
    const splash = source.type === 'splashdown', health = operatingFraction(s.systems.sonar);
    const chance = (splash ? .85 : .97) * health / (1 + (heard.distance / (splash ? 2200 : 3500)) ** 2);
    if (hash01(s.patrol.seed, 42000 + source.id) >= chance) { source.missed = true; return; }
    const direction = (Math.round(bearing(s, source) + (hash01(s.patrol.seed, 43000 + source.id) - .5) * 9) + 360) % 360;
    const what = splash ? 'Possible depth-charge splash' : 'Possible torpedo launch';
    s.soundBearings.push({x: s.x, y: s.y, bearing: direction, time: s.time, kind: source.type});
    s.soundBearings = s.soundBearings.slice(-16);
    report(s, source.type + '-' + source.id, what + ' heard · bearing ' + String(direction).padStart(3, '0') + '°');
  }
  if (source.type === 'seeker' && source.echo && operatingFraction(s.systems.sonar) && heard.distance < 6000 * operatingFraction(s.systems.sonar))
    observeTorpedo(s, source.echo as Parameters<typeof observeTorpedo>[1], false);
  if (source.ownHit) report(s, 'impact', 'Explosion heard. Possible torpedo hit.');
  if (source.type === 'sweep' && operatingFraction(s.systems.sonar) > 0) {
    // The receiver gets the bearing to the emission, without a range or identity.
    const c = contact(s, {id: source.vessel as string, x: source.x, y: source.y}, 'passive');
    if (c.lastSweep !== undefined && s.time - (c.lastSweep as number) < 120) {
      const size = 900;
      c.sweepArea = {x: (Math.floor(source.x / size) + .5) * size, y: (Math.floor(source.y / size) + .5) * size, size, time: s.time};
    }
    c.lastSweep = s.time;
    report(s, 'sweep', (source.warning ? 'Challenge ping heard · bearing ' : source.friendly ? 'Surface sweep heard · bearing ' : source.touched ? 'Search ping crossed our hull · bearing ' : 'Search ping heard · bearing ') +
      String(Math.round(c.bearing) % 360).padStart(3, '0') + '°');
  }
  if (source.type === 'collapse' || source.type === 'settling') {
    if (source.type === 'collapse') report(s, 'collapse', 'Possible implosion heard');
    else report(s, 'settling', 'Heavy breakup heard. Probable wreck.');
    if (operatingFraction(s.systems.sonar) > 0) hearWreck(s, slice(source));
  }
}

const trafficSignal = (s: World): Signal => (action, v, shot) => {
  if (action === 'arrival' || action === 'withdraw') {
    addDebrief(s, v.name + (action === 'arrival' ? ' entered the area.' : ' broke off and turned away.'));
  } else if (action === 'ping') {
    if (distance(s, v) < 5600 * operatingFraction(s.systems.sonar)) emitSound(s, {type: 'sweep', x: v.x, y: v.y, depth: v.depth ?? 0, power: .7, vessel: v.id, warning: true});
  } else if (action === 'answer') {
    const volley = shot!;
    if (volley.warning && volley.underwater) return;
    const p = volley.to, depth = Math.max(0, -p.altitude);
    if (!volley.warning) emitSound(s, {type: 'detonation', x: p.x, y: p.y, depth, power: .8});
    s.impacts.push({id: s.weaponSequence++, x: p.x, y: p.y, altitude: p.altitude, time: s.time, kind: volley.damage ? (volley.underwater ? 'torpedo' : 'hit') : 'splash'});
    if (volley.damage && volley.underwater) replayEvent(s, {kind: 'torpedo', shot: volley.id, target: volley.target, enemy: true, point: {x: p.x, y: p.y, depth}});
  } else if (shot!.underwater) {
    recordLocalLaunch(s, v); launchNoise(s, v);
  } else {
    emitSound(s, {type: 'gunfire', x: v.x, y: v.y, altitude: 4, power: .55});
  }
};

type Strike = World['lightning'][number];
// A module calls these back with the same whole patrol it was handed, though
// its own slice type names only the fields it reads itself.
const handBack = <T>(callback: (...args: never[]) => unknown) => slice<T>(callback);

function tick(s: World, dt: number, input: StepInput) {
  // Continue older saves from the wave they last displayed.
  if (s.wavePhase === undefined) s.wavePhase = s.time * environmentAt(s).waveSpeed;
  s.time += dt; s.pingAge += dt; s.pingCooldown = Math.max(0, s.pingCooldown - dt); s.photoCooldown = Math.max(0, s.photoCooldown - dt); s.shock = Math.max(0, (s.shock || 0) - dt);
  if (s.noisemaker && s.time - s.noisemaker.time > 32) delete s.noisemaker;
  const env = environmentAt(s);
  const previousApproach = s.search && approachProgress(s.search);
  const approaching = s.search && advanceApproach(s.search, dt, input.timeRate || 1);
  const formationTravel = approaching && s.battle ? 800 * (approachProgress(s.search!) - (previousApproach as number)) : 0;
  if (approaching && s.operation) s.operation.lastCasualty += dt;
  // Only the next interval uses the new weather speed. The sea keeps wall
  // time during compression while objectives and traffic keep patrol time.
  s.wavePhase += env.waveSpeed * dt / Math.max(1, input.timeRate || 1);
  env.wavePhase = s.wavePhase;
  if (s.time >= s.nextLightningAt) {
    if (env.storm > .35) {
      const angle = s.time < 30 ? rad((input.look ?? (s.heading + s.scopeAngle)) + (rand(s) - .5) * 26) : rand(s) * Math.PI * 2, range = 1800 + rand(s) * 4000;
      const strike: Strike = {id: s.soundSequence, time: s.time, x: s.x + Math.sin(angle) * range, y: s.y + Math.cos(angle) * range, height: 1050 + rand(s) * 900, seed: Math.floor(rand(s) * 1000000)};
      if (hash01(strike.seed, 910) < .09) {
        const exposed: (Ship | World)[] = s.ships.filter(v => v.hull > 0 && (v.depth ?? 0) <= 1 && distance(s, v) < 6000);
        if (s.depth <= 1) exposed.push(s);
        const hit = exposed[Math.floor(hash01(strike.seed, 911) * exposed.length)];
        if (hit) {
          strike.x = hit.x; strike.y = hit.y; strike.altitude = hit === s ? 9 : 18;
          const damage = 5 + Math.floor(12 * hash01(strike.seed, 912));
          if (hit === s) hurt(s, damage, 'Lightning struck the surfaced sub.', null);
          else { const ship = hit as Ship; ship.hull = incidentalHull(ship, damage); addDebrief(s, 'Lightning struck ' + ship.name + '.'); }
        }
      }
      s.lightning.push(strike); emitSound(s, {type: 'thunder', x: strike.x, y: strike.y, altitude: strike.height * .65, power: .8 + rand(s) * .4});
    }
    s.nextLightningAt = s.time + 18 + rand(s) * 36;
  }
  s.lightning = s.lightning.filter(e => s.time - e.time < 20);
  if (s.route) { s.targetHeading = bearing(s, s.route); if (distance(s, s.route) < (s.route.radius || 100)) { s.route = null; s.targetSpeed = 0; log(s, 'Waypoint reached. All stop.'); } }
  const diesel = updateBoat(s, dt);
  if (s.status !== 'patrol') return;
  recordWake(s, env);
  if (s.scopeSteerBearing !== null) { s.scopeAngle = (s.scopeSteerBearing - s.heading + 360) % 360; if (Math.abs(delta(s.scopeSteerBearing, s.heading)) < .1) { s.scopeAngle = 0; s.scopeSteerBearing = null; } }
  // Suppress repeated damage log spam while retaining actual damage.
  if (s.events.length > 1 && s.events[0].text === s.events[1].text) s.events.splice(1, 1);
  if (s.hull <= 0) s.status = 'lost';
  const scan = input.imaging;
  const scribbler = s.imagers.scribbler ?? (scan?.mode === 'scribbler' ? scan.profile : null);
  const painter = s.imagers.painter ?? (scan?.mode === 'painter' ? scan.profile : null);
  let beat = 0;
  if ((scribbler || painter) && operatingFraction(s.systems.sonar) > 0) {
    const previous = s.imagingTime ?? 0;
    s.imagingTime = previous + dt;
    if (Math.floor(s.imagingTime / 5) > Math.floor(previous / 5)) beat = Math.floor(s.imagingTime / 5);
  }
  let danger = 0;
  const newTriad = Math.floor(s.time / 3) !== Math.floor((s.time - dt) / 3);
  for (const ship of s.ships) {
    if (ship.hull <= 0) continue;
    const d = distance(s, ship);
    if (operatingFraction(s.systems.sonar) > 0 && (s.silent || s.speed < 9) && d < (ship.kind === 'fishing' ? 2300 : 5600) * (1 - env.storm * .25 * exp(-s.depth / 80)) * operatingFraction(s.systems.sonar) &&
      newTriad) contact(s, ship, 'passive');
    const topside = ['tower', 'gun'].includes(input.observation as string) && s.depth <= 1;
    const look = input.look ?? ((s.heading + s.scopeAngle) % 360);
    if (topside ? ship.kind !== 'sub' && d < env.opticalRange && Math.abs(delta(bearing(s, ship), look)) < 25 : isVisible(s, ship, look, env)) contact(s, ship, 'visual');
    else if (env.fog > .16 && ship.kind !== 'sub' && ship.lights !== false && !ship.blackout && d < env.lightRange &&
      (topside || input.observation === 'scope' && s.scope && s.depth <= 15 && operatingFraction(s.systems.periscope) > 0 && !scopeWashed(s, env)) &&
      Math.abs(delta(bearing(s, ship), look)) < 19 && newTriad) contact(s, ship, 'lights');
    if (approaching && !s.battle && !ship.incidental && !ship.report) ship.heading = (ship.heading + dt * .36) % 360;
    if (s.mission === 'sneaky-seamen') patrolSweep(s, ship);
    if (isOpponent(ship) && !ship.disabled) {
      if (beat) {
        if (scribbler) imagerClue(s, ship, 'scribbler', scribbler, beat);
        if (painter) imagerClue(s, ship, 'painter', painter, beat);
      }
      const track = updateHostileTrack(s, ship, env, dt);
      if (!track && ship.report && ship.alert >= 12 && s.time - ship.report.time < 2 && ship.report.time > (ship.clue?.time ?? -1)) leaveClue(s, ship, 0, ship.report);
      const clue = activeClue(s, ship);
      if (track || clue || ship.report && s.time - ship.report.time < 2) danger = Math.max(danger, ship.alert);
      if (ship.kind === 'escort' || ship.kind === 'sub') {
        reportHunterState(s, ship, track);
        if (!track && clue && searchClue(s, ship, dt, clue)) patrolSweep(s, ship, true);
        if (track && !ship.incidental && !ship.parley && ship.alert >= 80) playerSignal(s, ship, true, ship.report);
        if (track && canAttackPlayer(s, ship)) pursueAndAttack(s, ship, track, dt, handBack(dropDepthCharge), handBack(launchHostileTorpedo));
      }
    }
    if (ship.disabled) ship.speed = 0;
    const travel = approaching && s.battle && !ship.incidental && !ship.report && !ship.disabled ? formationTravel : ship.speed * .514444 * dt;
    ship.x += Math.sin(rad(ship.heading)) * travel; ship.y += Math.cos(rad(ship.heading)) * travel;
  }
  advanceTraffic(s, Boolean(env.holiday), trafficSignal(s));
  if (s.mission === 'tiebreaker' && !approaching) updateFleetBattle(s);
  if (s.convoy) { updateConvoyRaid(s, dt, Boolean(approaching), handBack(dropDepthCharge)); updateLamp(s, env, s.alliedLamp?.message ? {...input, lampInView: null} : input, dt); }
  updateAlliedWatch(s, env, input, dt, handBack(recordLampContact));
  if (s.search && !s.search.located) {
    if (s.site) {
      const surfaceSight = s.site.kind === 'surface' && ['scope', 'tower', 'gun'].includes(input.observation as string) &&
        (input.observation === 'scope' ? s.scope && s.depth <= 15 && !scopeWashed(s, env) : s.depth <= 1) &&
        distance(s, s.site) < env.opticalRange && Math.abs(delta(bearing(s, s.site), input.look ?? s.heading)) < 19;
      const close = separation(s, s.site) < 120 || s.drone.mode === 'remote' && separation(s.drone, s.site) < 80;
      if (surfaceSight || close) { s.search.located = true; log(s, 'Mission site located. Position marked on chart.', 'success'); }
    } else {
      for (const c of s.contacts) if ((c.identified || c.kind === 'sub' && c.fix) && s.search.targets.includes(c.id) && !s.search.recognized.includes(c.id)) s.search.recognized.push(c.id);
      if (s.search.recognized.length === s.search.targets.length) { s.search.located = true; log(s, 'Search contacts accounted for. Chart now shows their individual tracks.'); }
    }
  }
  resolveTraffic(s, handBack(hurt));
  s.alert = clamp(danger, 0, 100);
  for (const c of s.contacts) { c.age += dt; c.confidence = Math.max(.05, c.confidence - dt * .0006); }
  s.contacts = s.contacts.filter(c => c.age < 240 || c.fix?.source === 'satellite' && s.time - c.fix.time < 900);
  const packet = updateRecon(s, dt);
  if (packet && applyReconPacket(s, packet)) log(s, `Orbital reconnaissance received. ${packet.tracks.length} timestamped surface tracks.`, 'success');
  updateCombat(s, dt);
  for (const b of s.blasts) {
    b.delay -= dt;
    if (b.kind === 'bomb' && !b.splashed && b.totalDelay - b.delay >= (b.airTime as number)) { b.splashed = true; emitSound(s, {type: 'splashdown', x: b.x, y: b.y, depth: 0, power: .65}); }
    if (b.delay <= 0 && !b.exploded) {
      b.exploded = true; b.explodedAt = s.time;
      if (s.convoy && b.convoyCharge) resolveConvoyCharge(s, b);
      emitSound(s, {type: 'blast', x: b.x, y: b.y, depth: b.depth, power: 1.2});
    }
    if (b.exploded) b.age = s.time - (b.explodedAt as number);
  }
  s.blasts = s.blasts.filter(b => b.age < 5);
  for (const shell of s.shells) {
    shell.delay -= dt;
    if (shell.delay <= 0 && !shell.hit) {
      shell.hit = true; emitSound(s, {type: 'detonation', x: shell.x, y: shell.y, depth: 0, power: .8});
      const range = distance(s, shell), hit = s.depth < 7 && range < 65;
      if (hit) hurt(s, Math.max(4, 24 * (1 - range / 65)), 'Shell impact near the hull.', 'engine');
      addDebrief(s, hit ? 'An escort shell struck close enough to damage the hull.' : s.depth >= 7 ? 'You were below the surface shell’s damage zone when it arrived.' : 'An escort shell splashed wide of your sub.');
    }
  }
  s.shells = s.shells.filter(p => p.delay > -3);
  updateAcoustics(s, (source, d) => {
    if (d < 210) {
      replayEvent(s, {kind: 'blast', point: {x: source.x, y: source.y, depth: source.depth as number}});
      hurt(s, Math.max(3, 36 * (1 - d / 210)), 'Depth charge shock. Damage control responding.', null, source as Sound & {depth: number});
      addDebrief(s, 'An underwater explosion was close enough to damage your sub.');
    } else if (d < 2500) { log(s, 'Depth charge detonation. That pattern missed.'); addDebrief(s, 'The sub was outside the depth-charge damage zone when it detonated.'); }
  }, source => patrolReceipt(s, source));
  s.torpedoTracks = s.torpedoTracks.filter(t => s.time - t.time < 35);
  updateDrone(s, dt, diesel);
  updateWatchWarnings(s);
  if (input.observation) {
    const rov = input.observation === 'drone', eye = rov ? s.drone : s;
    const optical = rov ? s.drone.mode === 'remote' && operatingFraction(s.drone.camera) > 0
      : input.observation === 'scope' ? s.scope && s.depth <= 15 && operatingFraction(s.systems.periscope) > 0 && !scopeWashed(s, env) : s.depth <= 1;
    if (optical) for (const v of s.ships) {
      if (rov && (s.convoy || s.mission === 'tiebreaker' || v.incidental) && v.hull > 0 && Math.hypot(distance(eye, v), eye.depth - (v.depth || 0)) < 70 * operatingFraction(s.drone.camera) &&
        Math.abs(delta(bearing(eye, v), input.look ?? eye.heading)) < 25) contact(s, v, 'visual');
      if (v.hull > 0 || v.wreckMark?.observed) continue;
      const depth = (v.kind === 'sub' ? v.depth as number : 0) + (v.sinkDepth || 0);
      if ((rov ? Math.hypot(distance(eye, v), eye.depth - depth) < 70 * operatingFraction(s.drone.camera)
        : depth < 5 && distance(s, v) < Math.min(1200, env.opticalRange) * (input.observation === 'scope' ? operatingFraction(s.systems.periscope) : 1)) &&
        Math.abs(delta(bearing(eye, v), input.look ?? eye.heading)) < 25) {
        v.wreckMark = {x: v.x, y: v.y, observed: true}; report(s, 'wreck', 'Wreck sighted. Position marked on chart.');
      }
    }
  }
  if (s.mission === 'shadow' && trackingConvoy(s, trackingCriteria)) s.trackTime += dt;
  const done = objectiveComplete(s, dt);
  if (s.convoy && s.status === 'patrol') {
    const limit = (MISSIONS.find(m => m.id === s.mission)!.objective as {lossLimit: number}).lossLimit;
    if (convoyLosses(s) >= limit) { s.status = 'convoy-lost'; addDebrief(s, 'Two more convoy vessels were lost after Plover.'); }
    else if (done) { s.status = 'won'; addDebrief(s, 'The hunter sank. The surviving convoy is clear.'); }
  }
  if (s.mission === 'sneaky-seamen' && done && s.status === 'patrol') { s.status = 'won'; log(s, 'Gate B reached. Patrol corridor cleared.', 'success'); }
  if (s.status === 'patrol' && done && s.phase === 'objective') {
    s.phase = 'extract';
    if (s.mission === 'tiebreaker') {
      log(s, 'Command confirms a two-vessel lead. Extraction open. Stay to assist or surface at pickup.', 'success');
      addDebrief(s, 'The friendly fleet earned its two-vessel lead. Extraction opened.');
    } else if (!['intercept', 'seek-and-destroy', 'big-kahuna'].includes(s.mission)) log(s, 'Objective complete. Return to extraction and surface for pickup.', 'success');
  }
  if (s.status === 'patrol' && s.phase === 'extract' && distance(s, s.home) < 400 && s.depth <= 1) { s.status = 'won'; log(s, 'Patrol complete. Surfaced at pickup. Sub and crew home safely.', 'success'); }
  if (s.mission === 'tiebreaker' && s.phase === 'objective' && s.status === 'patrol' && sidesAfloat(s.ships).friendly < 2) {
    s.status = 'expired'; addDebrief(s, 'Too few friendly vessels remained to establish the lead. Command recalled the patrol.');
  }
  const patrolWindow = s.search ? patrolTiming.longerWindow + s.search.protectedTime : patrolTiming.standardWindow;
  if (s.time > patrolWindow && s.status === 'patrol' && !(s.mission === 'tiebreaker' && s.phase === 'extract')) { s.status = 'expired'; log(s, 'Patrol window closed. Command orders withdrawal.', 'warning'); }
}
