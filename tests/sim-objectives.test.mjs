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
  for (const scan of [0, 44.999, 45, 60, NaN]) for (const n of [0, 2, 3, 4]) ops.push([{scan, photoAngles: Array.from({length: n}, (_, i) => i * 60)}]);
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

test('Elm rescue rules match the TypeScript for both rescues', async () => {
  const rescue = await import('../src/rescue-operation.js'), random = seeded(55);
  const kinds = ['surface', 'wreck', 'sub', null, 'Surface'].map(k => [k]);
  // The catalog tags each objective with its kind; the Elm record's constructor carries it instead.
  const untagged = ({kind, ...criteria}) => (assert.equal(kind, 'rescue'), criteria);
  assert.deepEqual(await elm('rescueOperation.rescueCriteriaFor', kinds), kinds.map(([k]) => untagged(rescue.rescueCriteriaFor(k ?? undefined))));
  const sink = rescue.surfaceRescue.sinking, depths = [];
  for (const age of [0, 500, 859.99, 860, 1080, 1500, 4000]) for (const roll of [0, .5, .999]) for (const resting of [2, 3.5, 20, 400]) depths.push([age, roll, resting]);
  for (let i = 0; i < 600; i++) depths.push([random() * 3000, random(), 5 + random() * 300]);
  assert.deepEqual(await elm('rescueOperation.casualtyDepth', depths), depths.map(([age, roll, resting]) => rescue.casualtyDepth(age, roll, sink, resting)));
  const named = {surface: rescue.surfaceRescue, undersea: rescue.underseaRescue}, survivors = [], losses = [], stations = [];
  for (const name of Object.keys(named)) {
    for (const empty of [0, .0799999, .08, .5]) for (const count of [0, .124, .125, .999]) survivors.push([empty, count, name]);
    for (const dead of [0, 1, 7]) for (const roll of [0, .5, .999]) losses.push([dead, roll, name]);
    for (const range of [29.999, 30, 75, 75.001, 85, 85.001]) for (const speed of [-0.61, -0.6, 0, 0.6, 0.6001]) for (const error of [-5, -4.999, 0, 0.999, 1, 4.999, 5])
      stations.push([range, speed, error, name]);
    for (let i = 0; i < 400; i++) stations.push([random() * 120, (random() - .5) * 2, (random() - .5) * 14, name]);
  }
  assert.deepEqual(await elm('rescueOperation.initialSurvivors', survivors), survivors.map(([e, c, n]) => rescue.initialSurvivors(e, c, named[n])));
  assert.deepEqual(await elm('rescueOperation.nextLossDelay', losses), losses.map(([d, r, n]) => rescue.nextLossDelay(d, r, named[n])));
  assert.deepEqual(await elm('rescueOperation.stationKeeping', stations), stations.map(([r, s, e, n]) => rescue.stationKeeping(r, s, e, named[n])));
});

test('the Elm long patrol search matches the TypeScript on every mission and on saved search areas', async () => {
  const search = await import('../src/patrol-search.js'), {createGame, MISSIONS} = await import('../src/sim.js'), random = seeded(56);
  const setupOf = s => ({mission: s.mission, patrol: {seed: s.patrol.seed}, ships: s.ships, site: s.site ? {x: s.site.x, y: s.site.y} : null});
  const games = [];
  for (const m of MISSIONS) for (const seed of [1, 7, 42, 2 ** 31 + 3, 99991]) games.push(createGame(m.id, seed));
  // Synthetic fleets with sides, incidental traffic and military merchants, for every mission.
  const kinds = ['merchant', 'escort', 'fishing', 'carrier', 'sub'];
  for (let i = 0; i < 300; i++) {
    const ships = Array.from({length: Math.floor(random() * 7)}, (_, j) => {
      const v = {id: ['cobalt', 'plover', 'v' + j][Math.floor(random() * 3)] + (random() < .5 ? '' : '-' + j), x: (random() - .5) * 9000, y: (random() - .5) * 9000,
        kind: kinds[Math.floor(random() * 5)], military: random() < .5};
      if (random() < .4) v.side = random() < .5 ? 'friendly' : 'hostile';
      if (random() < .2) v.incidental = true;
      return v;
    });
    games.push({mission: MISSIONS[i % MISSIONS.length].id, patrol: {seed: Math.floor(random() * 2 ** 32)}, ships, site: random() < .2 ? {x: (random() - .5) * 4000, y: (random() - .5) * 4000} : null});
  }
  const setups = games.map(g => [setupOf(g)]);
  const expected = setups.map(([s]) => search.longPatrol(s));
  assert.ok(expected.some(e => !('home' in e)) && expected.some(e => e.search.targets.length > 1), 'transits without a pickup and multi-target searches appear');
  assert.deepEqual(await elm('patrolSearch.longPatrol', setups), expected);
  const areas = expected.map(e => e.search);
  const advances = [];
  for (const [active, protectedTime] of [[0, 0], [179.99999999, 50], [180, 1199], [180, 1200], [179, 1300], [180 - 5e-9, 0]])
    for (const [dt, rate] of [[.25, 1], [.25, .5], [1, 20], [0, 1]]) advances.push([{...areas[0], activeSeconds: active, protectedTime}, dt, rate]);
  for (let i = 0; i < 500; i++) advances.push([{...areas[i % areas.length], activeSeconds: random() * 200, protectedTime: random() * 1400}, random() * 2, 1 + random() * 30]);
  assert.deepEqual(await elm('patrolSearch.advanceApproach', advances), advances.map(([a, dt, rate]) => {const c = structuredClone(a); return {advanced: search.advanceApproach(c, dt, rate), search: c};}));
  const progress = advances.map(([a]) => [a]);
  assert.deepEqual(await elm('patrolSearch.approachProgress', progress), progress.map(([a]) => search.approachProgress(a)));
  // Saved areas, intact and broken in each way the check rejects.
  const saves = [];
  games.forEach((g, i) => {
    const s = {...setupOf(g), time: 300, search: structuredClone(expected[i].search)}, a = s.search, first = a.targets[0];
    saves.push([s], [{...s, search: undefined}], [{...s, search: {...a, radius: 0}}], [{...s, search: {...a, x: NaN}}], [{...s, search: {...a, activeSeconds: 180.001}}],
      [{...s, search: {...a, protectedTime: 300.001}}], [{...s, search: {...a, protectedTime: 300.0009}}], [{...s, search: {...a, targets: [...a.targets, 'stranger']}}],
      [{...s, search: {...a, located: 'yes'}}], [{...s, time: 100, search: {...a, protectedTime: -1}}]);
    if (first !== undefined) saves.push([{...s, search: {...a, recognized: [first]}}], [{...s, search: {...a, recognized: [first, first]}}], [{...s, search: {...a, targets: a.targets.slice(1).concat('x')}}]);
    saves.push([{...s, search: {...a, recognized: ['nobody']}}]);
  });
  const valid = saves.map(([s]) => search.validSearch(s));
  assert.ok(valid.filter(Boolean).length > 50 && valid.filter(v => !v).length > 200, 'the corpus has valid and invalid areas');
  assert.deepEqual(await elm('patrolSearch.validSearch', saves.map(([s]) => [JSON.parse(JSON.stringify(s, (k, v) => Number.isNaN(v) ? '__nan' : v), (k, v) => v === '__nan' ? NaN : v)])), valid);
});
