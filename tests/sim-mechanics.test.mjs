import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as mech from '../src/mechanics.js';
import {floorSurface, FLOOR_WIDTH, FLOOR_SEGMENTS} from '../src/seafloor.js';
import {shipHit, sphereHit, wrap} from '../src/combat-geometry.js';
import * as vehicle from '../src/vehicle-status.js';
import * as pressure from '../src/pressure.js';
import {elm, seeded} from './sim-harness.mjs';

const nums = random => [0, -0, 1, -1, 359.999, 360, 540, -540, 1e6, NaN, ...Array.from({length: 600}, () => (random() - .5) * 2000)];

test('Elm mechanics geometry, random draws and the log match the TypeScript', async () => {
  const random = seeded(81), n = nums(random), pt = () => ({x: (random() - .5) * 9000, y: (random() - .5) * 9000, depth: random() * 300});
  const triples = n.map(v => [v, (random() - .5) * 100, 50 + random() * 100]).concat([[NaN, 0, 1], [5, 10, 0], [-0, 0, 1]]);
  assert.deepEqual(await elm('mechanics.clamp', triples), triples.map(([v, a, b]) => mech.clamp(v, a, b)));
  assert.deepEqual(await elm('mechanics.rad', n.map(v => [v])), n.map(mech.rad));
  const pairs = n.map(v => [v, n[Math.floor(random() * n.length)]]);
  assert.deepEqual(await elm('mechanics.delta', pairs), pairs.map(([a, b]) => mech.delta(a, b)));
  const points = Array.from({length: 800}, () => [pt(), pt()]).concat([[{x: 1, y: 2, depth: 3}, {x: 1, y: 2, depth: 3}]]);
  assert.deepEqual(await elm('mechanics.bearing', points), points.map(([a, b]) => mech.bearing(a, b)));
  assert.deepEqual(await elm('mechanics.distance', points), points.map(([a, b]) => mech.distance(a, b)));
  assert.deepEqual(await elm('mechanics.separation', points), points.map(([a, b]) => mech.separation(a, b)));
  // Sixty draws in sequence from awkward saved states: zero, negative,
  // fractional and beyond 32 bits. The state compares as JavaScript's | 0.
  const draws = [];
  for (const start of [0, 1, -1, 2 ** 31, 2 ** 32 + 5, 1.5, -123456789, 4294967295, ...Array.from({length: 20}, () => Math.floor(random() * 2 ** 32))]) {
    const s = {rng: start};
    for (let i = 0; i < 60; i++) {const before = s.rng, value = mech.rand(s); draws.push([[before], {value, rng: s.rng | 0}]);}
  }
  assert.deepEqual(await elm('mechanics.rand', draws.map(([a]) => a)), draws.map(([, e]) => e));
  const kinds = ['info', 'warning', 'damage', 'success', 'contact'], logs = [];
  for (let i = 0; i < 300; i++) {
    const events = Array.from({length: Math.floor(random() * 50)}, (_, j) => ({t: j, text: 'line ' + Math.floor(random() * 4), kind: kinds[j % 5]}));
    logs.push([{events, time: random() * 500}, random() < .3 && events.length ? events[0].text : 'line ' + Math.floor(random() * 6), kinds[i % 5]]);
  }
  assert.deepEqual(await elm('mechanics.log', logs), logs.map(([s, text, kind]) => {const c = structuredClone(s); mech.log(c, text, kind); return c.events;}));
});

test('Elm capsule contact and propeller cavitation match the TypeScript', async () => {
  const random = seeded(82), contacts = [];
  for (let i = 0; i < 4000; i++) {
    const body = {x: (random() - .5) * 200, y: (random() - .5) * 200, depth: 40 + random() * 40, heading: random() * 360};
    if (random() < .8) body.pitch = random() < .05 ? NaN : (random() - .5) * .6;
    const point = {x: body.x + (random() - .5) * 80, y: body.y + (random() - .5) * 80, depth: body.depth + (random() - .5) * 20};
    contacts.push([point, body, [27.5, 45, 108][i % 3], [5, 9, 16][i % 3], random() < .5 ? .7 : 3]);
  }
  // On the centerline, half a micrometer off it, and exactly touching (5 + 0.7 = 5.7).
  contacts.push([{x: 3, y: 4, depth: 50}, {x: 3, y: 4, depth: 50, heading: 30, pitch: .1}, 27.5, 5, .7],
    [{x: -5e-7, y: 0, depth: 50}, {x: 0, y: 0, depth: 50, heading: 0, pitch: 0}, 27.5, 5, .7], [{x: 5.7, y: 0, depth: 50}, {x: 0, y: 0, depth: 50, heading: 0, pitch: 0}, 27.5, 5, .7]);
  const expected = contacts.map(c => mech.capsuleContact(...c));
  assert.ok(expected.filter(Boolean).length > 400, 'the corpus includes contacts');
  assert.deepEqual(await elm('mechanics.capsuleContact', contacts), expected);
  // An idle shaft (health at or below the working threshold) at speeds fast enough to cavitate if it turned.
  const props = [[0, 50, 100], [-3, 50, 100], [5, 0, 100], [5, 1, 100], [12, 400, 19.999], [12, 20, 20], [NaN, 10, 100], [30, 0, 0], [40, 2, 19.999]];
  for (let i = 0; i < 2000; i++) props.push([(random() - .5) * 40, random() * 300, random() * 100]);
  assert.deepEqual(await elm('mechanics.propellerState', props), props.map(p => mech.propellerState(...p)));
});

