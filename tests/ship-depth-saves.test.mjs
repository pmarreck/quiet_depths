import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';

// Every way the game makes a submarine gives her a depth, and code reading a
// ship's depth adds to it, so a save cannot leave a submarine without one or
// give any ship a depth that is not a number: an active ping would otherwise
// estimate a NaN depth.
test('a restored ship keeps a finite depth when she has one, and a submarine always has one', () => {
  const s = createGame('seek-and-destroy-sub', 7), saved = JSON.parse(save(s));
  const sub = saved.ships.findIndex(v => v.kind === 'sub'), surface = saved.ships.findIndex(v => v.kind !== 'sub');
  assert.ok(sub >= 0 && surface >= 0, 'the patrol has both');
  const with_ = change => { const copy = structuredClone(saved); change(copy); return restore(JSON.stringify(copy)); };
  assert.ok(with_(() => {}), 'the save as written');
  assert.ok(with_(c => { delete c.ships[surface].depth; }), 'a surface ship without a depth');
  assert.ok(with_(c => { c.ships[surface].depth = 0; }), 'a surface ship at the surface');
  assert.equal(with_(c => { delete c.ships[sub].depth; }), null, 'a submarine without a depth');
  assert.equal(with_(c => { c.ships[sub].depth = null; }), null, 'a submarine with a null depth');
  assert.equal(with_(c => { c.ships[surface].depth = null; }), null, 'a surface ship with a null depth');
  assert.equal(with_(c => { c.ships[surface].depth = '3'; }), null, 'a depth written as text');
});
