// The page's orders and patrols across the asynchronous boundary to the Elm
// simulation's worker: writes made around a call in flight or behind queued
// calls, refused commands, patrols loaded back into the worker, orders that
// a reply or the page removes, and what the worker sends of each world.
// Each matches the TypeScript game played in program order.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, step, ping, log} from '../src/sim.js';
import {elmSimulation} from '../src/elm-simulation.js';
import {sameResults} from './sim-harness.mjs';
import {transport, SOURCES, strict, pageless} from './elm-simulation-harness.mjs';

// One command is in flight at a time, and each call carries the orders the
// page changed before it, so every write keeps its place in the page's own
// order: a write made after a call, even before that call's command is sent,
// reaches the worker after it, and a reply never overwrites a write made
// while it was in flight. The patrol under the worker, replies held and
// released by the test, ends as the TypeScript's does with the same writes
// and calls made synchronously in the same order.
for (const [how, via] of SOURCES) test('writes around a command in flight keep their place in the page\'s order, ' + how, async () => {
  const tr = transport({...via, hold: true}), starting = elmSimulation(tr, strict);
  await tr.release();
  const sim = await starting, made = sim.create('recon', 5);
  await tr.release();
  const m = await made, t = createGame('recon', 5), route = {x: t.x + 900, y: t.y - 400};
  for (const s of [m, t]) Object.assign(s, {targetSpeed: 8, photoCooldown: 3});
  // The page: a step, written orders while it is in flight, a ping, more
  // writes made after the ping was called, then a second step.
  const stepped = sim.step(m, 5, {timeRate: 4});
  await Promise.resolve();
  m.targetDepth = 30;
  const pinged = sim.act(m, {kind: 'ping'});
  m.photoCooldown = 4;
  m.route = structuredClone(route);
  await tr.release();
  await stepped;
  assert.equal(m.targetDepth, 30, 'the reply did not overwrite a write made in flight');
  assert.equal(m.photoCooldown, 4);
  assert.deepEqual(m.route, route);
  assert.equal(tr.sent.length, 3, 'the ping waits for the step\'s reply');
  await tr.release();
  assert.equal(await pinged, true);
  const sentPing = tr.sent[3];
  assert.equal(sentPing.kind, 'act');
  assert.equal(sentPing.orders.targetDepth, 30, 'the ping carries the write made before it');
  assert.notEqual(sentPing.orders.photoCooldown, 4, 'and not the one made after it');
  assert.equal(sentPing.orders.route ?? null, null, 'nor the route written after it');
  const second = sim.step(m, 5, {timeRate: 4});
  await tr.release();
  await second;
  assert.equal(tr.sent[4].orders.photoCooldown, 4, 'the next call carries the later writes');
  // The same page, synchronous, in the same order.
  step(t, 5, {timeRate: 4});
  t.targetDepth = 30;
  ping(t);
  t.photoCooldown = 4;
  t.route = structuredClone(route);
  step(t, 5, {timeRate: 4});
  sameResults([pageless(m)], [pageless(t)]);
});

// A refused command applies nothing, and the orders it carried reach the
// worker with the next call, so the page's order still holds.
for (const [how, via] of SOURCES) test('a refused command leaves the page\'s orders for the next call, ' + how, async () => {
  const sim = await elmSimulation(transport(via), strict), m = await sim.create('intercept', 6), t = createGame('intercept', 6);
  for (const s of [m, t]) s.targetSpeed = 5;
  await assert.rejects(sim.act(m, {kind: 'fire'}), /refused a command/);
  m.targetHeading = 45;
  await sim.step(m, 10, {timeRate: 4});
  t.targetHeading = 45;
  step(t, 10, {timeRate: 4});
  sameResults([pageless(m)], [pageless(t)]);
});

