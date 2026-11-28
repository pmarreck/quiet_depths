import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';
import {casualtyDepth, surfaceRescue} from '../src/rescue-operation.js';
import {hash01} from '../src/environment.js';
import {bottom} from '../src/mechanics.js';
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

// Edges the played operations rarely reach: a saved operation's decoder
// against restore, an approach before the site is found, a site shallower
// than the approach depth, a route left set, a loss exactly on its deadline,
// a casualty settling exactly to the lost-below mark, and the ROV camera at
// exactly its reach and exactly the separation from a recorded side.
test('the operation\'s constructed edges match', async () => {
  const saves = [], looks = [], starts = [], ticks = [], photos = [];
  // Saved operations: restore keeps or refuses each change, and the decoder must agree.
  for (const mission of OPERATIONS) {
    const saved = JSON.parse(save(createGame(mission, 11)));
    const changes = [o => o, o => ({...o, remaining: -1}), o => ({...o, dead: 2.5}), o => ({...o, rescued: 3}), ...['assessment', 'boarding', 'diverReturn', 'scan', 'lastCasualty'].map(k => o => ({...o, [k]: -1})),
      ...['known', 'holding', 'active', 'completed'].map(k => o => ({...o, [k]: 'yes'})), o => ({...o, photoAngles: [10, 'x']}), o => ({...o, photoAngles: [10, 200.5]}),
      o => ({...o, find: 5}), o => ({...o, find: 'A bell.'}), o => { const c = {...o}; delete c.find; return c; }, o => ({...o, scan: 3.25, assessment: 0})];
    for (const change of changes) {
      const copy = structuredClone(saved);
      copy.operation = change(copy.operation);
      saves.push({operation: copy.operation, kept: restore(JSON.stringify(copy)) !== null});
    }
  }
  assert.ok(saves.some(s => s.kept) && saves.some(s => !s.kept), 'operations kept and refused');
  for (const mission of OPERATIONS) {
    // A long patrol must find its site first; a site may lie shallower than the approach depth.
    const hunted = exact(restore(save(createGame(mission, 12, {difficulty: {longPatrol: true}}))));
    assert.ok(hunted.search && !hunted.search.located, 'a long patrol searches for its site');
    const found = structuredClone(hunted);
    found.search.located = true;
    const shallow = structuredClone(found);
    shallow.site.depth = 6;
    for (const w of [hunted, found, shallow]) looks.push({input: w, approach: exact(operationApproach(w) ?? null)});
    // On station with a route still set.
    const w = exact(restore(save(createGame(mission, 13))));
    const depth = w.site.kind === 'surface' ? 0 : w.site.depth - 11;
    Object.assign(w, {x: w.site.x - 50, y: w.site.y, depth, speed: 0, route: {x: 10, y: 20, radius: 40}});
    starts.push({input: w, expected: (r => [r.result, r.output])(run(w, s => startRescue(s)))});
  }
  // A loss exactly on its deadline, and a casualty settling exactly to the lost-below mark.
  for (const mission of ['undersea-rescue', 'surface-rescue']) {
    const w = exact(restore(save(createGame(mission, 5))));
    assert.ok(w.operation.remaining > 0, 'survivors to lose');
    Object.assign(w, {x: w.site.x + 1000, time: casualtyDeadline(w)});
    ticks.push({input: w, dt: 1, expected: (r => [r.result, r.output])(run(w, s => updateOperation(s, 1)))});
  }
  // A survey pass from well above the wreck and from below it, where the shelf drops away beside it.
  for (const below of [-40, -31, 31, 40]) {
    const w = exact(restore(save(createGame('survey', 15))));
    Object.assign(w, {x: w.site.x - 50, y: w.site.y, depth: w.site.depth + below, speed: 1});
    ticks.push({input: w, dt: 1, expected: (r => [r.result, r.output])(run(w, s => updateOperation(s, 1)))});
  }
  // The casualty rests 5 m above the seabed, so a site where the chart reads
  // exactly 20 m settles exactly to the 15 m mark: found by bisection along x.
  const sink = surfaceRescue.sinking, settled = exact(restore(save(createGame('surface-rescue', 5))));
  const chartSeed = settled.environment.chartSeed, mark = sink.lostBelow + 5;
  const ulps = (x, k) => new Float64Array(new BigInt64Array([new BigInt64Array(new Float64Array([x]).buffer)[0] + BigInt(k)]).buffer)[0];
  let place = null;
  search: for (let y = -8000; y <= 8000; y += 400) for (let x = -8000; x < 8000; x += 400) {
    const a = bottom(x, y, chartSeed), b = bottom(x + 400, y, chartSeed);
    if ((a - mark) * (b - mark) > 0) continue;
    let lo = x, hi = x + 400;
    for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if ((bottom(mid, y, chartSeed) - mark) * (a - mark) > 0) lo = mid; else hi = mid; }
    for (let k = -300; k <= 300; k++) if (bottom(ulps(lo, k), y, chartSeed) === mark) { place = {x: ulps(lo, k), y}; break search; }
  }
  assert.ok(place && settled.operation.remaining >= 2, 'a site exactly 20 m deep, with survivors to lose');
  Object.assign(settled.site, place);
  Object.assign(settled, {x: place.x + 1000, y: place.y, time: 3000});
  assert.equal(casualtyDepth(3000, hash01(settled.patrol.seed, 820), sink, bottom(place.x, place.y, chartSeed) - 5), sink.lostBelow, 'it settles exactly to the mark');
  ticks.push({input: settled, dt: 1, expected: (r => [r.result, r.output])(run(settled, s => updateOperation(s, 1)))});
  // The ROV due north of the wreck: exactly at the camera's reach, and exactly a side's separation from a recorded one.
  for (const [d, angles] of [[85, []], [84.9, []], [30, [55]], [30, [54.9]], [30, [305]]]) {
    const w = exact(restore(save(createGame('survey', 14))));
    Object.assign(w.drone, {mode: 'remote', x: w.site.x, y: w.site.y + d, depth: w.site.depth, heading: 180, camera: 100});
    Object.assign(w, {photoCooldown: 0});
    w.operation.photoAngles = angles;
    photos.push({input: w, expected: (r => [r.result, r.output])(run(w, s => dronePhotograph(s)))});
  }
  sameResults(await elm('operation.validOperation', saves.map(s => [s.operation])), saves.map(s => s.kept));
  sameResults(await elm('operation.operationApproach', looks.map(l => [l.input])), looks.map(l => l.approach));
  sameResults(await elm('operation.startRescue', starts.map(s => [s.input])), starts.map(s => s.expected));
  sameResults(await elm('operation.updateOperation', ticks.map(t => [t.input, t.dt])), ticks.map(t => t.expected));
  sameResults(await elm('operation.dronePhotograph', photos.map(p => [p.input])), photos.map(p => p.expected));
});
