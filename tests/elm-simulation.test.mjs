import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, step, MISSIONS, ping, photograph, fire, decoy, deployDrone, recallDrone, log} from '../src/sim.js';
import {fireDeckGun, aimGunAt} from '../src/combat.js';
import {orderScope} from '../src/periscope.js';
import {requestRecon} from '../src/recon.js';
import {startRescue, dronePhotograph} from '../src/operation.js';
import {endPatrolEarly} from '../src/early-end.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {setInvalidNumberReporter} from '../src/invalid-numbers.js';
import {elmSimulation, workerTransport} from '../src/elm-simulation.js';
import {refreshMirror} from '../src/world-mirror.js';
import {sameResults, seeded, exact} from './sim-harness.mjs';
import {program, shippedWorker, transport, worker, SOURCES, strict, pageless} from './elm-simulation-harness.mjs';

const pick = (random, list) => list[Math.floor(random() * list.length)];

// Each page action as the TypeScript game runs it.
const TYPESCRIPT = {
  ping: w => ping(w), photograph: (w, a) => photograph(w, a.look), fire: (w, a) => fire(w, a.id), decoy: w => decoy(w), deployDrone: w => deployDrone(w),
  recallDrone: w => recallDrone(w), fireDeckGun: (w, a) => fireDeckGun(w, {bearing: a.bearing, elevation: a.elevation}), aimGunAt: (w, a) => aimGunAt(w, {x: a.x, y: a.y}),
  orderScope: (w, a) => orderScope(w, a.raised), requestRecon: (w, a) => requestRecon(w, a.area), startRescue: w => startRescue(w), dronePhotograph: w => dronePhotograph(w),
  endPatrolEarly: w => endPatrolEarly(w), log: (w, a) => log(w, a.text),
};

// The replay marks and invalid numbers a patrol announces while `work` runs.
async function announced(world, marks, work) {
  const invalid = [], previous = setInvalidNumberReporter(problem => invalid.push(problem));
  const before = marks.length;
  try { return {result: await work(), replay: marks.slice(before), invalid}; } finally { setInvalidNumberReporter(previous); }
}

// A stock outgoing port answers once the event loop turns, never within the
// command; the adapter waits for each reply, and a command needing a patrol
// before one exists is refused.
test('the worker answers each command after the call, and refuses one without a patrol', async () => {
  const app = program.init(), replies = [];
  app.ports.replies.subscribe(r => replies.push(r));
  app.ports.commands.send({kind: 'orderFields'});
  assert.equal(replies.length, 0, 'a stock port waits for the event loop');
  while (!replies.length) await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(Array.isArray(replies[0].boat));
  app.ports.commands.send({kind: 'step', orders: {}, dt: 1, input: {}});
  while (replies.length < 2) await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(replies[1].error, /no patrol/);
});

// The shipped worker file, posted to as the page posts, plays patrols as
// the TypeScript does, with every action and a long frame.
test('the shipped worker file plays a patrol as the TypeScript does', async () => {
  const sim = await elmSimulation(workerTransport(shippedWorker()), strict);
  let stepped = 0;
  for (const [mission, seed] of [['recon', 41], ['intercept', 42], ['surface-rescue', 43]]) {
    const t = createGame(mission, seed), m = await sim.create(mission, seed);
    for (const [k, kind] of Object.keys(TYPESCRIPT).entries()) {
      const action = {kind, look: 30, id: t.contacts[0]?.id ?? 'nobody', bearing: 90, elevation: 5, x: t.x + 400, y: t.y, raised: k % 2 === 0,
        area: {x: t.x + 1500, y: t.y + 2500, size: 10000}, text: 'Captain to the bridge.'};
      for (const s of [t, m]) s.targetSpeed = k % 5;
      const expected = TYPESCRIPT[kind](t, action), got = await sim.act(m, action);
      sameResults([exact({result: got ?? null, world: pageless(m)})], [exact({result: expected ?? null, world: pageless(t)})]);
      const ticks = [], expectedTicks = [];
      step(t, 20, {timeRate: 4, observation: null, afterTick: s => expectedTicks.push(s.time)});
      await sim.step(m, 20, {timeRate: 4, observation: null, afterTick: s => ticks.push(s.time)});
      assert.deepEqual(ticks, expectedTicks, mission + ' after ' + kind + ': the same ticks');
      stepped += ticks.length;
      sameResults([pageless(m)], [pageless(t)]);
    }
  }
  assert.ok(stepped > 300, 'many ticks: ' + stepped);
});