// A patrol the worker no longer holds is loaded as the worker last knew it,
// so a write the page made after the call still reaches the worker after
// that call, not with the load ahead of it.
for (const [how, via] of SOURCES) test('a patrol loaded back keeps the page\'s later writes for later, ' + how, async () => {
  const sim = await elmSimulation(transport(via), strict), a = createGame('recon', 13);
  const ma = await sim.restore(save(a));
  await sim.restore(save(createGame('intercept', 14)));
  for (const s of [ma, a]) s.targetSpeed = 9;
  const stepped = sim.step(ma, 20, {timeRate: 4});
  ma.targetSpeed = 0;
  ma.targetHeading = 200;
  await stepped;
  step(a, 20, {timeRate: 4});
  Object.assign(a, {targetSpeed: 0, targetHeading: 200});
  sameResults([pageless(ma)], [pageless(a)]);
  await sim.step(ma, 20, {timeRate: 4});
  step(a, 20, {timeRate: 4});
  sameResults([pageless(ma)], [pageless(a)]);
});

// Two calls queued behind a step, then a write: the write comes after both,
// so neither carries it, though the replies before them leave the written
// order unchanged and the worker's file then omits it. The adapter keeps
// the worker's own orders from its replies, not from the page's object.
for (const [how, via] of SOURCES) test('a write after queued calls reaches the worker after them, ' + how, async () => {
  const tr = transport({...via, hold: true}), starting = elmSimulation(tr, strict);
  await tr.release();
  const sim = await starting, made = sim.create('recon', 19);
  await tr.release();
  const m = await made, t = createGame('recon', 19);
  const calls = [sim.step(m, 5, {timeRate: 4}), sim.act(m, {kind: 'ping'}), sim.act(m, {kind: 'log', text: 'Steady.'})];
  m.targetHeading = 123;
  for (let i = 0; i < 3; i++) { await tr.release(); await calls[i]; }
  assert.equal(m.targetHeading, 123);
  assert.ok(tr.sent.slice(2, 5).every(c => c.orders.targetHeading !== 123), 'none of the three carries the later write');
  const last = sim.step(m, 5, {timeRate: 4});
  await tr.release();
  await last;
  assert.equal(tr.sent[5].orders.targetHeading, 123);
  step(t, 5, {timeRate: 4});
  ping(t);
  log(t, 'Steady.');
  t.targetHeading = 123;
  step(t, 5, {timeRate: 4});
  sameResults([pageless(m)], [pageless(t)]);
});

// A write that puts an order back as it was, after calls queued with other
// changes, still reaches the worker in its place: what the worker will hold
// once the queued calls apply counts every one of them.
for (const [how, via] of SOURCES) test('an order written back after queued calls reaches the worker, ' + how, async () => {
  const tr = transport({...via, hold: true}), starting = elmSimulation(tr, strict);
  await tr.release();
  const sim = await starting, made = sim.create('recon', 20);
  await tr.release();
  const m = await made, t = createGame('recon', 20), heading = m.targetHeading;
  const calls = [sim.step(m, 5, {timeRate: 4})];
  m.targetSpeed = 9;
  calls.push(sim.act(m, {kind: 'ping'}));
  m.targetHeading = 45;
  calls.push(sim.act(m, {kind: 'log', text: 'Come about.'}));
  await tr.release();
  await calls[0];
  m.targetHeading = heading;
  calls.push(sim.act(m, {kind: 'log', text: 'Belay that.'}));
  for (let i = 1; i < 4; i++) { await tr.release(); await calls[i]; }
  const last = sim.step(m, 5, {timeRate: 4});
  await tr.release();
  await last;
  step(t, 5, {timeRate: 4});
  t.targetSpeed = 9;
  ping(t);
  t.targetHeading = 45;
  log(t, 'Come about.');
  t.targetHeading = heading;
  log(t, 'Belay that.');
  step(t, 5, {timeRate: 4});
  sameResults([pageless(m)], [pageless(t)]);
});

// A patrol loaded back into the worker goes as the page holds it, every
// number exact: a negative zero stays negative.
for (const [how, via] of SOURCES) test('a patrol loaded back keeps every number exact, ' + how, async () => {
  const tr = transport(via), sim = await elmSimulation(tr), a = createGame('recon', 23);
  const ma = await sim.restore(save(a));
  await sim.restore(save(createGame('intercept', 24)));
  for (const s of [ma, a]) s.alert = -0;
  await sim.step(ma, 1, {timeRate: 1});
  step(a, 1, {timeRate: 1});
  const load = tr.sent.find(c => c.kind === 'load');
  assert.ok(Object.is(load.world.alert, -0), 'the load carries the negative zero');
  sameResults([pageless(ma)], [pageless(a)]);
});

