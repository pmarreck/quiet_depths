import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';

// A chart route is a point and, for a rescue approach, the radius within which
// it counts as reached; extraction and chart routes carry none. The tick reads
// `route.radius || 100`, so a saved radius that is negative would never be
// reached and the helm would circle the point forever; a save may only carry
// a positive radius or none.
test('a restored route keeps a positive radius or none', () => {
  const saved = JSON.parse(save(createGame('undersea-rescue', 7)));
  const with_ = route => { const copy = structuredClone(saved); copy.route = route; return restore(JSON.stringify(copy)); };
  assert.ok(with_(null), 'no route');
  assert.ok(with_({x: 10, y: 20}), 'a route without a radius');
  assert.ok(with_({x: 10, y: 20, radius: 8}), 'a rescue approach');
  for (const radius of [-5, 0, null, '8']) assert.equal(with_({x: 10, y: 20, radius}), null, 'a route with radius ' + JSON.stringify(radius));
});