// The page's patrol object refreshed from a reply keeps its identity, its
// ships by id, and its unchanged log lines, as the TypeScript's in-place
// changes did.
test('a refreshed mirror keeps the identities the page relies on', () => {
  const mirror = {time: 1, ships: [{id: 'a', x: 1, parley: {level: 1}}, {id: 'b', x: 2}], events: [{t: 1, text: 'old'}], keepMe: 'page', gone: 1};
  const {ships: [a, b], events: [old]} = mirror, parley = a.parley;
  refreshMirror(mirror, {time: 2, ships: [{id: 'b', x: 3}, {id: 'c', x: 4}, {id: 'a', x: 1, parley: {level: 2}}], events: [{t: 2, text: 'new'}, {t: 1, text: 'old'}]}, ['keepMe']);
  assert.deepEqual(exact(mirror), {time: 2, ships: [{id: 'b', x: 3}, {id: 'c', x: 4}, {id: 'a', x: 1, parley: {level: 2}}], events: [{t: 2, text: 'new'}, {t: 1, text: 'old'}], keepMe: 'page'});
  assert.equal(mirror.ships[0], b);
  assert.equal(mirror.ships[2], a);
  assert.equal(mirror.ships[2].parley, parley);
  assert.equal(mirror.events[1], old, 'an unchanged log line keeps its identity');
  assert.notEqual(mirror.events[0], old, 'a new log line is a new object');
});
// An entry differing from an old one only in the sign of a zero is new, so
// the mirror holds the sign the simulation sent.
test('a refreshed mirror keeps the sign of a zero', () => {
  const mirror = {wake: [{x: 0, time: 1}]};
  refreshMirror(mirror, {wake: [{x: -0, time: 1}]});
  assert.ok(Object.is(mirror.wake[0].x, -0));
  refreshMirror(mirror, {wake: [{x: 0, time: 1}]});
  assert.ok(Object.is(mirror.wake[0].x, 0));
});

