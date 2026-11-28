import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, restore} from '../src/sim.js';
import {missions} from '../typescript/mission-catalog.ts';
import {designation} from '../src/track-estimates.js';
import {elm, sameResults} from './sim-harness.mjs';

// Saved patrols from every mission, sampled as they run.
let patrols;
function savedPatrols() {
  if (patrols) return structuredClone(patrols);
  const states = [];
  for (const m of missions) for (const seed of [7919, 15838]) {
    const s = createGame(m.id, seed, {longPatrol: seed === 15838});
    for (let t = 1; t <= 1200; t++) {
      if (t % 300 === 1) { s.targetSpeed = [4, 12, 2, 8][(t / 300) | 0]; s.targetDepth = [12, 60, 120, 30][(t / 300) | 0]; s.scope = s.targetDepth <= 15; }
      step(s, .25, {timeRate: 1, observation: s.scope ? 'scope' : undefined});
      if (t % 150 === 0) states.push(JSON.parse(save(s)));
    }
  }
  patrols = states;
  return structuredClone(states);
}
// Absent and null tracking mean the same; the Elm record keeps one of them.
const normalized = v => { const c = structuredClone(v); if (c.tracking === null) delete c.tracking; return c; };

// A ship carrying every one of the 47 fields of patrol-world.ts's Ship.
const everything = (base, now) => ({...base, military: true, side: 'hostile', depth: 40, sinkDepth: 3, flood: 2, disabled: false, playerDamaged: true, neutralHitAt: 12,
  wreckMark: {x: 1, y: 2, observed: false}, lampFix: {text: 'E1 N2 D3 C4 K5', x: 10, y: 20, time: 5, radius: 10, sender: 'a', number: 1, target: 'b', depth: 3, course: 4, speed: 5},
  nextSweep: 30, incidental: true, roll: .1, verticalSpeed: -.5, fixedWreck: false, groundedAt: 40, clue: {x: 600, y: 900, time: now}, nextInquiry: 50,
  report: {x: 1, y: 2, depth: 30, heading: 90, speed: 4, time: now, reason: 'raised periscope'}, tracking: 'decoy', patrolSpeed: 6, lastAttackAt: 20,
  parley: {against: 'player', level: 2, order: 'warn', range: 900, next: 30, cruise: 7, origin: {x: 5, y: 6, time: 7}}, lights: true, blackout: false, pitch: .02, noise: 80,
  torpedoDecoys: 2, lastTubeSide: -1, lastHitLog: 33, directHits: 1, settled: true, sunkAt: 60, nextCreak: 70, collapsed: true, collapsedAt: 80, fighterCount: 2});

test('saved ships from every mission round-trip through the Elm ship record unchanged', async () => {
  const calls = [];
  for (const state of savedPatrols()) for (const v of state.ships) calls.push([v, state.time]);
  assert.ok(calls.length > 500 && new Set(calls.map(([v]) => v.kind)).size === 5, 'ships of every kind');
  const full = everything(calls.find(([v]) => v.kind === 'escort')[0], 100);
  assert.equal(Object.keys(full).length, 47, 'the fixture carries every field');
  calls.push([full, 100]);
  sameResults(await elm('ship.roundTrip', calls), calls.map(([v]) => normalized(v)));
});