test('the Elm seafloor, weapon geometry and ROV status match the TypeScript', async () => {
  const random = seeded(83);
  assert.deepEqual((await elm('seafloor.constants'))[0], {FLOOR_WIDTH, FLOOR_SEGMENTS});
  const cell = FLOOR_WIDTH / FLOOR_SEGMENTS, floors = [];
  // Points on and beside each triangle's shared diagonal, and random ones.
  for (let i = 0; i < 300; i++) {
    const col = Math.floor(random() * 140), row = Math.floor(random() * 140), f = random();
    const west = col * cell - 8000, top = 8000 - row * cell;
    floors.push([west + f * cell, top - (1 - f) * cell, i % 3 ? 4242 : null], [west + f * cell, top - (1 - f) * cell - 1e-9, 4242]);
  }
  for (let i = 0; i < 2000; i++) floors.push([(random() - .5) * 20000, (random() - .5) * 20000, i % 4 ? Math.floor(random() * 2 ** 32) : null]);
  assert.deepEqual(await elm('seafloor.floorSurface', floors), floors.map(([x, north, seed]) => floorSurface(x, north, seed ?? undefined)));
  const angles = nums(random);
  assert.deepEqual(await elm('combatGeometry.wrap', angles.map(v => [v])), angles.map(wrap));
  const kinds = ['merchant', 'escort', 'fishing', 'carrier', 'sub'], hits = [];
  for (let i = 0; i < 5000; i++) {
    const ship = {x: (random() - .5) * 400, y: (random() - .5) * 400, heading: random() * 360, kind: kinds[i % 5]};
    if (random() < .5) ship.sinkDepth = random() < .1 ? NaN : random() * 30;
    if (random() < .5) ship.depth = random() * 120;
    const from = {x: ship.x + (random() - .5) * 400, y: ship.y + (random() - .5) * 400, altitude: random() * 60 - 20};
    const to = random() < .1 ? {...from, altitude: from.altitude - 30} : {x: ship.x + (random() - .5) * 400, y: ship.y + (random() - .5) * 400, altitude: random() * 60 - 20};
    hits.push([from, to, ship, random() < .2 ? kinds[Math.floor(random() * 5)] : null]);
  }
  hits.push([{x: 0, y: 0, altitude: 5}, {x: 0, y: 0, altitude: 5}, {x: 0, y: 0, heading: 0, kind: 'merchant'}, null]);
  // A path along a box face (no motion across it) whose other axes never overlap in time.
  hits.push([{x: 14, y: -200, altitude: 30}, {x: 14, y: 0, altitude: -30}, {x: 0, y: 0, heading: 0, kind: 'merchant'}, null]);
  // Shells and torpedoes at submarine depths, with and without a known depth.
  for (let i = 0; i < 600; i++) {
    const sub = {x: 0, y: 0, heading: random() * 360, kind: 'sub'};
    if (i % 2) sub.depth = 40 + random() * 60;
    hits.push([{x: (random() - .5) * 120, y: (random() - .5) * 120, altitude: -40 - random() * 40}, {x: (random() - .5) * 120, y: (random() - .5) * 120, altitude: -40 - random() * 40}, sub, null]);
  }
  const hitExpected = hits.map(([f, t, s, k]) => shipHit(f, t, s, k ?? undefined));
  assert.ok(hitExpected.filter(h => h !== null).length > 300, 'the corpus includes hits');
  assert.deepEqual(await elm('combatGeometry.shipHit', hits), hitExpected);
  const spheres = Array.from({length: 2000}, () => {
    const from = {x: (random() - .5) * 100, y: (random() - .5) * 100, altitude: random() * 50};
    return [from, random() < .1 ? {...from} : {x: (random() - .5) * 100, y: (random() - .5) * 100, altitude: random() * 50}, {x: (random() - .5) * 60, y: (random() - .5) * 60, altitude: random() * 40}, random() * 30];
  });
  assert.deepEqual(await elm('combatGeometry.sphereHit', spheres), spheres.map(s => sphereHit(...s)));
  assert.deepEqual((await elm('vehicleStatus.constants'))[0], {SURFACE_DEPTH: vehicle.SURFACE_DEPTH});
  const depths = [-5, 0, 1, 1.0001, 30, NaN, Infinity].map(d => [{depth: d}]);
  assert.deepEqual(await elm('vehicleStatus.isSurfaced', depths), depths.map(([s]) => vehicle.isSurfaced(s)));
  const drones = [{}, {mobility: 0}, {mobility: 19.999}, {mobility: 20}, {mobility: 55}, {mobility: 100}].map(d => [d]);
  assert.deepEqual(await elm('vehicleStatus.droneReturnSpeed', drones), drones.map(([d]) => vehicle.droneReturnSpeed(d)));
  const hulls = Array.from({length: 600}, () => {const h = {x: random() * 100, y: random() * 100, heading: random() * 360, depth: random() * 300 - 5, pitch: (random() - .5) * .3}; if (random() < .5) h.roll = (random() - .5) * .3; return [h];});
  assert.deepEqual(await elm('vehicleStatus.tetherAttachment', hulls), hulls.map(([h]) => vehicle.tetherAttachment(h)));
  assert.deepEqual(await elm('vehicleStatus.recoveryDock', hulls), hulls.map(([h]) => vehicle.recoveryDock(h)));
  const statuses = [];
  for (const mode of ['stowed', 'remote', 'return', 'lost']) for (const speed of [0, 3, 3.0001, -7, 12]) for (const mobility of [undefined, 0, 30, 100]) for (const range of [10, 69.99, 70, 140.45])
    statuses.push([{x: 0, y: 0, depth: 40, speed, drone: {x: range, y: 0, depth: 40, mode, ...(mobility === undefined ? {} : {mobility})}}]);
  const statusExpected = statuses.map(([s]) => vehicle.droneStatus(s));
  assert.equal(new Set(statusExpected.map(s => s.warning.split(' ·')[0])).size, 6, 'every warning appears');
  assert.deepEqual(await elm('vehicleStatus.droneStatus', statuses), statusExpected);
});

