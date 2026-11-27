import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as watch from '../src/watch-warnings.js';
import * as debrief from '../src/debrief.js';
import * as seabed from '../src/seabed-rest.js';
import * as tubes from '../src/torpedo-tubes.js';
import {SUB_DESIGN} from '../src/hull-design.js';
import {elm, seeded} from './sim-harness.mjs';

// Each Elm leaf module is compared with the TypeScript it replaces, on its
// boundary values and on seeded inputs between them.

test('Elm watch warnings track the keel and battery exactly as the TypeScript does', async () => {
  const random = seeded(11), cases = [];
  for (const clearance of [-1, 0, 19.999, 20, 20.001, 300]) for (const charge of [0, 9.999, 10, 10.001, 19.999, 20, 100])
    for (const previous of [null, {bottom: false, battery: 0}, {bottom: true, battery: 1}, {bottom: false, battery: 2}])
      cases.push([clearance, charge, previous]);
  for (let i = 0; i < 400; i++) cases.push([random() * 60, random() * 30, random() < .3 ? null : {bottom: random() < .5, battery: Math.floor(random() * 3)}]);
  const expected = cases.map(([clearance, charge, previous]) => {const w = watch.watchWarnings(clearance, charge, previous ?? undefined); return {bottom: w.bottom, battery: w.battery};});
  assert.deepEqual(await elm('watchWarnings.warnings', cases), expected);
  assert.deepEqual(await elm('watchWarnings.batteryCall', [[1], [2], [0]]), [watch.batteryCall(1), watch.batteryCall(2), null], 'a charged battery calls nothing');
  assert.deepEqual(await elm('watchWarnings.bottomCall'), [watch.bottomCall]);
});

test('the Elm debrief keeps, merges and trims lines as the TypeScript does', async () => {
  const random = seeded(12), texts = ['Hit.', 'Miss.', 'Contact.'], cases = [];
  let entries = [];
  for (let i = 0; i < 160; i++) {
    const time = (entries.at(-1)?.time ?? 0) + (random() < .5 ? random() * 3.9 : 4 + random() * 10), text = texts[Math.floor(random() * 3)];
    cases.push([time, text, entries.map(e => ({...e}))]);
    const state = {time, debrief: entries.map(e => ({...e}))};
    debrief.addDebrief(state, text);
    entries = state.debrief;
  }
  cases.push([10, 'First.', []], [13.99, 'Same.', [{time: 10, text: 'Same.'}]], [14, 'Same.', [{time: 10, text: 'Same.'}]]);
  const expected = cases.map(([time, text, list]) => {const state = {time, debrief: list.map(e => ({...e}))}; debrief.addDebrief(state, text); return state.debrief;});
  assert.ok(expected.some(list => list.length === 48), 'the corpus reaches the 48-line limit');
  assert.deepEqual(await elm('debrief.add', cases), expected);
});

test('Elm seabed rest matches the TypeScript landing, wear and stealth rules', async () => {
  const random = seeded(13), pairs = [], singles = [], flags = [];
  for (const a of [-1, 0, 0.2, 0.3, 0.30001, 0.4, 0.40001, 1.2, 2, 2.0001, 3.4, 5]) {
    singles.push([a]);
    for (const b of [-12, -0.3, 0, 0.3, 0.31, 2, 10]) pairs.push([a, b]);
  }
  for (let i = 0; i < 300; i++) {singles.push([random() * 4 - .5]); pairs.push([random() * 4 - .5, random() * 24 - 12]);}
  for (const bottomed of [true, false]) for (const effort of [-0.31, -0.3, 0, 0.3, 0.30001, 4]) flags.push([bottomed, effort]);
  assert.deepEqual(await elm('seabedRest.touchdownImpact', pairs), pairs.map(([d, s]) => seabed.touchdownImpact(d, s)));
  assert.deepEqual(await elm('seabedRest.touchdownChance', singles), singles.map(([x]) => seabed.touchdownChance(x)));
  assert.deepEqual(await elm('seabedRest.touchdownDamage', singles), singles.map(([x]) => seabed.touchdownDamage(x)));
  assert.deepEqual(await elm('seabedRest.seabedWear', pairs), pairs.map(([e, dt]) => seabed.seabedWear(e, dt)));
  assert.deepEqual(await elm('seabedRest.restingStealth', flags), flags.map(([b, e]) => seabed.restingStealth(b, e)));
  assert.deepEqual(await elm('seabedRest.sweepClutter', flags), flags.map(([b, e]) => seabed.sweepClutter(b, e)));
});

test('the Elm bow tubes report rounds, reloads and the next tube as the TypeScript does', async () => {
  const random = seeded(14), states = [];
  for (const torps of [0, 1, 2, 3, 6]) for (const [port, starboard] of [[0, 0], [5, 5], [3, 9], [9, 3], [12, 12]]) for (const time of [0, 3, 5, 9, 15])
    states.push([{time, torps, tubeReadyAt: {port, starboard}}]);
  for (let i = 0; i < 300; i++) states.push([{time: random() * 40, torps: Math.floor(random() * 7), tubeReadyAt: {port: random() * 40, starboard: random() * 40}}]);
  assert.deepEqual(await elm('torpedoTubes.tubes', states), states.map(([s]) => tubes.torpedoTubes(s)));
  const pitches = [];
  for (const age of [0, 0.5, 0.75, 0.76, 1.2, 1.5, 1.6]) for (const elapsed of [-0.1, 0, 0.016, 0.3]) pitches.push([0.2, -0.1, age, elapsed, 1.5]);
  for (let i = 0; i < 300; i++) {const duration = .5 + random() * 2; pitches.push([random() - .5, random() - .5, random() * duration * 1.2, random() * .2, duration]);}
  assert.deepEqual(await elm('torpedoTubes.exitPitch', pitches), pitches.map(p => tubes.exitPitch(...p)));
});

test('the Elm hull design carries the TypeScript dimensions', async () => {
  const {hullColor, propellerColor, ...dimensions} = SUB_DESIGN;
  assert.deepEqual(await elm('hullDesign.design'), [dimensions]);
});