// A step that reaches a waypoint clears the route, and a call queued behind
// it, made before, must not bring the route back: what the worker reports
// removed is removed.
for (const [how, via] of SOURCES) test('an order a reply removes stays removed for a queued call, ' + how, async () => {
  const tr = transport({...via, hold: true}), starting = elmSimulation(tr, strict);
  await tr.release();
  const sim = await starting, made = sim.create('recon', 25);
  await tr.release();
  const m = await made, t = createGame('recon', 25);
  for (const s of [m, t]) Object.assign(s, {route: {x: s.x + 5, y: s.y + 5, radius: 60}, targetSpeed: 4});
  const calls = [sim.step(m, 2, {timeRate: 1}), sim.act(m, {kind: 'ping'})];
  for (const call of calls) { await tr.release(); await call; }
  step(t, 2, {timeRate: 1});
  assert.equal(t.route ?? null, null, 'the TypeScript reached the waypoint');
  ping(t);
  sameResults([pageless(m)], [pageless(t)]);
  const last = sim.step(m, 2, {timeRate: 1});
  await tr.release();
  await last;
  step(t, 2, {timeRate: 1});
  sameResults([pageless(m)], [pageless(t)]);
});

// An order the page removes stays removed for a call queued behind the one
// that carries the removal, the queued call made before either reply: once
// with the patrol held in the worker throughout, and once removed while the
// worker held another patrol, so that loading it back is the first the
// worker hears of it.
for (const [how, via] of SOURCES) test('an order the page removes stays removed for a queued call, ' + how, async () => {
  for (const away of [false, true]) {
    const sim = await elmSimulation(transport(via), strict), m = await sim.create('recon', 29), t = createGame('recon', 29);
    const other = await sim.create('survey', 30);
    for (const s of [m, t]) s.newYearWatch = 3;
    await sim.step(m, 1, {timeRate: 1});
    step(t, 1, {timeRate: 1});
    if (away) await sim.step(other, 1, {timeRate: 1});
    for (const s of [m, t]) delete s.newYearWatch;
    await Promise.all([sim.step(m, 1, {timeRate: 1}), sim.step(m, 1, {timeRate: 1})]);
    for (let i = 0; i < 2; i++) step(t, 1, {timeRate: 1});
    assert.equal('newYearWatch' in m, false, away ? 'removed while away' : 'removed while held');
    sameResults([pageless(m)], [pageless(t)]);
  }
});

// A patrol loaded back into the worker goes without the fields the page
// left undefined, as JSON would carry it; the TypeScript reads an undefined
// route as it reads none.
for (const [how, via] of SOURCES) test('a patrol loaded back leaves out what the page left undefined, ' + how, async () => {
  const sim = await elmSimulation(transport(via), strict), a = createGame('survey', 26);
  const ma = await sim.restore(save(a));
  await sim.restore(save(createGame('intercept', 27)));
  ma.route = undefined;
  a.route = null;
  await sim.step(ma, 5, {timeRate: 4});
  step(a, 5, {timeRate: 4});
  sameResults([pageless(ma)], [pageless(a)]);
});

// The shipped worker sends a new patrol whole, then each tick only the
// fields that changed.
test('the shipped worker sends only the fields that changed', async () => {
  const tr = transport({shipped: true}), sim = await elmSimulation(tr, strict), m = await sim.create('recon', 28);
  const created = tr.received.at(-1).changes;
  assert.equal(created.whole, true);
  assert.ok('mission' in created.set && 'time' in created.set);
  await sim.step(m, 1, {timeRate: 1});
  const ticks = tr.received.at(-1).ticks;
  assert.ok(ticks.length > 0);
  for (const {changes} of ticks) {
    assert.equal(changes.whole, false);
    assert.ok('time' in changes.set && !('mission' in changes.set) && !('patrol' in changes.set), Object.keys(changes.set).join(' '));
    assert.ok(['targetSpeed', 'gun', 'drone'].every(k => k in changes.set), 'the orders always go');
  }
});
