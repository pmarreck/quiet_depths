import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, step, MISSIONS, ping, photograph, fire, decoy, deployDrone, recallDrone, log} from '../src/sim.js';
import {fireDeckGun, aimGunAt} from '../src/combat.js';
import {orderScope} from '../src/periscope.js';
import {requestRecon} from '../src/recon.js';
import {startRescue, dronePhotograph} from '../src/operation.js';
import {endPatrolEarly, pickupRadius} from '../src/early-end.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {setInvalidNumberReporter} from '../src/invalid-numbers.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The patrol as the simulation holds it, numbers exact; the page keeps the
// photo archive and the captain's name, and a lost track is null or absent.
const pageless = s => {
  const w = exact(s);
  for (const key of ['photoArchive', 'photoSequence', 'captain']) delete w[key];
  for (const ship of w.ships) if (ship.tracking === null) delete ship.tracking;
  return exact(w);
};
const pick = (random, list) => list[Math.floor(random() * list.length)];

// Runs work on a patrol, collecting the replay marks and invalid numbers it
// announces; `cut` closes one batch and starts the next.
function announcing(w, work) {
  let replay = [], invalid = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const previous = setInvalidNumberReporter(problem => invalid.push(problem));
  const cut = () => { const batch = {replay, invalid}; replay = []; invalid = []; return batch; };
  try { return work(cut); } finally { setInvalidNumberReporter(previous); }
}

// A frame as `step` plays it, tick by tick, each tick's world as it stood.
const ticked = (w, dt, input) => announcing(w, cut => {
  const ticks = [];
  step(w, dt, {...input, afterTick: s => ticks.push(exact({world: pageless(s), ...cut()}))});
  return ticks;
});

// Each page action as the TypeScript runs it; a function returning nothing
// answers null, as the Elm does.
const ACTIONS = {
  ping: w => ping(w),
  photograph: (w, a) => photograph(w, a.look),
  fire: (w, a) => fire(w, a.id),
  decoy: w => decoy(w),
  deployDrone: w => deployDrone(w),
  recallDrone: w => recallDrone(w),
  fireDeckGun: (w, a) => fireDeckGun(w, {bearing: a.bearing, elevation: a.elevation}),
  aimGunAt: (w, a) => aimGunAt(w, {x: a.x, y: a.y, vx: a.vx, vy: a.vy, altitude: a.altitude}),
  orderScope: (w, a) => orderScope(w, a.raised),
  requestRecon: (w, a) => requestRecon(w, a.area),
  startRescue: w => startRescue(w),
  dronePhotograph: w => dronePhotograph(w),
  endPatrolEarly: w => endPatrolEarly(w),
  log: (w, a) => log(w, a.text, a.logKind),
};
const acted = (w, action) => announcing(w, cut => {
  const result = ACTIONS[action.kind](w, action);
  return exact({result: result === undefined ? null : result, world: pageless(w), ...cut()});
});

// An action the player might take now, of each kind in turn.
function action(random, w, kind) {
  const target = w.ships[Math.floor(random() * w.ships.length)] ?? w;
  switch (kind) {
    case 'photograph': return {kind, look: Math.floor(random() * 360)};
    case 'fire': return {kind, id: w.contacts.length ? pick(random, w.contacts).id : 'nobody'};
    case 'fireDeckGun': return {kind, bearing: Math.floor(random() * 360), elevation: random() * 20};
    case 'aimGunAt': return pick(random, [{kind, x: target.x, y: target.y}, {kind, x: target.x, y: target.y, vx: 2, vy: -1, altitude: 30}]);
    case 'orderScope': return {kind, raised: random() < .5};
    case 'requestRecon': return pick(random, [{kind, area: {x: w.x + 1500, y: w.y + 2500, size: 10000}}, {kind, area: {x: w.x, y: w.y, size: 300}}, {kind, area: null}]);
    case 'log': return pick(random, [{kind, text: 'Captain to the bridge.'}, {kind, text: 'Hull stress.', logKind: 'damage'}, {kind, text: 'Contact.', logKind: 'contact'}]);
    default: return {kind};
  }
}

