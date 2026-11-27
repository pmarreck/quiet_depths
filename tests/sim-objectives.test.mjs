import {test} from 'node:test';
import assert from 'node:assert/strict';
import {photoCriteria, photoGoal, framed} from '../src/recon-photos.js';
import {trackingCriteria, trackingGoal, trackingConvoy} from '../src/convoy-tracking.js';
import {surveyCriteria, scanRate, addScan, surveyComplete} from '../src/wreck-survey.js';
import * as periscope from '../src/periscope.js';
import {elm, seeded} from './sim-harness.mjs';

// Each Elm objective reads the mission definition's own criteria, so these
// also confirm the Elm records are the ones the TypeScript reads.
const rolls = random => [0, .25, .4999999, .5, .75, .9999999, ...Array.from({length: 300}, random)].map(r => [r]);

test('Elm merchant photo goals and framing match the TypeScript', async () => {
  const random = seeded(51), goals = rolls(random);
  assert.deepEqual(await elm('reconPhotos.photoGoal', goals), goals.map(([r]) => photoGoal(r, photoCriteria)));
  const offsets = [-5, -4.9999, -0, 0, 4.9999, 5, 5.0001, NaN, ...Array.from({length: 300}, () => (random() - .5) * 30)].map(o => [o]);
  assert.deepEqual(await elm('reconPhotos.framed', offsets), offsets.map(([o]) => framed(o, photoCriteria)));
});

test('Elm convoy tracking goals and listening match the TypeScript', async () => {
  const random = seeded(52), goals = rolls(random);
  assert.deepEqual(await elm('convoyTracking.trackingGoal', goals), goals.map(([r]) => trackingGoal(r, trackingCriteria)));
  const kinds = ['merchant', 'escort', 'fishing', 'carrier', 'sub'], cases = [];
  // A merchant exactly at the listening range and the noise and depth limits.
  const base = {x: 0, y: 0, noise: 20, depth: 40, systems: {sonar: 100}};
  for (const [noise, depth, sonar, dx] of [[27, 40, 100, 100], [26.999, 15.001, 100, 100], [20, 15, 100, 100], [20, 40, 100, 4000], [20, 40, 100, 3999.999],
    [20, 40, 20, 100], [20, 40, 19.999, 100], [20, 40, 60, 2999.9], [20, 40, 60, 3000]])
    cases.push([{...base, noise, depth, systems: {sonar}, ships: [{x: dx, y: 0, kind: 'merchant', hull: 10}]}]);
  cases.push([{...base, ships: [{x: 50, y: 0, kind: 'merchant', hull: 0}, {x: 50, y: 0, kind: 'merchant', hull: 10, incidental: true}, {x: 50, y: 0, kind: 'escort', hull: 10}]}]);
  cases.push([{...base, ships: []}], [{...base, noise: NaN, ships: [{x: 50, y: 0, kind: 'merchant', hull: 10}]}]);
  for (let i = 0; i < 1500; i++) {
    const ships = Array.from({length: Math.floor(random() * 5)}, () => {
      const v = {x: (random() - .5) * 6000, y: (random() - .5) * 6000, kind: random() < .5 ? 'merchant' : kinds[Math.floor(random() * kinds.length)], hull: random() < .2 ? 0 : random() * 100};
      if (random() < .3) v.incidental = random() < .5;
      return v;
    });
    cases.push([{x: (random() - .5) * 2000, y: (random() - .5) * 2000, noise: 10 + random() * 30, depth: random() * 60, systems: {sonar: random() * 100}, ships}]);
  }
  const expected = cases.map(([s]) => trackingConvoy(s, trackingCriteria));
  assert.ok(expected.filter(Boolean).length > 50 && expected.filter(x => !x).length > 50, 'the corpus both tracks and loses the convoy');
  assert.deepEqual(await elm('convoyTracking.trackingConvoy', cases), expected);
});

test('Elm wreck survey scanning and completion match the TypeScript', async () => {
  const random = seeded(53), passes = [];
  for (const range of [99.999, 100]) for (const vertical of [31.999, 32]) for (const speed of [-3.0001, -3, -0.5, 0.4999, 0.5, 3, 3.0001])
    for (const sonar of [0, 19.999, 20, 64, 100]) passes.push([{range, vertical, speed, sonar}]);
  for (let i = 0; i < 1500; i++) passes.push([{range: random() * 150, vertical: random() * 50, speed: (random() - .5) * 8, sonar: random() * 100}]);
  assert.deepEqual(await elm('wreckSurvey.scanRate', passes), passes.map(([p]) => scanRate(p, surveyCriteria)));
  const scans = [[44, 1, 1], [44.9, .5, .2], [45, 1, 1], [0, 0, 0], [10, NaN, 1], ...Array.from({length: 500}, () => [random() * 50, random(), random() * 3])];
  assert.deepEqual(await elm('wreckSurvey.addScan', scans), scans.map(([scan, rate, dt]) => addScan(scan, rate, dt, surveyCriteria)));
  const ops = [];
  for (const scan of [0, 44.999, 45, 60]) for (const n of [0, 2, 3, 4]) ops.push([{scan, photoAngles: Array.from({length: n}, (_, i) => i * 60)}]);
  assert.deepEqual(await elm('wreckSurvey.surveyComplete', ops), ops.map(([op]) => surveyComplete(op, surveyCriteria)));
});

test('the Elm periscope raises, lowers and reaches the eye height the TypeScript does', async () => {
  const random = seeded(54), scopes = [];
  for (const scope of [false, true]) for (const travel of [undefined, 0, .1, .5, .9999, 1, 1.2, -.1]) scopes.push(travel === undefined ? {scope} : {scope, scopeTravel: travel});
  for (let i = 0; i < 400; i++) scopes.push(random() < .3 ? {scope: random() < .5} : {scope: random() < .5, scopeTravel: random() * 1.1 - .05});
  const one = scopes.map(s => [s]);
  assert.deepEqual(await elm('periscope.scopeExtension', one), one.map(([s]) => periscope.scopeExtension(s)));
  assert.deepEqual(await elm('periscope.scopeEyeHeight', one), one.map(([s]) => periscope.scopeEyeHeight(s)));
  const orders = scopes.flatMap(s => [[s, true], [s, false]]);
  assert.deepEqual(await elm('periscope.orderScope', orders), orders.map(([s, raised]) => {const c = {...s}; periscope.orderScope(c, raised); return c;}));
  // Steps that land exactly on, just short of and past the ordered end.
  const advances = scopes.flatMap(s => [0, .1, .3, 1.5, 2.9999, 3, 4, ...(s.scopeTravel === undefined ? [] : [3 * Math.abs(Number(s.scope) - s.scopeTravel)])].map(t => [s, t]));
  assert.deepEqual(await elm('periscope.advanceScope', advances), advances.map(([s, t]) => {const c = {...s}; periscope.advanceScope(c, t); return c;}));
});