test('the Elm ship decoder rejects exactly what restore rejects, wrong types included', async () => {
  const bases = savedPatrols().filter((s, i) => i % 7 === 3 && s.ships.length && restore(JSON.stringify(s)) !== null).slice(0, 8);
  assert.ok(bases.length >= 6, 'restorable patrols with ships');
  const rejected = [v => { v.id = 5; }, v => { delete v.name; }, v => { v.kind = 'raft'; }, v => { v.x = null; }, v => { v.x = NaN; }, v => { v.sinkDepth = Infinity; }, v => { v.heading = '90'; }, v => { delete v.hull; },
    v => { v.alert = 'high'; }, v => { delete v.alert; }, v => { v.sinkDepth = -1; }, v => { v.sunkAt = -0.5; }, v => { v.nextCreak = null; }, v => { v.collapsedAt = -2; }, v => { v.nextSweep = 'soon'; },
    v => { v.neutralHitAt = -1; }, (v, now) => { v.clue = {x: 1, y: 1, time: now + 1}; }, v => { v.clue = {x: null, y: 1, time: 1}; }, v => { v.clue = {x: 1, y: 1, time: -1}; },
    v => { v.nextInquiry = -1; }, v => { v.wreckMark = {x: 1, y: 2, observed: 'no'}; }, v => { v.wreckMark = {x: 1, y: null, observed: true}; },
    (v, now) => { v.report = {x: 1, y: 2, depth: 3, heading: 4, speed: 5, time: now + 5}; }, v => { v.report = {x: 1, y: 2, depth: 3, speed: 5, time: 1}; }, v => { v.report = null; },
    v => { v.torpedoDecoys = 1.5; }, v => { v.torpedoDecoys = 3; }, v => { v.torpedoDecoys = -1; }];
  const accepted = [v => { v.sinkDepth = 0; }, v => { v.torpedoDecoys = 2; }, (v, now) => { v.clue = {x: 1, y: 1, time: now}; }, v => { v.nextInquiry = 0; },
    v => { v.tracking = null; }, v => { delete v.patrolSpeed; }, (v, now) => { v.report = {x: 1, y: 2, depth: 3, heading: 4, speed: 5, time: now, reason: 'a patrol sweep'}; },
    v => { v.wreckMark = {x: 1, y: 2, observed: true}; }, v => { delete v.sinkDepth; }];
  // Restore once kept these wrong types, which the Elm decoder always rejected.
  rejected.push(v => { v.lights = 'yes'; }, v => { v.roll = 'level'; }, v => { v.clue = null; });
  const cases = [];
  for (const [verdict, mutations] of [['rejected', rejected], ['accepted', accepted]])
    for (const base of bases) for (const index of [0, base.ships.length - 1]) for (const mutate of mutations) {
      const state = structuredClone(base); mutate(state.ships[index], state.time);
      cases.push({verdict, ship: state.ships[index], now: state.time, restores: restore(JSON.stringify(state)) !== null});
    }
  const decoded = (await elm('ship.roundTrip', cases.map(c => [c.ship, c.now]))).map(r => r !== null);
  const disagreements = cases.filter((c, i) => decoded[i] !== c.restores);
  assert.deepEqual(disagreements.map(c => ({verdict: c.verdict, ship: c.ship.id})), []);
  assert.ok(cases.every((c, i) => c.verdict !== 'rejected' || !c.restores) && cases.every((c, i) => c.verdict !== 'accepted' || c.restores), 'each mutation does what it claims');
});

// A contact carrying all 24 fields saves can hold.
const everyContactField = (base, now) => ({...base, identified: true, name: 'Kestrel', side: 'hostile', probableSide: 'hostile', kind: 'escort', military: true, method: 'satellite',
  fix: {x: 1, y: 2, time: now, vx: 3, vy: 4, positionSigma: 5, velocitySigma: .25, maneuverSigma: .008, source: 'satellite'}, lastSweep: now, sweepArea: {x: 1, y: 2, size: 900, time: now},
  passiveAt: now, passiveBearing: 45, passiveX: 7, passiveY: 8, depthEstimate: 60, courseEstimated: true});
const withoutNullFixNumbers = c => { const d = structuredClone(c); if (d.fix) for (const k of ['vx', 'vy', 'positionSigma', 'velocitySigma', 'maneuverSigma']) if (d.fix[k] === null) delete d.fix[k]; return d; };

test('saved contacts round-trip through the Elm contact record, with old labels migrated as restore does', async () => {
  const calls = [];
  for (const state of savedPatrols()) for (const c of state.contacts) calls.push([c, state.time]);
  assert.ok(calls.length > 500, 'hundreds of contacts');
  assert.deepEqual([...new Set(calls.map(([c]) => c.method))].sort(), ['passive', 'visual'], 'seen and heard contacts');
  assert.ok(calls.some(([c]) => c.fix) && calls.some(([c]) => c.passiveAt !== undefined) && calls.some(([c]) => c.sweepArea), 'fixes, passive bearings and sweeps');
  const base = calls[0][0], full = everyContactField(base, 100);
  assert.equal(Object.keys(full).length, 24, 'the fixture carries every field');
  calls.push([full, 100], [{...base, fix: {x: 1, y: 2, time: 3}}, 100], [{...base, fix: {x: 1, y: 2, time: 3, vx: null, vy: 2, positionSigma: null}}, 100]);
  const expected = calls.map(([c]) => withoutNullFixNumbers(c));
  for (const label of ['Sierra 1', 'Sierra 12', 'Sierra 007', 'Sierra 9007199254740991', 'Sierra', 'Sierra 1x', 'Sierra  3', 'sierra 4']) {
    calls.push([{...base, label}, 100]);
    const m = /^Sierra (\d+)$/.exec(label);
    expected.push({...base, label: m ? designation(Number(m[1])) : label});
  }
  sameResults(await elm('contact.roundTrip', calls), expected);
  const indices = [...Array.from({length: 3000}, (_, i) => i + 1), 2 ** 31 - 1, 2 ** 31, 5e9, 2 ** 53 - 1];
  sameResults(await elm('trackEstimates.designation', indices.map(i => [i])), indices.map(designation));
});

