import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';
import {MISSIONS, randomizePatrol, objectiveComplete, updateFleetBattle} from '../src/missions.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {hash01} from '../src/environment.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The boat's fields the shared harness encodes, as tests/sim-combat.test.mjs picks them.
const FIELDS = ['time', 'x', 'y', 'depth', 'heading', 'pitch', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'noise', 'repair', 'collisionCooldown', 'criticalExposure', 'status', 'rng', 'silent',
  'floodAlarm', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'imploded', 'scope', 'collisionHits', 'systems', 'repairLimits', 'drone', 'impacts',
  'weaponSequence', 'events', 'debrief', 'acoustics', 'soundSequence', 'roll', 'cavitation', 'propRpm', 'gunLoudUntil', 'unpoweredSince', 'scopeTravel'];
const MORE = ['ships', 'site', 'operation', 'home', 'patrol', 'phase', 'airSupport', 'crewQuietUntil', 'trackTime'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

function run(input, call) {
  const w = structuredClone(input), replay = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {result, reports: invalid} = collectInvalidNumbers(() => call(w));
  const picked = Object.fromEntries(FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));
  if (picked.debrief === undefined) picked.debrief = [];
  const present = Object.fromEntries(['convoy', 'battle', 'departure'].filter(k => w[k] != null).map(k => [k, w[k]]));
  return {result, output: exact({...picked, ...Object.fromEntries(MORE.map(k => [k, w[k]])), ...present, ships: w.ships.map(shipOut), replay, invalid})};
}

// The cast patrol creation starts every patrol with, before its layout.
const STARTING = [
  {id: 'cobalt', name: 'Cobalt', kind: 'merchant', military: true, x: 1450, y: 2700, heading: 255, speed: 5, hull: 100, alert: 0, attack: 0},
  {id: 'meridian', name: 'Meridian', kind: 'merchant', military: false, x: 2350, y: 2900, heading: 255, speed: 5, hull: 100, alert: 0, attack: 0},
  {id: 'kestrel', name: 'Kestrel', kind: 'escort', military: true, x: 2300, y: 2050, heading: 255, speed: 7, hull: 100, alert: 0, attack: 0},
  {id: 'tern', name: 'Tern', kind: 'fishing', military: false, x: -850, y: 1350, heading: 110, speed: 3, hull: 100, alert: 0, attack: 0},
  {id: 'echo', name: 'Unknown submarine', kind: 'sub', military: true, x: 3800, y: 900, depth: 75, heading: 280, speed: 4, hull: 100, alert: 0, attack: 0},
];

// A patrol as creation has it just before its layout: the starting cast, no
// site, convoy or battle, and the opening log line.
function unlaid(mission, seed, longPatrol) {
  const w = exact(restore(save(createGame('recon', seed, {difficulty: {longPatrol}}))));
  Object.assign(w, {mission, phase: 'objective', site: null, operation: null, ships: structuredClone(STARTING), torps: MISSIONS.find(m => m.id === mission).torps,
    events: [{t: 0, text: 'Helm steady. Faint screws bearing 028. Your patrol begins.', kind: 'info'}]});
  for (const k of ['convoy', 'battle', 'alliedLamp', 'departure']) delete w[k];
  return w;
}

test('every mission\'s seeded layout matches, short and long patrols alike', async () => {
  const random = seeded(201), calls = [];
  for (const {id} of MISSIONS) for (let n = 0; n < 8; n++) {
    const w = unlaid(id, 1 + n, n % 3 === 2), seed = Math.floor(random() * 2 ** 32);
    calls.push({input: w, seed, expected: run(w, s => randomizePatrol(s, seed)).output});
  }
  // Seeds either side of the odds of a second hunted submarine.
  for (const [lo, hi] of [[.3, .36], [.36, .42]]) {
    let seed = 1;
    while (!(lo <= hash01(seed, 89) && hash01(seed, 89) < hi)) seed++;
    const w = unlaid('seek-and-destroy-sub', 2, false);
    calls.push({input: w, seed, expected: run(w, s => randomizePatrol(s, seed)).output});
  }
  assert.ok(calls.some(c => c.expected.ships.some(v => v.id === 'echo-two')) && calls.some(c => c.expected.departure) && calls.some(c => c.expected.battle) && calls.some(c => c.expected.convoy),
    'a second submarine, a transit, a fleet action and a convoy');
  sameResults(await elm('missions.randomizePatrol', calls.map(c => [c.input, c.seed])), calls.map(c => c.expected));
});

