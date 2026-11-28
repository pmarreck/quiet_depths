import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';

// A save whose blasts are the given records, ten seconds into a patrol.
function withBlasts(blasts) {
  const saved = JSON.parse(save(createGame('intercept', 3)));
  saved.time = 10;
  saved.soundSequence = 20;
  saved.blasts = blasts.map(extra => ({id: 18, x: saved.x + 300, y: saved.y, depth: 40, delay: 3, totalDelay: 3, age: 0, exploded: false, kind: 'charge', ...extra}));
  return restore(JSON.stringify(saved));
}

// The game makes depth charges and bombs. Restore once kept a blast of any
// kind, or none, which the simulation would then carry and draw.
test('a saved blast must be a depth charge or a bomb', () => {
  assert.ok(withBlasts([{}]), 'a depth charge');
  assert.ok(withBlasts([{kind: 'bomb', airTime: 1, airHeight: 100, splashed: false}]), 'a bomb');
  for (const kind of ['banana', 7, null, undefined]) assert.equal(withBlasts([{kind}]), null, 'a blast of kind ' + String(kind));
});

// Restore once kept a blast's further fields in any type a save held.
test('a saved blast\'s fields must hold their types', () => {
  assert.ok(withBlasts([{kind: 'bomb', airTime: 1, airHeight: 100, splashed: true, exploded: true, explodedAt: 9, age: 1, convoyCharge: false}]), 'every field in its type');
  const junk = [{id: 7.5}, {id: null}, {id: 'x'}, {totalDelay: 'x'}, {totalDelay: null}, {exploded: 'yes'}, {exploded: null}, {exploded: 1}, {explodedAt: 'x'}, {explodedAt: null},
    {airTime: 'x'}, {airTime: null}, {airHeight: {}}, {splashed: 'yes'}, {splashed: null}, {convoyCharge: 1}, {convoyCharge: null}];
  for (const extra of junk) assert.equal(withBlasts([extra]), null, 'a blast with ' + JSON.stringify(extra));
});

// Before torpedo runs, a weapon was saved as a blast: one still to arrive
// resumes as a torpedo in the water, and one that already went off has only
// its fading cloud left, which restore drops rather than keep as a blast of
// a kind the game no longer makes.
test('an older save\'s exploded weapon blast is dropped', () => {
  const restored = withBlasts([{kind: 'weapon', delay: -2, age: 2, exploded: true, explodedAt: 8}, {id: 19, delay: 1}]);
  assert.ok(restored, 'the save restores');
  assert.deepEqual(restored.blasts.map(b => b.kind), ['charge']);
});