// Every mission, short and long, played continuously both ways: the
// TypeScript game's patrol, and the page's mirror of the Elm worker's. The
// same orders are written on both, the same actions taken, the same frames
// played; after each, the two must match, with every tick the per-tick hook
// sees, every replay mark and every invalid number.
for (const [how, via] of SOURCES) test('the page played through the Elm worker matches the TypeScript game, ' + how, async () => {
  const sim = await elmSimulation(transport(via), strict), random = seeded(911), kinds = Object.keys(TYPESCRIPT), written = new Set();
  let turn = 0, frames = 0, ticks = 0;
  for (const [n, {id}] of MISSIONS.entries()) for (const longPatrol of [false, true]) {
    const seed = 900 + 2 * n + Number(longPatrol), options = exact({difficulty: {longPatrol}, weather: pick(random, [undefined, 'storm', 'fog'])});
    const t = createGame(id, seed, options), m = await sim.create(id, seed, options);
    assert.deepEqual(pageless(m), pageless(t), id + ': created alike');
    const tMarks = [], mMarks = [];
    listenForReplayEvents(t, {mark: (time, event) => tMarks.push({time, event})});
    listenForReplayEvents(m, {mark: (time, event) => mMarks.push({time, event})});
    for (let k = 0; k < 12 && t.status === 'patrol'; k++) {
      const where = id + (longPatrol ? ' long' : '') + ' frame ' + k;
      const orders = {};
      if (random() < .3) orders.targetSpeed = pick(random, [0, 4, 9, 14]);
      if (random() < .3) orders.targetDepth = pick(random, [0, 0, 18, 60]);
      if (random() < .3) orders.targetHeading = Math.floor(random() * 360);
      if (random() < .15) orders.silent = random() < .5;
      if (random() < .1) orders.route = {x: t.x + 800, y: t.y + 800};
      if (random() < .1) orders.scopeSteerBearing = Math.floor(random() * 360);
      if (random() < .1) orders.runSetting = pick(random, [1500, 4320]);
      Object.assign(t, structuredClone(orders));
      Object.assign(m, structuredClone(orders));
      // Now and then, every other field the page writes, on both patrols.
      if (random() < .15) for (const s of [t, m]) {
        Object.assign(s, {engine: k % 2 ? 'diesel' : 'electric', dieselMode: ['charge', 'drive', 'assist'][k % 3], scopeAngle: 20, towerAngle: 15, towerPitch: -3,
          repair: 120, photoCooldown: 2, reconArchivedSequence: s.recon.sequence, newYearWatch: 2});
        s.patrolId ??= 'abcdef0123456789abcdef0123456789';
        Object.assign(s.gun, {angle: 30, elevation: 8});
        Object.assign(s.drone, {targetSpeed: 2, targetDepth: 40, targetHeading: 90, nosePitch: k % 3 ? 12 : null});
        s.imagers.scribbler = 'survey';
        s.imagers.painter = k % 2 ? 'detail' : null;
        written.add('all');
      }
      const kind = kinds[turn++ % kinds.length], target = t.ships[0] ?? t;
      const action = {kind, look: Math.floor(random() * 360), id: t.contacts[0]?.id ?? 'nobody', bearing: 90, elevation: 5, x: target.x, y: target.y, raised: random() < .5,
        area: {x: t.x + 1500, y: t.y + 2500, size: 10000}, text: 'Captain to the bridge.'};
      const a = await announced(t, tMarks, () => TYPESCRIPT[kind](t, action)), b = await announced(m, mMarks, () => sim.act(m, action));
      sameResults([exact({result: b.result ?? null, replay: b.replay, invalid: b.invalid, world: pageless(m)})], [exact({result: a.result ?? null, replay: a.replay, invalid: a.invalid, world: pageless(t)})]);
      const before = t;
      const dt = pick(random, [1 / 60, .25, 1, 5, 30, 90]), input = exact({timeRate: pick(random, [undefined, 1, 4, 16]), observation: pick(random, [undefined, null, 'scope', 'tower']),
        paused: pick(random, [undefined, null, undefined, undefined, true]), modal: pick(random, [undefined, null, undefined, undefined, true]),
        imaging: pick(random, [undefined, null, {mode: 'scribbler', profile: 'survey'}, {mode: 'painter', profile: 'detail'}]), lampInView: pick(random, [undefined, null, before.ships[0]?.id, before.ships[1]?.id]),
        look: pick(random, [undefined, random() * 360])});
      const shipsBefore = new Map(m.ships.map(v => [v.id, v])), eventsBefore = new Set(m.events);
      const tTicks = [], mTicks = [];
      const c = await announced(t, tMarks, () => step(t, dt, {...input, afterTick: s => tTicks.push(pageless(s))}));
      const d = await announced(m, mMarks, () => sim.step(m, dt, {...input, afterTick: s => mTicks.push(pageless(s))}));
      assert.equal(mTicks.length, tTicks.length, where + ': as many ticks');
      sameResults(mTicks, tTicks);
      sameResults([exact({replay: d.replay, invalid: d.invalid})], [exact({replay: c.replay, invalid: c.invalid})]);
      for (const v of m.ships) if (shipsBefore.has(v.id)) assert.equal(v, shipsBefore.get(v.id), where + ': ship ' + v.id + ' keeps its identity');
      assert.ok(m.events.filter(e => eventsBefore.has(e)).length >= Math.min(eventsBefore.size, m.events.length) - 2, where + ': log lines keep their identity');
      frames++; ticks += tTicks.length;
    }
    const resumed = await sim.restore(JSON.stringify(m)), expected = restore(save(t));
    sameResults([resumed && pageless(resumed)], [expected && pageless(expected)]);
  }
  assert.ok(frames > 150 && ticks > 1000, 'many frames and ticks: ' + frames + ', ' + ticks);
  assert.ok(written.has('all'), 'every order field written');
});

