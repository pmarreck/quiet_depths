import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, restore} from '../src/sim.js';
import {missions} from '../typescript/mission-catalog.ts';
import {elm, sameResults} from './sim-harness.mjs';

// Saved patrols from every mission, sampled as they run.
function savedPatrols() {
  const states = [];
  for (const m of missions) for (const seed of [7919, 15838]) {
    const s = createGame(m.id, seed, {longPatrol: seed === 15838});
    for (let t = 1; t <= 1200; t++) {
      if (t % 300 === 1) { s.targetSpeed = [4, 12, 2, 8][(t / 300) | 0]; s.targetDepth = [60, 12, 120, 30][(t / 300) | 0]; }
      step(s, .25, {timeRate: 1});
      if (t % 150 === 0) states.push(JSON.parse(save(s)));
    }
  }
  return states;
}
// Absent and null tracking mean the same; the Elm record keeps one of them.
const normalized = v => { const c = structuredClone(v); if (c.tracking === null) delete c.tracking; return c; };

// A ship carrying every one of the 47 fields of patrol-world.ts's Ship.
const everything = (base, now) => ({...base, military: true, side: 'hostile', depth: 40, sinkDepth: 3, flood: 2, disabled: false, playerDamaged: true, neutralHitAt: 12,
  wreckMark: {x: 1, y: 2, observed: false}, lampFix: {text: 'E1 N2 D3 C4 K5', x: 10, y: 20, time: 5, radius: 10, sender: 'a', number: 1, target: 'b', depth: 3, course: 4, speed: 5},
  nextSweep: 30, incidental: true, roll: .1, verticalSpeed: -.5, fixedWreck: false, groundedAt: 40, clue: {x: 600, y: 900, time: now}, nextInquiry: 50,
  report: {x: 1, y: 2, depth: 30, heading: 90, speed: 4, time: now, reason: 'raised periscope'}, tracking: 'decoy', patrolSpeed: 6, lastAttackAt: 20,
  parley: {against: 'player', level: 2, order: 'warn', range: 900, next: 30, cruise: 7, origin: {x: 5, y: 6, time: 7}}, lights: true, blackout: false, pitch: .02, noise: 80,
  torpedoDecoys: 2, lastTubeSide: -1, lastHitLog: 33, directHits: 1, settled: true, sunkAt: 60, nextCreak: 70, collapsed: true, collapsedAt: 80, fighterCount: 2});

test('saved ships from every mission round-trip through the Elm ship record unchanged', async () => {
  const calls = [];
  for (const state of savedPatrols()) for (const v of state.ships) calls.push([v, state.time]);
  assert.ok(calls.length > 500 && new Set(calls.map(([v]) => v.kind)).size === 5, 'ships of every kind');
  const full = everything(calls.find(([v]) => v.kind === 'escort')[0], 100);
  assert.equal(Object.keys(full).length, 47, 'the fixture carries every field');
  calls.push([full, 100]);
  sameResults(await elm('ship.roundTrip', calls), calls.map(([v]) => normalized(v)));
});

test('the Elm ship decoder rejects what restore rejects, and is stricter only on wrong types', async () => {
  const bases = savedPatrols().filter((s, i) => i % 7 === 3 && s.ships.length && restore(JSON.stringify(s)) !== null).slice(0, 8);
  assert.ok(bases.length >= 6, 'restorable patrols with ships');
  const rejected = [v => { v.id = 5; }, v => { delete v.name; }, v => { v.kind = 'raft'; }, v => { v.x = null; }, v => { v.x = NaN; }, v => { v.sinkDepth = Infinity; }, v => { v.heading = '90'; }, v => { delete v.hull; },
    v => { v.alert = 'high'; }, v => { delete v.alert; }, v => { v.sinkDepth = -1; }, v => { v.sunkAt = -0.5; }, v => { v.nextCreak = null; }, v => { v.collapsedAt = -2; }, v => { v.nextSweep = 'soon'; },
    v => { v.neutralHitAt = -1; }, (v, now) => { v.clue = {x: 1, y: 1, time: now + 1}; }, v => { v.clue = {x: null, y: 1, time: 1}; }, v => { v.clue = {x: 1, y: 1, time: -1}; },
    v => { v.nextInquiry = -1; }, v => { v.wreckMark = {x: 1, y: 2, observed: 'no'}; }, v => { v.wreckMark = {x: 1, y: null, observed: true}; },
    (v, now) => { v.report = {x: 1, y: 2, depth: 3, heading: 4, speed: 5, time: now + 5}; }, v => { v.report = {x: 1, y: 2, depth: 3, speed: 5, time: 1}; }, v => { v.report = null; },
    v => { v.torpedoDecoys = 1.5; }, v => { v.torpedoDecoys = 3; }, v => { v.torpedoDecoys = -1; }];
  const accepted = [v => { v.sinkDepth = 0; }, v => { v.torpedoDecoys = 2; }, (v, now) => { v.clue = {x: 1, y: 1, time: now}; }, v => { v.nextInquiry = 0; },
    v => { v.tracking = null; }, v => { delete v.patrolSpeed; }, (v, now) => { v.report = {x: 1, y: 2, depth: 3, heading: 4, speed: 5, time: now, reason: 'a patrol sweep'}; },
    v => { v.wreckMark = {x: 1, y: 2, observed: true}; }, v => { delete v.sinkDepth; }];
  // Restore never looks at these fields' types (it does check `military` through the
  // mission's targets in some patrols); the Elm decoder does.
  const stricter = [v => { v.lights = 'yes'; }, v => { v.roll = 'level'; }, v => { v.clue = null; }];
  const cases = [];
  for (const [verdict, mutations] of [['rejected', rejected], ['accepted', accepted], ['stricter', stricter]])
    for (const base of bases) for (const index of [0, base.ships.length - 1]) for (const mutate of mutations) {
      const state = structuredClone(base); mutate(state.ships[index], state.time);
      cases.push({verdict, ship: state.ships[index], now: state.time, restores: restore(JSON.stringify(state)) !== null});
    }
  const decoded = (await elm('ship.roundTrip', cases.map(c => [c.ship, c.now]))).map(r => r !== null);
  const disagreements = cases.filter((c, i) => c.verdict !== 'stricter' && decoded[i] !== c.restores);
  assert.deepEqual(disagreements.map(c => ({verdict: c.verdict, ship: c.ship.id})), []);
  assert.ok(cases.every((c, i) => c.verdict !== 'rejected' || !c.restores) && cases.every((c, i) => c.verdict !== 'accepted' || c.restores), 'each mutation does what it claims');
  assert.ok(cases.every((c, i) => c.verdict !== 'stricter' || (c.restores && !decoded[i])), 'restore accepts the wrong types and the Elm rejects them');
});