test('the Elm contact decoder rejects exactly what restore rejects, wrong types included', async () => {
  const bases = savedPatrols().filter(s => s.contacts.length && restore(JSON.stringify(s)) !== null).filter((s, i) => i % 5 === 2).slice(0, 10);
  assert.ok(bases.length >= 8, 'restorable patrols with contacts');
  const rejected = [c => { c.id = 5; }, c => { delete c.label; }, c => { c.label = 7; }, c => { c.x = null; }, c => { c.x = NaN; }, c => { c.bearing = '1'; }, c => { delete c.age; },
    c => { c.depthEstimate = null; }, c => { c.depthEstimate = 'deep'; }, c => { c.courseEstimated = 'yes'; },
    (c, now) => { Object.assign(c, {passiveAt: now + 1, passiveBearing: 1, passiveX: 1, passiveY: 1}); }, c => { Object.assign(c, {passiveAt: -1, passiveBearing: 1, passiveX: 1, passiveY: 1}); },
    c => { Object.assign(c, {passiveAt: 0, passiveX: 1, passiveY: 1}); delete c.passiveBearing; }, (c, now) => { c.lastSweep = now + 1; }, c => { c.lastSweep = -1; },
    (c, now) => { c.sweepArea = {x: 1, y: 2, size: 800, time: now}; }, (c, now) => { c.sweepArea = {x: 1, y: 2, size: 900, time: now + 1}; }, (c, now) => { c.sweepArea = {x: null, y: 2, size: 900, time: now}; },
    c => { c.fix = {x: 1, y: 2, time: -1}; }, c => { c.fix = {x: null, y: 2, time: 1}; }, c => { c.fix = {x: 1, y: 2, time: 1, positionSigma: -1}; }, c => { c.fix = {x: 1, y: 2, time: 1, vx: 'fast'}; },
    c => { c.label = 'Sierra 0'; }, c => { c.label = 'Sierra 99999999999999999999'; }];
  const accepted = [c => { c.label = 'Sierra 12'; }, c => { c.fix = {x: 1, y: 2, time: 3}; }, c => { c.fix = {x: 1, y: 2, time: 3, vx: null}; }, c => { c.depthEstimate = 40; }, c => { c.courseEstimated = true; },
    (c, now) => { Object.assign(c, {passiveAt: now, passiveBearing: 1, passiveX: 1, passiveY: 1}); }, (c, now) => { c.lastSweep = now; }, (c, now) => { c.sweepArea = {x: 1, y: 2, size: 900, time: now}; },
    c => { delete c.name; }];
  // Restore once kept these wrong types, which the Elm decoder always rejected.
  rejected.push(c => { c.identified = 'yes'; }, c => { c.method = 'sonar'; }, c => { c.kind = 'raft'; });
  const cases = [];
  for (const [verdict, mutations] of [['rejected', rejected], ['accepted', accepted]])
    for (const base of bases) for (const index of [0, base.contacts.length - 1]) for (const mutate of mutations) {
      const state = structuredClone(base); mutate(state.contacts[index], state.time);
      cases.push({verdict, contact: state.contacts[index], now: state.time, restores: restore(JSON.stringify(state)) !== null});
    }
  const decoded = (await elm('contact.roundTrip', cases.map(c => [c.contact, c.now]))).map(r => r !== null);
  assert.deepEqual(cases.filter((c, i) => decoded[i] !== c.restores).map(c => ({verdict: c.verdict, label: c.contact.label})), []);
  assert.ok(cases.every(c => c.verdict !== 'rejected' || !c.restores) && cases.every(c => c.verdict !== 'accepted' || c.restores), 'each mutation does what it claims');
});