// The worker holds one patrol. The page can restore another (a save slot
// checked, an import validated) and then go back to the first; the adapter
// loads it into the worker again before stepping it.
for (const [how, via] of SOURCES) test('the page can go back to a patrol the worker no longer holds, ' + how, async () => {
  const sim = await elmSimulation(transport(via), strict);
  const a = createGame('recon', 3), b = createGame('intercept', 4);
  for (const s of [a, b]) step(s, 30, {timeRate: 4});
  const ma = await sim.restore(save(a)), mb = await sim.restore(save(b));
  for (const [t, m] of [[a, ma], [b, mb], [a, ma]]) {
    step(t, 15, {timeRate: 4});
    await sim.step(m, 15, {timeRate: 4});
    sameResults([pageless(m)], [pageless(t)]);
  }
  ping(a);
  await sim.act(ma, {kind: 'ping'});
  sameResults([pageless(ma)], [pageless(a)]);
});

// The page imports its simulation from one module, which routes to the
// TypeScript or, once handed the adapter, to the Elm worker.
test('the page-side simulation routes to the Elm worker and back', async () => {
  const page = await import('../src/simulation.js');
  const typed = await page.createGame('survey', 12);
  await page.step(typed, 30, {timeRate: 4});
  await page.ping(typed);
  await page.log(typed, 'Damage control assigned.');
  assert.equal(page.elmSimulationActive(), false);
  page.useElmSimulation(await elmSimulation(worker(), strict));
  try {
    assert.equal(page.elmSimulationActive(), true);
    const routed = await page.createGame('survey', 12);
    await page.step(routed, 30, {timeRate: 4});
    await page.ping(routed);
    await page.log(routed, 'Damage control assigned.');
    sameResults([pageless(routed)], [pageless(typed)]);
    const resumed = await page.restore(JSON.stringify(routed));
    sameResults([pageless(resumed)], [pageless(restore(save(typed)))]);
    assert.deepEqual(await page.dronePhotograph(resumed), dronePhotograph(restore(save(typed))));
  } finally {
    page.useElmSimulation(null);
  }
});

// Every function the page imports from its simulation module, called the
// same way in both modes on a patrol where each can take effect, gives the
// same result and leaves the same patrol; a refused save leaves the patrol
// being played in place.
test('every routed function matches the TypeScript', async () => {
  const page = await import('../src/simulation.js');
  const calls = s => {
    const target = s.ships.find(v => v.kind === 'merchant') ?? {x: s.x + 500, y: s.y};
    return [
      ['ping', () => page.ping(s)], ['photograph', () => page.photograph(s, 40)], ['deployDrone', () => page.deployDrone(s)], ['recallDrone', () => page.recallDrone(s)],
      ['decoy', () => page.decoy(s)], ['aimGunAt', () => page.aimGunAt(s, {x: target.x, y: target.y, vx: 1, vy: 2, altitude: 4})],
      ['fireDeckGun', () => page.fireDeckGun(s, {bearing: 45, elevation: 6})], ['orderScope', () => page.orderScope(s, false)],
      ['requestRecon', () => page.requestRecon(s, {x: s.x + 1500, y: s.y + 2500, size: 10000})], ['fire', () => page.fire(s, s.contacts[0]?.id ?? 'nobody')],
      ['startRescue', () => page.startRescue(s)], ['dronePhotograph', () => page.dronePhotograph(s)], ['log', () => page.log(s, 'Hull stress.', 'damage')],
      ['refused save', () => page.restore('{"version": 2}')], ['step', () => page.step(s, 20, {timeRate: 4, observation: 'scope'})], ['endPatrolEarly', () => page.endPatrolEarly(s)],
    ];
  };
  // Each setup changes a saved patrol, which both modes then restore.
  const play = async (mission, setup) => {
    const base = createGame(mission, 31, {timeOfDay: 'day', weather: 'clear'});
    setup(base);
    const s = await page.restore(save(base));
    await page.step(s, 30, {timeRate: 4});
    const out = [];
    for (const [name, call] of calls(s)) out.push({name, result: exact(await call() ?? null), world: pageless(s)});
    return out;
  };
  const playAll = async () => { const out = []; for (const [mission, setup] of setups) out.push(await play(mission, setup)); return out; };
  const setups = [['surface-rescue', s => { s.ships = []; Object.assign(s, {x: s.site.x + 48, y: s.site.y, depth: 6, speed: 0, targetSpeed: 0}); }],
    ['recon', s => { Object.assign(s, {depth: 10, targetDepth: 10, speed: 2, targetSpeed: 2}); }],
    ['recon', s => { Object.assign(s, {x: s.home.x + 100, y: s.home.y, depth: 0, targetDepth: 0}); s.photos = ['p1']; }]];
  const typed = await playAll();
  page.useElmSimulation(await elmSimulation(worker(), strict));
  try {
    const routed = await playAll();
    for (const [n, steps] of typed.entries()) for (const [i, expected] of steps.entries()) sameResults([routed[n][i]], [expected]);
    assert.ok(typed.flat().some(c => c.name === 'endPatrolEarly' && c.result === 'partial') && typed.flat().some(c => c.name === 'startRescue' && c.result === true), 'the actions took effect');
  } finally {
    page.useElmSimulation(null);
  }
});

