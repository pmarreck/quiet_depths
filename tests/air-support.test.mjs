import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step} from '../src/sim.js';

// A recon patrol cleared to open water at the origin, and an aircraft placed
// directly, as in the combat acceptance tests.
function ocean(mission = 'recon', seed = 31) {
  const s = createGame(mission, seed);
  Object.assign(s, {x: 0, y: 0, heading: 0, targetHeading: 0, speed: 0, targetSpeed: 0, depth: 0, targetDepth: 0, verticalSpeed: 0, scope: false, site: null, operation: null, ships: [], contacts: []});
  return s;
}
const plane = (id, x, y, altitude, extra = {}) => ({id, name: id, x, y, altitude, heading: 0, speed: 0, hull: 100, phase: 'approach', attack: 999, bank: 0, ...extra});

test('a bomb aimed at a surfaced boat is set for the shallowest depth; only a report without a depth falls back to 40 m', () => {
  const bombDepth = lastKnown => {
    const s = ocean(); s.depth = s.targetDepth = 80;
    s.airSupport.status = 'airborne'; s.airSupport.lastKnown = {...lastKnown, time: s.time};
    s.aircraft = [plane('alpha', 0, -100, 70, {phase: 'search'})];
    step(s, .25);
    const bomb = s.blasts.find(b => b.kind === 'bomb');
    assert.ok(bomb, 'the aircraft drops its bomb over the report');
    return bomb.depth;
  };
  assert.equal(bombDepth({x: 0, y: 0, depth: 0, heading: 0, speed: 0}), 15, 'a report of a boat on the surface');
  assert.equal(bombDepth({x: 0, y: 0, depth: 60, heading: 0, speed: 0}), 60);
  assert.equal(bombDepth({x: 0, y: 0}), 40, 'a legacy report saved without a depth');
});
