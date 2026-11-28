import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';
import {setupOperation, operationApproach, operationConditions, startRescue, casualtyDeadline, dronePhotograph, updateOperation} from '../src/operation.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The boat's fields the shared harness encodes, as tests/sim-combat.test.mjs picks them.
const FIELDS = ['time', 'x', 'y', 'depth', 'heading', 'pitch', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'noise', 'repair', 'collisionCooldown', 'criticalExposure', 'status', 'rng', 'silent',
  'floodAlarm', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'imploded', 'scope', 'collisionHits', 'systems', 'repairLimits', 'drone', 'impacts',
  'weaponSequence', 'events', 'debrief', 'acoustics', 'soundSequence', 'roll', 'cavitation', 'propRpm', 'gunLoudUntil', 'unpoweredSince', 'scopeTravel'];
const MORE = ['ships', 'site', 'operation', 'route', 'home', 'photoCooldown'];
const OPERATIONS = ['undersea-rescue', 'surface-rescue', 'survey'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

function run(input, call) {
  const w = structuredClone(input), replay = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {result, reports: invalid} = collectInvalidNumbers(() => call(w));
  const picked = Object.fromEntries(FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));
  if (picked.debrief === undefined) picked.debrief = [];
  return {result, output: exact({...picked, ...Object.fromEntries(MORE.map(k => [k, w[k]])), ships: w.ships.map(shipOut), replay, invalid})};
}

test('a rescue or survey is set up as the TypeScript sets it up, and other missions have none', async () => {
  const random = seeded(191), calls = [];
  for (let n = 0; n < 60; n++) {
    // A recon patrol keeps the whole cast, Kestrel included, for any mission to set up.
    const w = exact(restore(save(createGame('recon', 1 + n))));
    w.mission = pick(random, [...OPERATIONS, ...OPERATIONS, 'recon', 'tiebreaker']);
    w.difficulty = {...w.difficulty, longPatrol: pick(random, [true, false, undefined])};
    if (w.difficulty.longPatrol === undefined) delete w.difficulty.longPatrol;
    const seed = Math.floor(random() * 2 ** 32);
    calls.push({input: w, seed, expected: run(w, s => setupOperation(s, seed)).output});
  }
  const sites = new Set(calls.map(c => c.expected.site?.name).filter(Boolean));
  assert.ok(sites.size >= 7, 'sites of every kind and name: ' + [...sites].join(', '));
  assert.ok(calls.some(c => c.expected.ships.some(v => v.id === 'kestrel')) && calls.some(c => c.expected.site && !c.expected.ships.some(v => v.id === 'kestrel')), 'hunted and quiet rescues');
  sameResults(await elm('operation.setupOperation', calls.map(c => [c.input, c.seed])), calls.map(c => c.expected));
});