// The orders the adapter sends are exactly the fields the page writes: the
// test above writes each of these, and the worker names no others.
test('the worker takes as orders exactly the fields the page writes', async () => {
  const app = program.init();
  const reply = new Promise(resolve => app.ports.replies.subscribe(resolve));
  app.ports.commands.send({kind: 'orderFields'});
  assert.deepEqual(await reply, {
    boat: ['targetSpeed', 'targetDepth', 'targetHeading', 'silent', 'engine', 'dieselMode', 'route', 'scopeAngle', 'scopeSteerBearing', 'towerAngle', 'towerPitch', 'runSetting', 'imagers', 'repair',
      'photoCooldown', 'reconArchivedSequence', 'newYearWatch', 'patrolId'],
    gun: ['angle', 'elevation'],
    drone: ['targetSpeed', 'targetDepth', 'targetHeading', 'nosePitch'],
  });
});

// The guard names a field the page wrote that only the simulation changes,
// and stays quiet for orders and the page's own fields.
test('the adapter names fields written outside the orders', async () => {
  const heard = [];
  const sim = await elmSimulation(worker(), {onStray: fields => heard.push(fields)});
  const s = await sim.create('recon', 8);
  Object.assign(s, {targetSpeed: 6, silent: true, captain: 'Hale'});
  s.drone.targetDepth = 30;
  s.gun.elevation = 4;
  await sim.step(s, 1, {});
  assert.deepEqual(heard, [], 'orders and page fields are the page\'s');
  s.x += 100;
  s.gun.ammo = 3;
  s.drone.battery = 1;
  await sim.step(s, 1, {});
  assert.deepEqual(heard.map(fields => [...fields].sort()), [['drone', 'gun', 'x']]);
});

// The hook before a step's ticks sees the patrol as it was, once, before
// any tick lands; then each tick's hook sees that tick.
for (const [how, via] of SOURCES) test('the hook before a step sees the patrol before its ticks, ' + how, async () => {
  const sim = await elmSimulation(transport(via), strict), m = await sim.create('survey', 15), seen = [];
  const before = m.time;
  await sim.step(m, 5, {timeRate: 4, beforeTicks: s => seen.push(['before', s.time]), afterTick: s => seen.push(['tick', s.time])});
  assert.deepEqual(seen[0], ['before', before]);
  assert.equal(seen.filter(([k]) => k === 'before').length, 1);
  assert.ok(seen.length > 2 && seen.slice(1).every(([k, time]) => k === 'tick' && time > before));
});

// Only patrols the adapter created or restored can be stepped or acted on.
test('the adapter refuses a patrol it did not create or restore', async () => {
  const sim = await elmSimulation(worker(), strict);
  assert.throws(() => sim.step(createGame('recon', 16), 1), /did not create or restore/);
  assert.throws(() => sim.act(createGame('recon', 16), {kind: 'ping'}), /did not create or restore/);
});

