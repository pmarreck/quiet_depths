import {test} from 'node:test';
import assert from 'node:assert/strict';
import {elm, seeded} from './sim-harness.mjs';

// The Elm simulation's arithmetic must equal JavaScript's to the last bit,
// signed zeros and NaN included, so its results can match the TypeScript.
const specials = [0, -0, 5e-324, -5e-324, 2.2250738585072014e-308, 1e-300, 0.5, 1, 3, 4, 12, 360, 359.99999999999994, 720, 1e15, 9007199254740993, 1e300, 1.7976931348623157e308, -1, -360, -720, Infinity, -Infinity, NaN];
const same = (actual, expected, label) => {
  assert.equal(actual.length, expected.length);
  const bad = expected.flatMap((value, i) => Object.is(actual[i], value) ? [] : [[i, actual[i], value]]);
  assert.deepEqual(bad.slice(0, 5), [], label + ': ' + bad.length + ' results differ from JavaScript');
};

function corpus(seed, arity, count) {
  const random = seeded(seed), scales = [1e-300, 1e-8, 1, 37, 360, 1500, 1e6, 1e150], cases = [];
  for (const a of specials) for (const b of specials) cases.push(arity === 2 ? [a, b] : [a, b, specials[(cases.length * 7) % specials.length]]);
  for (let i = 0; i < count; i++) cases.push(Array.from({length: arity}, () => {
    const r = random();
    return r < .05 ? 0 : r < .1 ? specials[Math.floor(random() * specials.length)] : (random() - .5) * scales[Math.floor(random() * scales.length)];
  }));
  return cases;
}

test('Elm hypot of two and three values equals Math.hypot bit for bit', async () => {
  const two = corpus(21, 2, 60000), three = corpus(22, 3, 60000);
  same(await elm('math.hypot2', two), two.map(args => Math.hypot(...args)), 'hypot2');
  same(await elm('math.hypot3', three), three.map(args => Math.hypot(...args)), 'hypot3');
});

test('Elm remainder equals the JavaScript % operator bit for bit', async () => {
  const random = seeded(23), cases = corpus(24, 2, 60000);
  for (let i = 0; i < 20000; i++) cases.push([(random() - .5) * 1e5, 360], [(random() - .5) * 720, 360], [random() * 1e6, random() * 10 + 1e-9]);
  same(await elm('math.remainder', cases), cases.map(([x, y]) => x % y), 'remainder');
});
