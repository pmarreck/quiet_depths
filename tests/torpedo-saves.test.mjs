import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {restoreTorpedo} from '../src/combat.js';

// Torpedo ids come from the patrol's integer weapon sequence, so a saved id
// that is not a whole number can only come from a damaged save.
test('a saved torpedo keeps a whole-number id; a missing one is assigned, a fractional one refused', () => {
  const s = createGame('recon', 31), shot = extra => ({x: 10, y: 20, heading: 90, age: 5, ...extra});
  assert.equal(restoreTorpedo(s, shot({id: 4})), true);
  const next = s.weaponSequence, assigned = shot({});
  assert.equal(restoreTorpedo(s, assigned), true);
  assert.equal(assigned.id, next);
  assert.equal(s.weaponSequence, next + 1);
  for (const id of [3.5, -0.25, 2 ** 53, null, '7']) assert.equal(restoreTorpedo(s, shot({id})), false, 'id ' + String(id));
});

// A torpedo's intended target and its lock name ships by id, or nothing.
test('a saved torpedo\'s intended target and lock are ship ids or null, nothing else', () => {
  const s = createGame('recon', 31), shot = extra => ({x: 10, y: 20, heading: 90, age: 5, id: 4, ...extra});
  for (const extra of [{}, {intended: 'cobalt'}, {intended: null}, {lock: 'cobalt'}, {lock: null, intended: 'kestrel'}]) assert.equal(restoreTorpedo(s, shot(extra)), true, JSON.stringify(extra));
  for (const extra of [{intended: 5}, {intended: {}}, {lock: 7}, {lock: true}, {lock: ['cobalt']}]) assert.equal(restoreTorpedo(s, shot(extra)), false, JSON.stringify(extra));
});