// A field only the simulation changes, written by a per-tick hook in a step
// whose reply must be followed by the page's own orders, is still named.
test('the guard names a hook\'s stray write under orders laid over a reply', async () => {
  const heard = [], sim = await elmSimulation(worker(), {onStray: fields => heard.push(fields)});
  const s = await sim.create('recon', 17), ticks = [];
  const stepped = sim.step(s, 1, {afterTick: w => { ticks.push(w.time); w.alert = 99; }});
  s.targetSpeed = 7;
  await stepped;
  assert.ok(ticks.length > 0);
  assert.deepEqual(heard, [['alert']]);
});

// Every function the page imports resolves asynchronously in both modes, and
// a failing TypeScript call is delivered as a rejection, as the worker's is.
test('the page-side simulation answers with promises in both modes', async () => {
  const page = await import('../src/simulation.js');
  const exercise = async () => {
    const s = page.createGame('recon', 18);
    assert.ok(s instanceof Promise);
    const w = await s, seen = [];
    const calls = [page.step(w, 2, {beforeTicks: x => seen.push(x.time)}), page.ping(w), page.photograph(w, 10), page.fire(w, 'nobody'), page.decoy(w), page.deployDrone(w),
      page.recallDrone(w), page.log(w, 'Note.'), page.fireDeckGun(w, {bearing: 1, elevation: 2}), page.aimGunAt(w, {x: 1, y: 2}), page.orderScope(w, true),
      page.requestRecon(w, {x: 1, y: 2, size: 3}), page.startRescue(w), page.dronePhotograph(w), page.endPatrolEarly(w), page.restore('{}')];
    for (const call of calls) assert.ok(call instanceof Promise);
    await Promise.allSettled(calls);
    assert.equal(seen.length, 1, 'the hook before the step ran once');
    return w;
  };
  await exercise();
  const typed = page.step(null, 1);
  assert.ok(typed instanceof Promise);
  await assert.rejects(typed);
  page.useElmSimulation(await elmSimulation(worker(), strict));
  try { await exercise(); } finally { page.useElmSimulation(null); }
});

// An action's invalid numbers reach the reporter, as the TypeScript's do.
for (const [how, via] of SOURCES) test('an action reports its invalid numbers, ' + how, async () => {
  const sim = await elmSimulation(transport(via), strict), m = await sim.create('recon', 21), t = createGame('recon', 21);
  const a = await announced(t, [], () => fireDeckGun(t, {bearing: NaN, elevation: 3}));
  const b = await announced(m, [], () => sim.act(m, {kind: 'fireDeckGun', bearing: NaN, elevation: 3}));
  assert.deepEqual(a.invalid.map(p => p.where), ['fireDeckGun bearing']);
  sameResults([exact({result: b.result, invalid: b.invalid, world: pageless(m)})], [exact({result: a.result, invalid: a.invalid, world: pageless(t)})]);
});

// The adapter's restore checks and fills the page's own fields as the
// TypeScript's does, refusing a save whose captain or photo numbering is bad.
test('the adapter restores the page\'s own fields as the TypeScript does', async () => {
  const sim = await elmSimulation(worker(), strict), base = JSON.parse(save(createGame('recon', 22)));
  for (const patch of [{captain: 123}, {captain: 'x'.repeat(300)}, {photoSequence: -1}, {photoArchive: 'no'}])
    assert.equal(await sim.restore(JSON.stringify({...base, ...patch})), restore(JSON.stringify({...base, ...patch})), JSON.stringify(patch).slice(0, 40));
  const {photoArchive, photoSequence, captain, ...rest} = base, m = await sim.restore(JSON.stringify(rest)), t = restore(JSON.stringify(rest));
  assert.deepEqual([m.photoArchive, m.photoSequence, m.captain], [t.photoArchive, t.photoSequence, t.captain]);
});

// A reply that answers no command is a fault in the worker, and says so.
test('a reply that answers no command is refused', async () => {
  let deliver = null, sent = null;
  const asked = new Promise(resolve => { sent = resolve; });
  const starting = elmSimulation({send: () => sent(), listen: l => { deliver = l; }});
  await asked;
  deliver({boat: [], gun: [], drone: []});
  await starting;
  assert.throws(() => deliver({boat: []}), /replied to no command/);
});