// A sound carrying every field saves hold, an echoing seeker's.
const everySoundField = (base, now) => ({...base, type: 'seeker', time: now, depth: 40, altitude: 0, heardAt: now, perceived: {distance: 900, delay: .6, pan: -.2, gain: .4, cutoff: 1800},
  vessel: 'v0', friendly: false, own: true, touched: true, missed: false, warning: true, ownHit: false, droneHit: true,
  echo: {id: 3, x: 1, y: 2, depth: 40, speed: 30, time: now, inboundRun: true}});

test('saved sounds round-trip through the Elm sound record', async () => {
  const calls = [];
  for (const state of savedPatrols()) for (const a of state.acoustics ?? []) calls.push([a, state.ships.map(v => v.id)]);
  assert.ok(calls.length > 300 && new Set(calls.map(([a]) => a.type)).size >= 5, 'sounds of several types');
  const full = everySoundField(calls[0][0], 50);
  assert.equal(Object.keys(full).length, 20, 'the fixture carries every field');
  calls.push([full, ['v0']]);
  sameResults(await elm('sound.roundTrip', calls), calls.map(([a]) => a));
});

test('the Elm sound decoder rejects what restore rejects', async () => {
  const bases = savedPatrols().filter(s => (s.acoustics ?? []).length && s.ships.length && restore(JSON.stringify(s)) !== null).filter((s, i) => i % 5 === 1).slice(0, 10);
  assert.ok(bases.length >= 8, 'restorable patrols with sounds');
  const echo = (time, extra = {}) => ({id: 3, x: 1, y: 2, depth: 40, speed: 30, time, inboundRun: true, ...extra});
  const rejected = [a => { a.id = 'one'; }, a => { delete a.time; }, a => { a.x = null; }, a => { a.x = NaN; }, a => { a.power = 'loud'; }, a => { delete a.power; }, a => { a.type = 'whale'; },
    a => { a.heard = 'yes'; }, a => { delete a.heard; }, a => { a.type = 'sweep'; delete a.vessel; }, a => { a.type = 'collapse'; a.vessel = 'nobody'; },
    a => { a.type = 'blast'; a.echo = echo(a.time); }, a => { a.type = 'seeker'; a.echo = echo(a.time + 1); }, a => { a.type = 'seeker'; a.echo = echo(a.time, {id: 0}); },
    a => { a.type = 'seeker'; a.echo = echo(a.time, {depth: -1}); }, a => { a.type = 'seeker'; a.echo = echo(a.time, {speed: -1}); }, a => { a.type = 'seeker'; a.echo = echo(a.time, {inboundRun: 1}); },
    a => { a.type = 'seeker'; a.echo = echo(a.time, {id: 1.5}); }, a => { a.ownHit = 'no'; }];
  const accepted = [(a, ships) => { a.type = 'sweep'; a.vessel = ships[0]; delete a.echo; }, a => { a.type = 'seeker'; a.echo = echo(a.time); }, a => { a.ownHit = true; }, a => { a.type = 'thunder'; delete a.echo; },
    a => { delete a.depth; }, a => { a.heard = !a.heard; }];
  const cases = [];
  for (const [verdict, mutations] of [['rejected', rejected], ['accepted', accepted]])
    for (const base of bases) for (const index of [0, base.acoustics.length - 1]) for (const mutate of mutations) {
      const state = structuredClone(base); mutate(state.acoustics[index], state.ships.map(v => v.id));
      cases.push({verdict, sound: state.acoustics[index], ships: state.ships.map(v => v.id), restores: restore(JSON.stringify(state)) !== null});
    }
  const decoded = (await elm('sound.roundTrip', cases.map(c => [c.sound, c.ships]))).map(r => r !== null);
  assert.deepEqual(cases.filter((c, i) => decoded[i] !== c.restores).map(c => ({verdict: c.verdict, type: c.sound.type})), []);
  assert.ok(cases.every(c => (c.verdict === 'rejected') !== c.restores), 'each mutation does what it claims');
});

const BOAT_KEYS = ['x', 'y', 'depth', 'heading', 'pitch', 'roll', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'cavitation', 'propRpm', 'noise', 'silent', 'gunLoudUntil', 'unpoweredSince', 'repair',
  'floodAlarm', 'collisionCooldown', 'collisionHits', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'criticalExposure', 'imploded', 'scope', 'scopeTravel',
  'systems', 'repairLimits', 'drone', 'plantVersion'];
