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
import {elmSimulation} from '../src/elm-simulation.js';
import {refreshMirror} from '../src/world-mirror.js';
import {synchronousPorts} from '../scripts/elm-sync-ports.mjs';
import {compiledElm, sameResults, seeded, exact} from './sim-harness.mjs';

// The worker as the page builds it, its replies delivered at once.
const worker = () => compiledElm('elm/SimWorker.elm', synchronousPorts).SimWorker.init();
// Fails a test that writes, on the page's patrol object, a field only the
// simulation changes; the worker would never see it.
const strict = {onStray: fields => { throw new Error('written outside the orders: ' + fields.join(', ')); }};
const pageless = s => {
  const w = exact(s);
  for (const key of ['photoArchive', 'photoSequence', 'captain']) delete w[key];
  for (const ship of w.ships) if (ship.tracking === null) delete ship.tracking;
  return exact(w);
};
const pick = (random, list) => list[Math.floor(random() * list.length)];

// Each page action as the TypeScript game runs it.
const TYPESCRIPT = {
  ping: w => ping(w), photograph: (w, a) => photograph(w, a.look), fire: (w, a) => fire(w, a.id), decoy: w => decoy(w), deployDrone: w => deployDrone(w),
  recallDrone: w => recallDrone(w), fireDeckGun: (w, a) => fireDeckGun(w, {bearing: a.bearing, elevation: a.elevation}), aimGunAt: (w, a) => aimGunAt(w, {x: a.x, y: a.y}),
  orderScope: (w, a) => orderScope(w, a.raised), requestRecon: (w, a) => requestRecon(w, a.area), startRescue: w => startRescue(w), dronePhotograph: w => dronePhotograph(w),
  endPatrolEarly: w => endPatrolEarly(w), log: (w, a) => log(w, a.text),
};

// The replay marks and invalid numbers a patrol announces while `work` runs.
function announced(world, marks, work) {
  const invalid = [], previous = setInvalidNumberReporter(problem => invalid.push(problem));
  const before = marks.length;
  try { return {result: work(), replay: marks.slice(before), invalid}; } finally { setInvalidNumberReporter(previous); }
}

