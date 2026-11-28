import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as env from '../src/environment.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';

const times = ['dawn', 'day', 'dusk', 'night'], weathers = ['clear', 'cloudy', 'rain', 'storm'];

// Saved conditions: setup choices, older saves without a start day, the
// first days of 1972, Christmas and New Year's Day 1973.
function conditions(random, i) {
  const c = env.makeEnvironment(Math.floor(random() * 2 ** 32), {timeOfDay: i % 5 ? times[i % 4] : 'random', weather: i % 7 ? weathers[i % 4] : 'random', changing: i % 6 !== 0});
  if (i % 11 === 0) delete c.startDay;
  if (i % 13 === 0) c.startDay = null;
  if (i % 17 === 0) c.startDay = [0, 359, 366][i % 3];
  return c;
}
// Times near each front's change and the end of its 75 s blend.
const when = (random, i) => [random() * 20000, 300 * Math.floor(random() * 60) + [0, -1e-9, 37.5, 75, 74.999, 299.999][i % 6], random() * 2880 * 3][i % 3];

test('the Elm weather and time tables match the TypeScript', async () => {
  assert.deepEqual((await elm('environment.constants'))[0], {WEATHER: {...env.WEATHER}, TIMES: {...env.TIMES}});
});

test('Elm setup conditions match the TypeScript for every choice and seed', async () => {
  const random = seeded(101), calls = [[], [7]];
  const seeds = [0, 1, -1, 2 ** 31, 2 ** 32 + 9, -(2 ** 33) - 3, 1.75, 19830604, ...Array.from({length: 60}, () => (random() - .3) * 2 ** 34)];
  for (const seed of seeds) for (const timeOfDay of [undefined, 'random', ...times, 'noon', 'constructor', 6]) for (const weather of [undefined, 'random', ...weathers, 'fog', 'toString', 3])
    calls.push([seed, {timeOfDay, weather, changing: [undefined, true, false, 0, null][Math.floor(random() * 5)]}]);
  const expected = calls.map(args => env.makeEnvironment(...args));
  assert.equal(new Set(expected.map(c => c.startHour)).size, 4, 'each start hour is drawn');
  sameResults(await elm('environment.makeEnvironment', calls), expected);
});

test('the Elm sky matches the TypeScript through fronts, fog, moonlight, holidays and lightning', async () => {
  const random = seeded(102), skies = [{}, {time: 0}, {time: NaN, environment: env.makeEnvironment(5)}, {time: -0, wavePhase: 3}, {time: -40, environment: env.makeEnvironment(9)}, {time: -100000, environment: env.makeEnvironment(9, {timeOfDay: 'dawn'})}];
  for (let i = 0; i < 6000; i++) {
    const s = {environment: conditions(random, i), time: when(random, i)};
    if (i % 3 === 0) s.wavePhase = random() * 900;
    if (i % 4 === 0) {
      s.x = (random() - .5) * 9000; s.y = (random() - .5) * 9000;
      s.lightning = Array.from({length: i % 5}, (_, j) => ({time: s.time - [0, .75, .7499, .22, -1e-6, random()][j % 6], x: s.x + (random() - .5) * 40000, y: s.y + (random() - .5) * 40000}));
    }
    skies.push(s);
  }
  skies.push({time: 10, lightning: [{time: 9.9, x: 0, y: 0}]});
  // A lone strike at each edge of its flash, so that edge alone decides it:
  // exactly 0.75 s old (over), just younger, just struck, and 2^-20 s
  // before it strikes. In the corpus above a younger strike always
  // outshines one at an edge, and its ages are rarely exact.
  const edges = [.75, .7499, 0, -(2 ** -20)];
  for (const age of edges) skies.push({time: 10, x: 0, y: 0, lightning: [{time: 10 - age, x: 0, y: 0}]});
  const expected = skies.map(s => env.environmentAt(s));
  assert.deepEqual(expected.slice(-edges.length).map(e => e.flash > 0), [false, true, true, false], 'a strike flashes from the moment it strikes until 0.75 s');
  const seen = key => new Set(expected.map(e => e[key]));
  assert.ok(seen('weather').has('Morning fog') && seen('phase').size === 4 && seen('seaState').size === 4 && seen('holiday').size === 3 && seen('navigationLights').size === 2, 'the corpus covers fog, each phase, each sea state and both holidays');
  const presets = Object.values(env.WEATHER).map(w => w.cloud);
  assert.ok(expected.some(e => e.flash > .5), 'lightning flashes nearby');
  assert.ok(expected.some(e => Number.isNaN(e.flash)), 'a strike seen from an unplaced sky');
  assert.ok(expected.some(e => !presets.includes(e.cloud)), 'fronts are caught mid-blend');
  sameResults(await elm('environment.environmentAt', skies.map(s => [s])), expected);
});

test('Elm hull motion, the periscope eye, the washed lens and soundings match the TypeScript', async () => {
  const random = seeded(103), boats = [];
  for (let i = 0; i < 3000; i++) {
    const s = {environment: conditions(random, i), time: when(random, i), x: (random() - .5) * 4000, y: (random() - .5) * 4000, heading: random() * 360,
      depth: [random() * 20, 10 + random() * 6, random() * 2][i % 3], pitch: (random() - .5) * .3, scope: i % 4 !== 0};
    if (i % 3 === 0) s.wavePhase = random() * 900;
    if (i % 5 === 0) s.scopeTravel = random();
    if (i % 2) s.roll = (random() - .5) * .2;
    boats.push([s]);
  }
  sameResults(await elm('environment.boatSurfacePose', boats), boats.map(([s]) => env.boatSurfacePose(s)));
  const washed = boats.map(([s]) => env.scopeWashed(s));
  assert.ok(washed.filter(Boolean).length > 100 && washed.filter(w => !w).length > 100, 'lenses wash and clear');
  sameResults(await elm('environment.scopeWashed', boats), washed);
  const eyes = boats.map(([s], i) => [{x: s.x, y: s.y, heading: s.heading, depth: s.depth, pitch: s.pitch, ...(i % 2 ? {roll: s.roll} : {})}, ...(i % 3 ? [{scope: s.scope, ...(s.scopeTravel === undefined ? {} : {scopeTravel: s.scopeTravel})}] : [])]);
  sameResults(await elm('environment.scopePosition', eyes), eyes.map(args => env.scopePosition(...args)));
  const soundings = [[230, 12], [230, 12, .7], [0, 0, 0], [NaN, 4], [80, 120, 32.5]];
  sameResults(await elm('environment.soundings', soundings), soundings.map(args => env.soundings(...args)));
});
