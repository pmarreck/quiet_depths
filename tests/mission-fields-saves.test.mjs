import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, MISSIONS} from '../src/sim.js';

// Only the fleet action fights a battle and only the covert transit departs
// from a gate, so a save of any other mission may carry neither: restore
// checks each only on its own mission, and kept whatever another carried.
test('a restored patrol carries a battle only on the fleet action and a departure gate only on the transit', () => {
  for (const {id} of MISSIONS) {
    const saved = JSON.parse(save(createGame(id, 9)));
    const with_ = change => { const copy = structuredClone(saved); change(copy); return restore(JSON.stringify(copy)); };
    assert.ok(with_(() => {}), id + ': the save as written');
    if (id !== 'tiebreaker') for (const battle of ['x', null, {}, {areas: [], volleys: [], round: 0, next: 0}])
      assert.equal(with_(c => { c.battle = battle; }), null, id + ': a battle ' + JSON.stringify(battle));
    if (id !== 'sneaky-seamen') for (const departure of ['x', null, {x: 1, y: 2}])
      assert.equal(with_(c => { c.departure = departure; }), null, id + ': a departure ' + JSON.stringify(departure));
  }
});
