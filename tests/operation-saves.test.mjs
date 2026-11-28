import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';

// A rescue counts survivors one at a time: a transfer or a loss moves exactly
// one, and the rescue ends when none remain. A saved count that is not a whole
// number would never reach zero (0.5 becomes -0.5), so the rescue could never
// finish. Each mission makes one kind of site, the survey's find is text or
// not yet made, and a save cannot change either.
test('a restored operation keeps whole survivor counts, its find as text and the site its mission makes', () => {
  const cases = [['undersea-rescue', 'sub'], ['surface-rescue', 'surface'], ['survey', 'wreck']];
  for (const [mission, kind] of cases) {
    const saved = JSON.parse(save(createGame(mission, 11)));
    assert.equal(saved.site.kind, kind, mission + ' makes its site');
    const with_ = change => { const copy = structuredClone(saved); change(copy); return restore(JSON.stringify(copy)); };
    assert.ok(with_(() => {}), mission + ': the save as written');
    assert.ok(with_(c => { c.operation.remaining = 3; c.operation.rescued = 2; c.operation.dead = 1; }), mission + ': whole counts');
    for (const key of ['rescued', 'remaining', 'dead'])
      assert.equal(with_(c => { c.operation[key] = 0.5; }), null, mission + ': a fractional ' + key);
    assert.ok(with_(c => { c.operation.find = 'A brass bell.'; }), mission + ': a find written');
    assert.ok(with_(c => { delete c.operation.find; }), mission + ': a save from before finds');
    assert.equal(with_(c => { c.operation.find = 5; }), null, mission + ': a find that is not text');
    // A site never moves under its own power: hull contacts push it but leave its speed.
    assert.equal(saved.site.speed, 0, mission + ' makes a still site');
    for (const speed of [2, -1, null, '0']) assert.equal(with_(c => { c.site.speed = speed; }), null, mission + ': a site with speed ' + JSON.stringify(speed));
    assert.equal(with_(c => { delete c.site.speed; }), null, mission + ': a site without a speed');
    for (const other of ['sub', 'surface', 'wreck'].filter(k => k !== kind))
      assert.equal(with_(c => { c.site.kind = other; }), null, mission + ': a ' + other + ' site');
  }
});