// The adapter relies on this: Elm runs each command's update and, with the
// ports' timer removed, sends its reply before `send` returns, command after
// command. A stock outgoing port answers once per turn of the event loop.
test('the worker answers each command within the call, one after another', () => {
  const stock = compiledElm('elm/SimWorker.elm').SimWorker.init();
  let late = null;
  stock.ports.replies.subscribe(r => { late = r; });
  stock.ports.commands.send({kind: 'orderFields'});
  assert.equal(late, null, 'a stock port waits for the event loop');
  const app = worker();
  let reply = null;
  app.ports.replies.subscribe(r => { reply = r; });
  for (let n = 0; n < 3; n++) {
    reply = null;
    app.ports.commands.send({kind: 'orderFields'});
    assert.ok(reply && Array.isArray(reply.boat), 'reply ' + n + ' arrived before send returned');
  }
  reply = null;
  app.ports.commands.send({kind: 'step', orders: {}, dt: 1, input: {}});
  assert.match(reply.error, /no patrol/, 'a command needing a patrol, before one exists, is refused');
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

// Every mission, short and long, played continuously both ways: the
// TypeScript game's patrol, and the page's mirror of the Elm worker's. The
// same orders are written on both, the same actions taken, the same frames
// played; after each, the two must match, with every tick the per-tick hook
// sees, every replay mark and every invalid number.
test('the page played through the Elm worker matches the TypeScript game', async () => {
  const sim = await elmSimulation(worker(), strict), random = seeded(911), kinds = Object.keys(TYPESCRIPT), written = new Set();
  let turn = 0, frames = 0, ticks = 0;
  for (const [n, {id}] of MISSIONS.entries()) for (const longPatrol of [false, true]) {
    const seed = 900 + 2 * n + Number(longPatrol), options = exact({difficulty: {longPatrol}, weather: pick(random, [undefined, 'storm', 'fog'])});
    const t = createGame(id, seed, options), m = sim.create(id, seed, options);
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
        Object.assign(s, {engine: k % 2 ? 'diesel' : 'electric', dieselMode: pick(seeded(k), ['charge', 'drive', 'assist']), scopeAngle: 20, towerAngle: 15, towerPitch: -3,
          repair: 120, photoCooldown: 2, reconArchivedSequence: s.recon.sequence});
        Object.assign(s.gun, {angle: 30, elevation: 8});
        Object.assign(s.drone, {targetSpeed: 2, targetDepth: 40, targetHeading: 90, nosePitch: k % 3 ? 12 : null});
        s.imagers.scribbler = 'survey';
        s.imagers.painter = k % 2 ? 'detail' : null;
        written.add('all');
      }
      const kind = kinds[turn++ % kinds.length], target = t.ships[0] ?? t;
      const action = {kind, look: Math.floor(random() * 360), id: t.contacts[0]?.id ?? 'nobody', bearing: 90, elevation: 5, x: target.x, y: target.y, raised: random() < .5,
        area: {x: t.x + 1500, y: t.y + 2500, size: 10000}, text: 'Captain to the bridge.'};
      const a = announced(t, tMarks, () => TYPESCRIPT[kind](t, action)), b = announced(m, mMarks, () => sim.act(m, action));
      sameResults([exact({result: b.result ?? null, replay: b.replay, invalid: b.invalid, world: pageless(m)})], [exact({result: a.result ?? null, replay: a.replay, invalid: a.invalid, world: pageless(t)})]);
      const dt = pick(random, [1 / 60, .25, 1, 5, 30]), input = exact({timeRate: pick(random, [undefined, 1, 4, 16]), observation: pick(random, [undefined, 'scope', 'tower']),
        look: pick(random, [undefined, random() * 360])});
      const shipsBefore = new Map(m.ships.map(v => [v.id, v])), eventsBefore = new Set(m.events);
      const tTicks = [], mTicks = [];
      const c = announced(t, tMarks, () => step(t, dt, {...input, afterTick: s => tTicks.push(pageless(s))}));
      const d = announced(m, mMarks, () => sim.step(m, dt, {...input, afterTick: s => mTicks.push(pageless(s))}));
      assert.equal(mTicks.length, tTicks.length, where + ': as many ticks');
      sameResults(mTicks, tTicks);
      sameResults([exact({replay: d.replay, invalid: d.invalid})], [exact({replay: c.replay, invalid: c.invalid})]);
      for (const v of m.ships) if (shipsBefore.has(v.id)) assert.equal(v, shipsBefore.get(v.id), where + ': ship ' + v.id + ' keeps its identity');
      assert.ok(m.events.filter(e => eventsBefore.has(e)).length >= Math.min(eventsBefore.size, m.events.length) - 2, where + ': log lines keep their identity');
      frames++; ticks += tTicks.length;
    }
    const resumed = sim.restore(JSON.stringify(m)), expected = restore(save(t));
    sameResults([resumed && pageless(resumed)], [expected && pageless(expected)]);
  }
  assert.ok(frames > 150 && ticks > 1000, 'many frames and ticks: ' + frames + ', ' + ticks);
  assert.ok(written.has('all'), 'every order field written');
});

// The worker holds one patrol. The page can restore another (a save slot
// checked, an import validated) and then go back to the first; the adapter
// loads it into the worker again before stepping it.
test('the page can go back to a patrol the worker no longer holds', async () => {
  const sim = await elmSimulation(worker(), strict);
  const a = createGame('recon', 3), b = createGame('intercept', 4);
  for (const s of [a, b]) step(s, 30, {timeRate: 4});
  const ma = sim.restore(save(a)), mb = sim.restore(save(b));
  for (const [t, m] of [[a, ma], [b, mb], [a, ma]]) {
    step(t, 15, {timeRate: 4});
    sim.step(m, 15, {timeRate: 4});
    sameResults([pageless(m)], [pageless(t)]);
  }
  ping(a);
  sim.act(ma, {kind: 'ping'});
  sameResults([pageless(ma)], [pageless(a)]);
});