// Rescues and surveys played with the boat moving on and off station, too fast,
// at the wrong depth and holding still, through transfers, losses, a surface
// casualty foundering and a survey scanning to its find.
test('each tick of a rescue or survey, and its approach, conditions, start and casualty clock, match', async () => {
  const random = seeded(192), ticks = [], looks = [], starts = [];
  for (const mission of OPERATIONS) for (const seed of [5, 6, 7]) {
    const w = restore(save(createGame(mission, seed)));
    if (seed === 7 && w.search) w.search.located = false;
    // One surface rescue never comes alongside, so survivors remain when she founders.
    const away = mission === 'surface-rescue' && seed === 7;
    for (let n = 0; n < (away ? 1300 : 900); n++) {
      const dt = pick(random, [.5, 1, 1, 2]);
      w.time += dt;
      if (n % 30 === 0) {
        const site = w.site, surface = site.kind === 'surface', range = away ? 1000 : pick(random, [20, 30, 45, 60, 75, 80, 140, 1000]);
        const angle = random() * Math.PI * 2;
        Object.assign(w, {x: site.x + Math.sin(angle) * range, y: site.y + Math.cos(angle) * range, speed: pick(random, [0, .3, .6, .7, 1, 2.5, 4]),
          depth: surface ? pick(random, [0, 0, .5, 2]) : site.depth - 11 + pick(random, [0, 0, 2, -4.9, 6, 20])});
        w.status = random() < .9 ? 'patrol' : 'lost';
        if (mission === 'survey' && random() < .2) w.operation.photoAngles = [0, 90, 180, 270].slice(0, Math.floor(random() * 5));
        w.systems = {...w.systems, sonar: pick(random, [100, 100, 50, 10])};
      }
      if (n % 10 === 0) {
        const before = exact(w);
        looks.push({input: before, approach: operationApproach(before) ?? null, conditions: operationConditions(before) ?? null, deadline: before.operation ? casualtyDeadline(before) : null});
        const {result, output} = run(before, s => startRescue(s));
        starts.push({input: before, expected: [result, output]});
      }
      const before = exact(w), {result, output} = run(before, s => updateOperation(s, dt));
      ticks.push({input: before, dt, expected: [result, output]});
      updateOperation(w, dt);
      w.events = w.events.slice(-6);
    }
  }
  const texts = new Set(ticks.flatMap(t => t.expected[1].events.map(e => e.text.replace(/[0-9]+/g, 'N'))));
  for (const text of ['Survivor aboard. N rescued.', 'Rescue team report: N survivors still awaiting transfer.', 'A survivor’s signal has stopped. Rescue window is narrowing.',
    'The casualty has gone under. No further survivor signals. Recover the rescue team.'])
    assert.ok(texts.has(text), 'a rescue reaches: ' + text);
  assert.ok(ticks.some(t => t.expected[1].operation.find), 'a survey reaches its find');
  assert.ok(starts.some(s => s.expected[0]) && starts.some(s => !s.expected[0]), 'rescues started and refused');
  sameResults(await elm('operation.updateOperation', ticks.map(t => [t.input, t.dt])), ticks.map(t => t.expected));
  sameResults(await elm('operation.operationApproach', looks.map(l => [l.input])), looks.map(l => exact(l.approach)));
  sameResults(await elm('operation.operationConditions', looks.map(l => [l.input])), looks.map(l => exact(l.conditions)));
  sameResults(await elm('operation.casualtyDeadline', looks.map(l => [l.input])), looks.map(l => l.deadline));
  sameResults(await elm('operation.startRescue', starts.map(s => [s.input])), starts.map(s => s.expected));
});

test('the ROV\'s survey photographs match: aim, reach, a damaged camera, a recorded side and the wrong task', async () => {
  const random = seeded(193), calls = [];
  for (const seed of [5, 6, 7, 8]) {
    const base = exact(restore(save(createGame('survey', seed))));
    for (let n = 0; n < 80; n++) {
      const raw = structuredClone(base), site = raw.site, d = pick(random, [4, 7.9, 8.1, 30, 60, 84, 86]), angle = random() * Math.PI * 2;
      Object.assign(raw.drone, {mode: pick(random, ['remote', 'remote', 'return', 'stowed', 'lost']), x: site.x + Math.sin(angle) * d, y: site.y + Math.cos(angle) * d,
        depth: site.depth + pick(random, [0, 0, -5]), camera: pick(random, [100, 100, 60, 21, 19, 0])});
      // Aimed at the wreck, a little off, or past the camera's spread.
      const toSite = (Math.atan2(site.x - raw.drone.x, site.y - raw.drone.y) * 180 / Math.PI + 360) % 360;
      raw.drone.heading = (toSite + pick(random, [0, 10, 31, 33, 90, 180]) + 360) % 360;
      raw.photoCooldown = pick(random, [0, 0, 0, 2]);
      if (random() < .4) raw.operation.photoAngles = [(toSite + 180 + pick(random, [0, 40, 80])) % 360];
      // As a save restores it: a destroyed camera can no longer be repaired.
      const w = exact(restore(JSON.stringify(raw)));
      assert.ok(w, 'the constructed ROV restores');
      calls.push({input: w, expected: (r => [r.result, r.output])(run(w, s => dronePhotograph(s)))});
    }
  }
  // A rescue has no survey camera task.
  for (const mission of ['undersea-rescue', 'surface-rescue']) {
    const w = exact(restore(save(createGame(mission, 9))));
    Object.assign(w.drone, {mode: 'remote', x: w.site.x + 30, y: w.site.y, depth: w.site.depth, heading: 270});
    calls.push({input: w, expected: (r => [r.result, r.output])(run(w, s => dronePhotograph(s)))});
  }
  const outcomes = new Set(calls.map(c => c.expected[0].text.replace(/[0-9]+/g, 'N')));
  assert.ok(outcomes.size >= 5, 'every outcome: ' + [...outcomes].join(' | '));
  sameResults(await elm('operation.dronePhotograph', calls.map(c => [c.input])), calls.map(c => c.expected));
});