// Every mission, short and long, played frame by frame: before each frame,
// the helmsman's orders and one action of each kind in turn, each compared
// as the Elm acts on the same saved patrol; then the frame, tick by tick.
test('the simulation as the page drives it matches the TypeScript, tick by tick and action by action', async () => {
  const random = seeded(517), steps = [], acts = [], kinds = Object.keys(ACTIONS);
  let turn = 0;
  for (const [n, {id}] of MISSIONS.entries()) for (const longPatrol of [false, true]) {
    let w = restore(save(createGame(id, 700 + 2 * n + Number(longPatrol), exact({difficulty: {longPatrol}, weather: pick(random, [undefined, 'storm', 'fog'])}))));
    for (let k = 0; k < 14 && w.status === 'patrol'; k++) {
      if (random() < .3) w.targetSpeed = pick(random, [0, 4, 9, 14]);
      if (random() < .3) w.targetDepth = pick(random, [0, 0, 18, 60]);
      if (random() < .3) w.targetHeading = Math.floor(random() * 360);
      for (let a = 0; a < 2; a++) {
        const before = restore(save(w)), chosen = action(random, before, kinds[turn++ % kinds.length]);
        acts.push({args: [JSON.parse(save(before)), chosen], expected: acted(before, chosen)});
        w = before;
      }
      const before = restore(save(w));
      const dt = pick(random, [1 / 60, .25, 1, 5, 30]), input = exact({timeRate: pick(random, [undefined, 1, 4, 16]), observation: pick(random, [undefined, 'scope', 'tower', 'drone']), look: pick(random, [undefined, random() * 360])});
      steps.push({args: [JSON.parse(save(before)), dt, input], expected: ticked(before, dt, input)});
      w = before;
    }
  }
  assert.ok(steps.some(s => s.expected.length > 4) && steps.some(s => s.expected.some(t => t.replay.length)), 'frames of many ticks, and replay marks');
  for (const kind of kinds) assert.ok(acts.some(a => a.args[1].kind === kind), 'each action taken: ' + kind);
  assert.ok(acts.some(a => a.expected.result === true) && acts.some(a => a.expected.result === false), 'actions both taken and refused');
  sameResults(await elm('sim.step', steps.map(s => s.args)), steps.map(s => s.expected));
  sameResults(await elm('sim.act', acts.map(a => a.args)), acts.map(a => a.expected));
});

// The actions random play seldom completes, each set up to succeed, and a
// decoy with none left.
test('each action completed matches the TypeScript', async () => {
  const at = (w, range, bearing) => ({x: w.x + Math.sin(bearing * Math.PI / 180) * range, y: w.y + Math.cos(bearing * Math.PI / 180) * range});
  const pickup = w => Object.assign(w, {x: w.home.x + pickupRadius - 1, y: w.home.y, depth: 0, targetDepth: 0});
  const cases = [
    ['a merchant photographed', 'recon', {timeOfDay: 'day', weather: 'clear', changing: false}, w => {
      Object.assign(w, {heading: 0, targetHeading: 0, speed: 0, targetSpeed: 0, depth: 10, targetDepth: 10, scope: true, photoCooldown: 0, photos: []});
      Object.assign(w.ships.find(v => v.kind === 'merchant' && !v.incidental), at(w, 800, 2), {speed: 0});
    }, {kind: 'photograph', look: 0}, true],
    ['a rescue begun below', 'undersea-rescue', {}, w => { w.ships = []; Object.assign(w, {x: w.site.x + 48, y: w.site.y, depth: w.site.depth - 25, speed: 0, targetSpeed: 3, route: {x: 0, y: 0}}); }, {kind: 'startRescue'}, true],
    ['a rescue begun on the surface', 'surface-rescue', {}, w => { w.ships = []; Object.assign(w, {x: w.site.x + 48, y: w.site.y, depth: 6, speed: 0, targetSpeed: 3, route: {x: 0, y: 0}}); }, {kind: 'startRescue'}, true],
    ['a survey photograph', 'survey', {}, w => {
      Object.assign(w, {x: w.site.x + 50, y: w.site.y, depth: w.site.depth, speed: 1});
      Object.assign(w.drone, {mode: 'remote', x: w.site.x, y: w.site.y - 40, depth: w.site.depth, heading: 0, camera: 50});
    }, {kind: 'dronePhotograph'}, {ok: true}],
    ['a patrol ended with part of its objective', 'recon', {}, w => { pickup(w).photos = ['p1']; }, {kind: 'endPatrolEarly'}, 'partial'],
    ['a patrol ended with none of it', 'recon', {}, w => { pickup(w); }, {kind: 'endPatrolEarly'}, 'withdrawn'],
    ['a decoy with none left', 'recon', {}, w => { w.decoys = 0; }, {kind: 'decoy'}, false],
  ];
  const calls = cases.map(([name, mission, options, setup, chosen, wanted]) => {
    const w = restore(save(createGame(mission, 17, options)));
    setup(w);
    const before = restore(save(w));
    assert.ok(before, name + ': restores');
    const expected = acted(before, chosen);
    if (typeof wanted === 'object') assert.equal(expected.result.ok, wanted.ok, name);
    else assert.equal(expected.result, wanted, name);
    return {args: [JSON.parse(save(restore(save(w)))), chosen], expected};
  });
  sameResults(await elm('sim.act', calls.map(c => c.args)), calls.map(c => c.expected));
});