test('Elm depth tolerance, seam leaks and implosion match the TypeScript tick by tick', async () => {
  const random = seeded(84), limits = [];
  for (const outerHull of [0, 50, 100]) for (const hull of [0, 33.3, 100]) for (const depth of [0, 100, 160, 177, 200, 260, NaN]) limits.push([{depth, outerHull, hull}]);
  assert.deepEqual(await elm('pressure.depthLimit', limits), limits.map(([s]) => pressure.depthLimit(s)));
  assert.deepEqual(await elm('pressure.pressureLevel', limits), limits.map(([s]) => pressure.pressureLevel(s)));
  const steps = [];
  for (let run = 0; run < 40; run++) {
    const s = {outerHull: random() * 100, hull: 40 + random() * 60, depth: 80, pressureAlarm: 0, criticalExposure: 0, flood: run % 4 ? 0 : 24, repairLimits: {hull: 100}, status: 'patrol',
      imploded: false, shock: 0, rng: [Math.floor(random() * 2 ** 32), 2 ** 32 + run, -run - 1][run % 3], events: [], time: 0};
    if (run % 2) s.debrief = [];
    for (let i = 0; i < 400 && s.status === 'patrol'; i++) {
      const dt = [.25, .5, 1 / 60][i % 3];
      s.depth = Math.min(400, s.depth + (i < 300 ? 1.5 : -3)); s.time += dt;
      steps.push([structuredClone(s), dt]);
      pressure.updatePressure(s, dt);
    }
  }
  const expected = steps.map(([s, dt]) => {const c = structuredClone(s); pressure.updatePressure(c, dt); return {...c, rng: c.rng | 0, debrief: c.debrief ?? []};});
  assert.ok(expected.some(s => s.imploded) && expected.some(s => s.flood === 25) && expected.some(s => s.pressureAlarm === 1), 'the runs leak to the cap, warn and implode');
  assert.deepEqual(await elm('pressure.updatePressure', steps), expected);
});