// The page imports its simulation from one module, which routes to the
// TypeScript or, once handed the adapter, to the Elm worker.
test('the page-side simulation routes to the Elm worker and back', async () => {
  const page = await import('../src/simulation.js');
  const typed = page.createGame('survey', 12);
  page.step(typed, 30, {timeRate: 4});
  page.ping(typed);
  page.log(typed, 'Damage control assigned.');
  assert.equal(page.elmSimulationActive(), false);
  page.useElmSimulation(await elmSimulation(worker(), strict));
  try {
    assert.equal(page.elmSimulationActive(), true);
    const routed = page.createGame('survey', 12);
    page.step(routed, 30, {timeRate: 4});
    page.ping(routed);
    page.log(routed, 'Damage control assigned.');
    sameResults([pageless(routed)], [pageless(typed)]);
    const resumed = page.restore(JSON.stringify(routed));
    sameResults([pageless(resumed)], [pageless(restore(save(typed)))]);
    assert.deepEqual(page.dronePhotograph(resumed), dronePhotograph(restore(save(typed))));
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
  const play = (mission, setup) => {
    const base = createGame(mission, 31, {timeOfDay: 'day', weather: 'clear'});
    setup(base);
    const s = page.restore(save(base));
    page.step(s, 30, {timeRate: 4});
    return calls(s).map(([name, call]) => ({name, result: exact(call() ?? null), world: pageless(s)}));
  };
  const setups = [['surface-rescue', s => { s.ships = []; Object.assign(s, {x: s.site.x + 48, y: s.site.y, depth: 6, speed: 0, targetSpeed: 0}); }],
    ['recon', s => { Object.assign(s, {depth: 10, targetDepth: 10, speed: 2, targetSpeed: 2}); }],
    ['recon', s => { Object.assign(s, {x: s.home.x + 100, y: s.home.y, depth: 0, targetDepth: 0}); s.photos = ['p1']; }]];
  const typed = setups.map(([mission, setup]) => play(mission, setup));
  page.useElmSimulation(await elmSimulation(worker(), strict));
  try {
    const routed = setups.map(([mission, setup]) => play(mission, setup));
    for (const [n, steps] of typed.entries()) for (const [i, expected] of steps.entries()) sameResults([routed[n][i]], [expected]);
    assert.ok(typed.flat().some(c => c.name === 'endPatrolEarly' && c.result === 'partial') && typed.flat().some(c => c.name === 'startRescue' && c.result === true), 'the actions took effect');
  } finally {
    page.useElmSimulation(null);
  }
});

// The orders the adapter sends are exactly the fields the page writes: the
// test above writes each of these, and the worker names no others.
test('the worker takes as orders exactly the fields the page writes', () => {
  const app = worker();
  let reply = null;
  app.ports.replies.subscribe(r => { reply = r; });
  app.ports.commands.send({kind: 'orderFields'});
  assert.deepEqual(reply, {
    boat: ['targetSpeed', 'targetDepth', 'targetHeading', 'silent', 'engine', 'dieselMode', 'route', 'scopeAngle', 'scopeSteerBearing', 'towerAngle', 'towerPitch', 'runSetting', 'imagers', 'repair',
      'photoCooldown', 'reconArchivedSequence'],
    gun: ['angle', 'elevation'],
    drone: ['targetSpeed', 'targetDepth', 'targetHeading', 'nosePitch'],
  });
});

// The guard names a field the page wrote that only the simulation changes,
// and stays quiet for orders and the page's own fields.
test('the adapter names fields written outside the orders', async () => {
  const heard = [];
  const sim = await elmSimulation(worker(), {onStray: fields => heard.push(fields)});
  const s = sim.create('recon', 8);
  Object.assign(s, {targetSpeed: 6, silent: true, captain: 'Hale'});
  s.drone.targetDepth = 30;
  s.gun.elevation = 4;
  sim.step(s, 1, {});
  assert.deepEqual(heard, [], 'orders and page fields are the page\'s');
  s.x += 100;
  s.gun.ammo = 3;
  s.drone.battery = 1;
  sim.step(s, 1, {});
  assert.deepEqual(heard.map(fields => [...fields].sort()), [['drone', 'gun', 'x']]);
});
