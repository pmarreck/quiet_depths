import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, step, MISSIONS} from '../src/sim.js';
import {getSoundings, updateWatchWarnings} from '../src/patrol-create.js';
import {TIMES, WEATHER} from '../src/environment.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The page keeps the photo archive and the captain's name apart from the
// simulation, and a ship's lost track saves as null or not at all alike.
const pageless = s => {
  const w = JSON.parse(save(s));
  for (const key of ['photoArchive', 'photoSequence', 'captain']) delete w[key];
  for (const ship of w.ships) if (ship.tracking === null) delete ship.tracking;
  return exact(w);
};
const pick = (random, list) => list[Math.floor(random() * list.length)];

test('a new patrol matches the TypeScript for every mission, seed and briefing choice', async () => {
  const random = seeded(211), calls = [];
  const times = [undefined, 'random', 'nonsense', ...Object.keys(TIMES)], weathers = [undefined, 'random', 'nonsense', ...Object.keys(WEATHER)];
  const difficulties = [undefined, {}, 'nonsense', {longPatrol: true}, {longPatrol: true, drone: false, satellite: false}, {damage: 5, detection: -3, pursuit: 'fast', pingDetection: .4},
    {longPatrol: true, depthStealth: 1.7, airSupport: false, showSuspicion: false, torpedoCam: false}];
  for (const id of [...MISSIONS.map(m => m.id), 'nonsense']) for (let n = 0; n < 8; n++) {
    const seed = pick(random, [0, 1, 19830604, 4294967295, Math.floor(random() * 2 ** 32), Math.floor(random() * 2 ** 32)]);
    const options = exact({timeOfDay: pick(random, times), weather: pick(random, weathers), changing: pick(random, [undefined, true, false]), difficulty: pick(random, difficulties)});
    calls.push({mission: id, seed, options, expected: pageless(createGame(id, seed, options))});
  }
  assert.ok(calls.some(c => c.expected.search) && calls.some(c => c.expected.battle) && calls.some(c => c.expected.site), 'long patrols, a fleet action and a rescue');
  sameResults(await elm('patrolCreate.createGame', calls.map(c => [c.mission, c.seed, c.options])), calls.map(c => c.expected));
});

// The watch's warnings as the tick keeps them: the battery falling and
// recovering through both marks, the keel over shoaling water, and earlier
// warnings standing, rising and clearing; and the soundings under the boat,
// pitched or level, and under the drone.
test('soundings and the watch\'s warnings match as the battery and the water under the keel change', async () => {
  const random = seeded(212), warned = [], sounded = [];
  for (const [n, {id}] of MISSIONS.entries()) {
    const s = createGame(id, 41 + n);
    for (let t = 0; t < 240; t++) step(s, .25, {timeRate: 1, observation: 'scope'});
    const base = exact(restore(save(s)));
    for (let k = 0; k < 30; k++) {
      const w = structuredClone(base);
      w.battery = pick(random, [5, 9.9, 10, 10.1, 15, 19.9, 20, 20.1, 60]);
      w.depth = pick(random, [12, 40, 80, 120, 200]);
      w.pitch = pick(random, [0, .1, -.2]);
      const previous = pick(random, [undefined, {bottom: false, battery: 0}, {bottom: true, battery: 0}, {bottom: false, battery: 1}, {bottom: true, battery: 2}, {bottom: false, battery: 2}]);
      if (previous) w.watchWarnings = previous; else delete w.watchWarnings;
      const after = structuredClone(w);
      updateWatchWarnings(after);
      warned.push({input: w, expected: pageless(after)});
      for (const drone of [false, true]) sounded.push({input: w, drone, expected: exact(getSoundings(w, drone))});
    }
  }
  // The log keeps its newest entries first.
  const texts = new Set(warned.flatMap(c => c.expected.events.slice(0, 3).map(e => e.text)));
  assert.ok(texts.has('Keel clearance restored to 20 m or more.') && texts.has('Battery above 10%. Critical reserve warning cleared.') && texts.has('Battery reserve restored to 20% or more.'), 'warnings raised and cleared');
  sameResults(await elm('patrolCreate.updateWatchWarnings', warned.map(c => [c.input])), warned.map(c => c.expected));
  sameResults(await elm('patrolCreate.getSoundings', sounded.map(c => [c.input, c.drone])), sounded.map(c => c.expected));
});