// The boat's fields as restore leaves them, normalizations included.
const boatOf = s => { const r = JSON.parse(JSON.stringify(restore(JSON.stringify(s)))); return Object.fromEntries(BOAT_KEYS.filter(k => r[k] !== undefined).map(k => [k, r[k]])); };

test('saved boats round-trip through the Elm boat and drone records', async () => {
  const states = savedPatrols().filter(s => restore(JSON.stringify(s)) !== null);
  assert.ok(states.length > 100, 'restorable patrols');
  // A destroyed sonar still holding a limit, which restore zeroes, and a drone on its way home.
  states.push(Object.assign(structuredClone(states[0]), {systems: {...states[0].systems, sonar: 0}, repairLimits: {...states[0].repairLimits, sonar: 50}}),
    Object.assign(structuredClone(states[1]), {drone: {...states[1].drone, mode: 'return', returnStage: 2}}));
  sameResults(await elm('boat.roundTrip', states.map(s => [s, s.time])), states.map(boatOf));
});

test('the Elm boat decoder rejects what restore rejects in current saves, and refuses older saves pending their migrations', async () => {
  const bases = savedPatrols().filter(s => restore(JSON.stringify(s)) !== null).filter((s, i) => i % 9 === 4).slice(0, 10);
  assert.ok(bases.length >= 8, 'restorable patrols');
  const rejected = [s => { s.plantVersion = 2; }, s => { s.fuelLeak = 1.5; }, s => { s.fuelFire = 25; }, s => { s.torps = -1; }, s => { s.torps = 1.5; }, s => { s.outerHull = 101; },
    s => { s.pressureAlarm = 3; }, s => { s.collisionHits = {boat: s.time + 1}; }, s => { s.collisionHits = {boat: -1}; }, s => { s.dieselMode = 'turbo'; }, s => { s.engine = 'nuclear'; },
    s => { s.systems.sonar = 101; }, s => { s.systems.crew = null; }, s => { s.scopeTravel = 1.5; }, s => { s.unpoweredSince = s.time + 1; }, s => { s.drone.mode = 'gone'; },
    s => { s.drone.nosePitch = 61; }, s => { s.drone.returnStage = 4; }, s => { s.drone.hull = 120; }, s => { s.repairLimits.hull = 120; }, s => { s.x = null; }, s => { s.silent = 'no'; },
    s => { s.hull = 101; }, s => { s.criticalExposure = -1; }, s => { s.drone.repairLimits.camera = -1; }];
  const accepted = [s => { s.fuelLeak = 1; }, s => { s.fuelFire = 24; }, s => { s.torps = 0; }, s => { s.pressureAlarm = 2; }, s => { s.scopeTravel = 1; }, s => { s.drone.nosePitch = null; },
    s => { s.drone.nosePitch = 60; }, s => { s.drone.returnStage = 3; }, s => { s.collisionHits = {}; }, s => { s.unpoweredSince = s.time; }, s => { delete s.gunLoudUntil; }];
  // Restore migrates these; the Elm decoder refuses them until the migrations are ported.
  const migrations = [s => { delete s.plantVersion; }, s => { delete s.outerHull; }, s => { delete s.cavitation; }, s => { delete s.systems.deckgun; }, s => { delete s.drone.lostReason; }];
  const cases = [];
  for (const [verdict, mutations] of [['rejected', rejected], ['accepted', accepted], ['migration', migrations]])
    for (const base of bases) for (const mutate of mutations) {
      const state = structuredClone(base); mutate(state);
      cases.push({verdict, state, restores: restore(JSON.stringify(state)) !== null});
    }
  const decoded = (await elm('boat.roundTrip', cases.map(c => [c.state, c.state.time]))).map(r => r !== null);
  assert.deepEqual(cases.map((c, i) => [c, decoded[i]]).filter(([c, d]) => c.verdict !== 'migration' && d !== c.restores).map(([c]) => c.verdict), []);
  assert.ok(cases.every(c => (c.verdict === 'rejected') !== c.restores), 'each mutation does what it claims');
  assert.ok(cases.every((c, i) => c.verdict !== 'migration' || !decoded[i]), 'older saves are refused until their migrations are ported');
});
