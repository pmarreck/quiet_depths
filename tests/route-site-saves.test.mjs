import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, MISSIONS} from '../src/sim.js';

const SITES = ['undersea-rescue', 'surface-rescue', 'survey'];

// A route, site and operation are a record or null. Restore once kept a
// falsy value of any type in their place, 0, false or an empty string,
// which the patrol would then hold; and an older save without a route kept
// none, where every other save holds null.
test('a saved route, site and operation are a record or null, and an older save gains a null route', () => {
  for (const {id} of MISSIONS) {
    const saved = JSON.parse(save(createGame(id, 11)));
    const with_ = change => { const copy = structuredClone(saved); change(copy); return restore(JSON.stringify(copy)); };
    for (const junk of [0, false, ''])
      assert.equal(with_(c => { c.route = junk; }), null, id + ': a route of ' + JSON.stringify(junk));
    if (!SITES.includes(id)) for (const key of ['site', 'operation']) for (const junk of [0, false, ''])
      assert.equal(with_(c => { c[key] = junk; }), null, id + ': ' + key + ' of ' + JSON.stringify(junk));
    const older = with_(c => { delete c.route; });
    assert.ok(older, id + ': a save without a route restores');
    assert.equal(older.route, null, id + ': with a null route');
  }
});
