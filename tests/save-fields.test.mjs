import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, step, MISSIONS} from '../src/sim.js';

// A save from every mission after some play, so its lists hold records.
function played() {
  return MISSIONS.map(({id}, n) => {
    const s = createGame(id, 600 + n, {weather: 'storm'});
    for (let t = 0; t < 30; t++) step(s, 15, {timeRate: 4, observation: 'scope'});
    return JSON.parse(save(s));
  });
}
const restored = (saved, change) => { const copy = structuredClone(saved); change(copy); return restore(JSON.stringify(copy)); };

// Restore once kept a field of the wrong type in a saved record, which the
// simulation would then meet: a switch that is text, a number that is a
// list, a record that is null, a fraction where an id or count belongs.
test('a saved record\'s further fields must hold their types', () => {
  const saves = played();
  const cases = [
    ['ships', {disabled: 'yes'}], ['ships', {military: 1}], ['ships', {flood: 'high'}], ['ships', {lights: 0}], ['ships', {roll: []}], ['ships', {side: 'neutral'}],
    ['ships', {tracking: 'hunting'}], ['ships', {clue: null}], ['ships', {parley: null}], ['ships', {wreckMark: null}], ['ships', {fighterCount: true}],
    ['contacts', {identified: 'yes'}], ['contacts', {kind: 'whale'}], ['contacts', {method: 'radar'}], ['contacts', {name: 7}], ['contacts', {fix: null}], ['contacts', {sweepArea: null}],
    ['contacts', {passiveX: 'x'}], ['acoustics', {depth: 'deep'}], ['acoustics', {friendly: 1}], ['acoustics', {perceived: null}], ['acoustics', {perceived: {distance: 1}}],
    ['acoustics', {id: 2.5}], ['acoustics', {vessel: 4}], ['impacts', {kind: 3}], ['impacts', {id: 1.5}], ['lightning', {id: .5}],
  ];
  let checked = 0;
  for (const [list, junk] of cases) {
    const saved = saves.find(s => s[list]?.length);
    if (!saved) continue;
    assert.ok(restore(JSON.stringify(saved)), list + ': the save as written');
    assert.equal(restored(saved, c => Object.assign(c[list][0], junk)), null, list + ' with ' + JSON.stringify(junk));
    checked++;
  }
  assert.ok(checked >= cases.length - 3, 'most cases found a record to damage');
  const fresh = JSON.parse(save(createGame('recon', 3)));
  assert.equal(restored(fresh, c => { c.drone.lowAlarm = 'on'; }), null, 'a drone alarm of text');
  assert.equal(restored(fresh, c => { c.drone.lostReason = 5; }), null, 'a drone lost for a number');
  assert.equal(restored(fresh, c => { c.patrol.variant = 1.5; }), null, 'a fractional patrol variant');
  assert.equal(restored(fresh, c => { c.airSupport.lastKnown = {x: 0, y: 0, time: 0, reason: 3}; }), null, 'a report with a numbered reason');
  assert.equal(restored(fresh, c => { c.aircraft = [{id: 'a', x: 0, y: 0, altitude: 100, heading: 0, speed: 70, hull: 100}]; }), null, 'an aircraft without its phase and controls');
});

// Restore fills a nullable field an older save lacks with null, as every
// newer save holds it.
test('an older save gains a null last report, operation find and reconnaissance packet', () => {
  const support = restored(JSON.parse(save(createGame('recon', 4))), c => { delete c.airSupport.lastKnown; });
  assert.equal(support.airSupport.lastKnown, null);
  const operation = restored(JSON.parse(save(createGame('survey', 4))), c => { delete c.operation.find; });
  assert.equal(operation.operation.find, null);
  const recon = restored(JSON.parse(save(createGame('recon', 5))), c => { delete c.recon.packet; });
  assert.equal(recon.recon.packet, null);
});