test('each mission\'s objective is judged as the TypeScript judges it, working any rescue or survey', async () => {
  const random = seeded(202), calls = [];
  for (const {id} of MISSIONS) for (const seed of [3, 4, 5]) {
    const base = exact(restore(save(createGame(id, seed))));
    for (let n = 0; n < 40; n++) {
      const w = structuredClone(base);
      w.time += n * 7;
      w.photos = Array.from({length: pick(random, [0, 1, 2, 3, 4, 5])}, (_, k) => 'merchant-' + k);
      w.trackTime = pick(random, [0, 100, 150, 199, 300, 1000]);
      for (const v of w.ships) if (random() < .3) v.hull = pick(random, [0, 0, 20]);
      if (random() < .3) Object.assign(w, {x: w.home.x + pick(random, [0, 40, 400]), y: w.home.y});
      if (w.site && random() < .6) Object.assign(w, {x: w.site.x - 50, y: w.site.y, speed: pick(random, [0, .3, 1]), depth: w.site.kind === 'surface' ? 0 : w.site.depth - 11});
      const dt = pick(random, [.5, 1, 2]), {result, output} = run(w, s => objectiveComplete(s, dt));
      calls.push({input: w, dt, expected: [result, output]});
    }
  }
  assert.ok(calls.some(c => c.expected[0]) && calls.some(c => !c.expected[0]), 'objectives met and unmet');
  sameResults(await elm('missions.objectiveComplete', calls.map(c => [c.input, c.dt])), calls.map(c => c.expected));
});

test('the fleet action as the patrol hears and records it matches, round after round', async () => {
  const random = seeded(203), calls = [];
  for (const seed of [6, 7, 8]) {
    const w = restore(save(createGame('tiebreaker', seed)));
    for (let n = 0; n < 500; n++) {
      w.time += pick(random, [.5, 1, 2]);
      if (n % 50 === 0) Object.assign(w, {x: pick(random, [w.x, w.ships[0].x + 200]), y: w.y});
      const before = exact(w);
      calls.push({input: before, expected: run(before, s => updateFleetBattle(s)).output});
      updateFleetBattle(w);
      w.acoustics = w.acoustics.slice(-10);
      w.impacts = w.impacts.slice(-10);
    }
  }
  // A missed shot arriving at the surface, just below it, and deeper.
  const fleet = exact(restore(save(createGame('tiebreaker', 9))));
  const [a, b] = [fleet.ships.find(v => v.side === 'friendly'), fleet.ships.find(v => v.side === 'hostile')];
  for (const altitude of [2, -2, -2.5, -3.5]) {
    const w = structuredClone(fleet);
    w.battle.volleys = [{id: 900, underwater: altitude < 0, from: {x: a.x, y: a.y, altitude: -3}, to: {x: b.x + 30, y: b.y, altitude}, source: a.id, target: b.id, launched: w.time - 5, arrives: w.time, damage: 0}];
    calls.push({input: w, expected: run(w, s => updateFleetBattle(s)).output});
  }
  const kinds = new Set(calls.flatMap(c => c.expected.impacts.map(i => i.kind)));
  for (const kind of ['torpedo', 'splash', 'hit']) assert.ok(kinds.has(kind), 'an arrival marked ' + kind);
  assert.ok(calls.some(c => c.expected.replay.length), 'a torpedo hit enters the replay');
  sameResults(await elm('missions.updateFleetBattle', calls.map(c => [c.input])), calls.map(c => c.expected));
});
