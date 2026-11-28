import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as ts from '../src/acoustics.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';

// The Elm acoustics must hear the same sounds at the same moments, from the
// same directions and as loud, as the TypeScript does.
const kinds = ['launch', 'detonation', 'seeker', 'sweep', 'splashdown', 'gunfire', 'creak', 'collapse', 'settling', 'thunder', 'blast'];
const optional = (random, scale) => {
  const r = random();
  return r < .15 ? undefined : r < .22 ? 0 : r < .25 ? NaN : random() * scale;
};
function source(random, id = 0) {
  const s = {id, time: random() * 200, type: kinds[Math.floor(random() * kinds.length)], x: (random() - .5) * 12000, y: (random() - .5) * 12000, heard: false};
  for (const [key, scale] of [['depth', 300], ['altitude', 2000], ['power', 2]]) {const v = optional(random, scale); if (v !== undefined) s[key] = v;}
  if (random() < .08) s.power = [Infinity, -Infinity, -1, -0][Math.floor(random() * 4)];
  if (random() < .3) s.vessel = 'ship-' + id;
  if (random() < .2) s.echo = {id, x: 1, y: 2};
  return s;
}
function listener(random) {
  const l = {x: (random() - .5) * 2000, y: (random() - .5) * 2000};
  const depth = [undefined, 0, .5, 1, 1.0001, 30, 250][Math.floor(random() * 7)];
  if (depth !== undefined) l.depth = depth;
  if (random() < .8) l.heading = random() * 360;
  return l;
}

test('the Elm air-to-water path matches the TypeScript bisection', async () => {
  const random = seeded(31), cases = [];
  for (const r of [-500, 0, 1, 2000]) for (const h of [-5, 0, 3, 900]) for (const d of [-1, 0, 1, 250]) cases.push([r, h, d]);
  for (let i = 0; i < 2000; i++) cases.push([(random() - .5) * 8000, random() * 2000, random() * 300]);
  sameResults(await elm('acoustics.airWaterPath', cases), cases.map(c => ts.airWaterPath(...c)));
});

test('Elm propagation, pan and perceived loudness match the TypeScript for every kind of sound', async () => {
  const random = seeded(32), cases = Array.from({length: 4000}, (_, i) => [source(random, i), listener(random)]);
  sameResults(await elm('acoustics.propagationTime', cases), cases.map(([s, l]) => ts.propagationTime(s, l)));
  sameResults(await elm('acoustics.spatialPan', cases), cases.map(([s, l]) => ts.spatialPan(s, l)));
  sameResults(await elm('acoustics.perceivedSound', cases), cases.map(([s, l]) => ts.perceivedSound(s, l)));
});

test('the Elm acoustics hear, record and forget sounds in the TypeScript order', async () => {
  const random = seeded(33), cases = [];
  for (let i = 0; i < 120; i++) {
    const now = 100 + random() * 200, count = Math.floor(random() * 140), sounds = Array.from({length: count}, (_, j) => {
      const s = source(random, j + 1);
      s.time = now - random() * 180;
      if (random() < .2) {s.heard = true; s.heardAt = s.time + 1;}
      return s;
    });
    cases.push([now, listener(random), sounds]);
  }
  // Boundaries random inputs never reach: a sound at the listener with a gain
  // of exactly 0.002, one just under it, and sounds exactly 120 s old.
  const here = {x: 10, y: 20, depth: 30, heading: 0}, at = (id, time, power) => ({id, time, type: 'sweep', x: 10, y: 20, depth: 30, power, heard: false});
  cases.push([250, here, [at(1, 250, .002), at(2, 250, .0019999), at(3, 130, 1), at(4, 130.0000001, 1), {...at(5, 130, 1), heard: true, heardAt: 131}]]);
  // Ticks where every sound is heard: settled at 96, one too many, and one sound
  // exactly 120 s old, each against the full update's result.
  const settled = count => Array.from({length: count}, (_, j) => ({...at(j + 1, 200 + j * .1, 1), heard: true, heardAt: 201}));
  cases.push([250, here, settled(96)], [250, here, settled(97)], [250, here, [...settled(40), {...at(41, 130, 1), heard: true, heardAt: 131}]], [250, here, []]);
  const expected = cases.map(([now, l, sounds]) => {
    const s = {...l, time: now, soundSequence: 0, acoustics: structuredClone(sounds)}, events = [];
    ts.updateAcoustics(s, (source, distance) => events.push(['blast', source.id, distance]), source => events.push(['received', source.id]));
    return {sounds: s.acoustics, events};
  });
  assert.ok(expected.some(r => r.sounds.length === 96), 'the corpus reaches the 96-sound limit');
  assert.ok(expected.some(r => r.events.some(e => e[0] === 'blast')), 'the corpus hears a blast');
  sameResults(await elm('acoustics.update', cases), expected);
});
