import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, restore} from '../src/sim.js';
import {missions} from '../typescript/mission-catalog.ts';
import {droneDeployReason, deployDrone, recallDrone, loseDrone, damageSystem, hurt, damageDrone} from '../src/systems.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {emitSound} from '../src/acoustics.js';
import {updateBoat, updateDrone} from '../src/systems.js';
import {rand, bottom} from '../src/mechanics.js';
import {recoveryDock} from '../src/vehicle-status.js';
import {keelLimit} from '../src/hull-contacts.js';
import {elm, sameResults, exact} from './sim-harness.mjs';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';

const SYSTEMS = ['diesel', 'fuelTank', 'batteryBank', 'tubes', 'engine', 'propeller', 'oxygen', 'ballast', 'planes', 'rudder', 'sonar', 'periscope', 'deckgun', 'crew'];
const FIELDS = ['time', 'x', 'y', 'depth', 'heading', 'pitch', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'noise', 'repair', 'collisionCooldown', 'criticalExposure', 'status', 'rng', 'silent',
  'floodAlarm', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'imploded', 'scope', 'collisionHits', 'systems', 'repairLimits', 'drone', 'impacts',
  'weaponSequence', 'events', 'debrief', 'acoustics', 'soundSequence', 'roll', 'cavitation', 'propRpm', 'gunLoudUntil', 'unpoweredSince', 'scopeTravel'];

// Saved patrols from every mission, some with the drone out, sampled as they run.
let patrols;
function systemPatrols() {
  if (patrols) return structuredClone(patrols);
  const states = [];
  for (const m of missions) for (const seed of [7919, 15838]) {
    const s = createGame(m.id, seed, {longPatrol: seed === 15838});
    for (let t = 1; t <= 900; t++) {
      if (t % 300 === 1) { s.targetSpeed = [4, 1, 8][(t / 300) | 0]; s.targetDepth = [12, 60, 30][(t / 300) | 0]; s.scope = s.targetDepth <= 15; }
      if (t === 320) deployDrone(s);
      if (t > 320 && t < 600) { s.drone.targetSpeed = 3; s.drone.targetHeading = (s.drone.targetHeading + 7) % 360; }
      if (t === 520 && seed === 15838) recallDrone(s);
      step(s, .25, {timeRate: 1, observation: s.scope ? 'scope' : undefined});
      if (t % 75 === 0 && s.status === 'patrol') states.push(JSON.parse(save(s)));
    }
  }
  patrols = states;
  return structuredClone(states);
}

// The fields systems can change after a call, and the replay events the
// TypeScript announced to its listener, with every number kept exactly.
function runTypeScript(state, call) {
  const w = restore(JSON.stringify(state)), replay = [];
  assert.ok(w, 'the patrol restores');
  const input = exact(w);
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {result, reports: invalid} = collectInvalidNumbers(() => call(w));
  const picked = Object.fromEntries(FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));
  if (picked.debrief === undefined) picked.debrief = [];
  return {input, output: exact({...picked, replay, invalid}), result};
}

const restorable = () => systemPatrols().filter(s => restore(JSON.stringify(s)) !== null);
const withDrone = (s, drone) => ({...s, drone: {...s.drone, ...drone}});

test('the drone deploy reasons match, for every reason the TypeScript gives', async () => {
  const cases = [];
  for (const s of restorable().filter((_, i) => i % 3 === 0)) {
    const ready = withDrone({...s, speed: 1, depth: 50}, {mode: 'stowed', battery: 80, hull: 90, mobility: 90});
    cases.push(s, ready, {...ready, difficulty: {...s.difficulty, drone: false}}, withDrone(ready, {mode: 'lost', lostReason: ''}), withDrone(ready, {mode: 'lost', lostReason: 'Tether cut.'}),
      withDrone(ready, {mode: 'remote'}), {...ready, speed: -3.5}, {...ready, speed: 3}, {...ready, depth: 280.5}, {...ready, depth: 280}, withDrone(ready, {battery: 14.9}),
      withDrone(ready, {hull: 19}), withDrone(ready, {mobility: 19.99}));
  }
  const runs = cases.map(c => runTypeScript(c, w => droneDeployReason(w)));
  assert.ok(new Set(runs.map(r => r.result)).size >= 8, 'every reason occurs');
  sameResults(await elm('systems.droneDeployReason', runs.map(r => [r.input])), runs.map(r => r.result));
});

test('deploying, recalling and losing the drone match', async () => {
  const deploys = [], recalls = [], losses = [];
  for (const s of restorable().filter((_, i) => i % 2 === 0)) {
    const ready = withDrone({...s, speed: 1, depth: 50}, {mode: 'stowed', battery: 80, hull: 90, mobility: 90});
    deploys.push(runTypeScript(ready, deployDrone), runTypeScript({...ready, speed: 5}, deployDrone), runTypeScript({...ready, status: 'won'}, deployDrone));
    // The drone at points around the boat, over shallow and deep water.
    for (const [side, forward, depth] of [[12, 3, 50], [9, 23.9, 50], [8.9, 0, 50], [12, 24, 50], [-15, -30, 200], [20, 0, 9], [20, 0, 12], [20, 0, 300]]) {
      const a = s.heading * Math.PI / 180;
      const drone = {mode: 'remote', x: s.x + Math.cos(a) * side + Math.sin(a) * forward, y: s.y - Math.sin(a) * side + Math.cos(a) * forward, depth: depth + 1};
      recalls.push(runTypeScript(withDrone({...s, depth}, drone), recallDrone));
    }
    recalls.push(runTypeScript(withDrone(s, {mode: 'stowed'}), recallDrone));
    const limit = Math.min(279, bottom(s.x, s.y, s.environment.chartSeed) - 1);
    if (limit - 8.5 > 0) recalls.push(runTypeScript(withDrone({...s, depth: limit - 8.5}, {mode: 'remote', x: s.x, y: s.y, depth: limit - 8}), recallDrone));
    for (const mode of ['remote', 'return', 'lost', 'stowed']) losses.push(runTypeScript(withDrone(s, {mode, speed: 2, targetSpeed: 3}), w => loseDrone(w, 'Link severed.')));
  }
  assert.ok(deploys.some(r => r.result) && deploys.some(r => !r.result), 'deploys succeed and fail');
  assert.ok(new Set(recalls.map(r => r.output.drone.returnStage + '/' + r.output.drone.returnClearance)).size >= 3, 'stages and clearances vary');
  sameResults(await elm('systems.deployDrone', deploys.map(r => [r.input])), deploys.map(r => [r.output, r.result]));
  sameResults(await elm('systems.recallDrone', recalls.map(r => [r.input])), recalls.map(r => r.output));
  sameResults(await elm('systems.loseDrone', losses.map(r => [r.input, 'Link severed.'])), losses.map(r => r.output));
});

test('damage to each system matches, with its side effects and log lines', async () => {
  const runs = [];
  const bases = restorable().filter((_, i) => i % 5 === 0);
  for (const [i, s] of bases.entries()) for (const key of SYSTEMS) for (const amount of [0, -1, NaN, Infinity, 5, 30, 55, 150]) {
    const state = i % 3 === 0 ? {...s, systems: {...s.systems, [key]: 62}, scope: true, scopeTravel: .5} : i % 3 === 1 ? {...s, systems: {...s.systems, [key]: 21}, fuel: 0} : s;
    runs.push({args: [key, amount], ...runTypeScript(state, w => damageSystem(w, key, amount))});
  }
  const texts = runs.flatMap(r => r.output.events.map(e => e.text));
  for (const phrase of ['destroyed. Beyond onboard repair.', ' offline.', 'damaged. Performance reduced.', 'Fuel tank leaking.']) assert.ok(texts.some(t => t.includes(phrase)), phrase);
  sameResults(await elm('systems.damageSystem', runs.map(r => [r.input, ...r.args])), runs.map(r => r.output));
});

test('hurting the boat matches: hull, flooding, section hits, cook-offs and losses', async () => {
  const runs = [];
  const bases = restorable().filter((_, i) => i % 4 === 1);
  let n = 0;
  for (const s of bases) for (const amount of [0, -3, NaN, Infinity, -Infinity, 1, 1.9, 2, 10, 30, 60]) for (const subsystem of [null, 'sonar']) for (const at of [null, 20, 0, -20]) {
    n++;
    const a = s.heading * Math.PI / 180, point = at === null ? null : {x: s.x + Math.sin(a) * at, y: s.y + Math.cos(a) * at, depth: s.depth};
    const state = {...s, rng: (n * 2654435761) | 0, difficulty: {...s.difficulty, damage: [undefined, 1, -1][n % 3]}, status: n % 17 === 0 ? 'won' : s.status, hull: n % 11 === 0 ? 4 : s.hull, flood: n % 5 === 0 ? 24.5 : s.flood};
    runs.push({args: [amount, 'Test impact.', subsystem, point], ...runTypeScript(state, w => hurt(w, amount, 'Test impact.', subsystem, point))});
  }
  // Cook-offs are rare (2.5% of large bow hits), so draw many.
  for (const s of bases) for (let k = 0; k < 60; k++) {
    const a = s.heading * Math.PI / 180, point = {x: s.x + Math.sin(a) * 22, y: s.y + Math.cos(a) * 22, depth: s.depth};
    runs.push({args: [40, 'Bow hit.', null, point], ...runTypeScript({...s, rng: (k * 40503 + 17) | 0}, w => hurt(w, 40, 'Bow hit.', null, point))});
  }
  assert.ok(runs.some(r => r.output.cookoff && !r.input.cookoff), 'a cook-off happens');
  assert.ok(runs.some(r => r.output.status === 'lost' && !r.output.cookoff), 'a breach loses the boat');
  assert.ok(runs.some(r => r.output.events.some(e => /^(BOW|MIDSHIPS|STERN) hit/.test(e.text))), 'section hits are logged');
  // A hit with no finite size once left NaN hulls and flooding; it now changes nothing.
  const phantom = runs.filter(r => !Number.isFinite(r.args[0]));
  assert.ok(phantom.length > 100 && phantom.every(r => Object.is(r.output.outerHull, r.input.outerHull) && Object.is(r.output.flood, r.input.flood) && r.output.events.length === r.input.events.length), 'hits of no finite size change nothing');
  assert.ok(phantom.every(r => r.output.invalid.length === 1 && r.output.invalid[0].where === 'hurt') && runs.every(r => Number.isFinite(r.args[0]) === !r.output.invalid.length), 'and each is reported, the rest not');
  sameResults(await elm('systems.hurt', runs.map(r => [r.input, ...r.args])), runs.map(r => r.output));
});

test('damage to the drone matches, through to its loss', async () => {
  const runs = [];
  for (const s of restorable().filter((_, i) => i % 3 === 2)) for (const mode of ['remote', 'return', 'stowed']) for (const [k, amount] of [0, -2, NaN, Infinity, 4, 35, 120, 260].entries()) {
    runs.push({args: [amount, 'seabed'], ...runTypeScript(withDrone({...s, difficulty: {...s.difficulty, damage: [undefined, -1, 1][k % 3]}}, {mode}), w => damageDrone(w, amount, 'seabed'))});
  }
  assert.ok(runs.some(r => r.output.drone.mode === 'lost' && r.input.drone.mode !== 'lost'), 'a drone is destroyed');
  sameResults(await elm('systems.damageDrone', runs.map(r => [r.input, ...r.args])), runs.map(r => r.output));
});

// Seeds whose first draw falls below a threshold, for rare random events.
const seedsBetween = (low, high, count = 2) => {
  const found = [];
  for (let seed = 1; found.length < count; seed++) { const r = rand({rng: seed}); if (low <= r && r < high) found.push(seed); }
  return found;
};
const seedsBelow = (threshold, count) => {
  const found = [];
  for (let seed = 1; found.length < count; seed++) if (rand({rng: seed}) < threshold) found.push(seed);
  return found;
};

test("the boat's tick matches: motion, plant, seabed, pressure, emergencies, flooding and repairs", async () => {
  const runs = [];
  const tick = (state, dt = .25) => runs.push({dt, ...runTypeScript(state, w => updateBoat(w, dt))});
  const vapor = seedsBelow(-Math.expm1(-.25 * .0015), 6), ignition = seedsBelow(-Math.expm1(-.25 * .85 * .012), 6);
  // With repairs idle the leak does not shrink before the draw, so these seeds sit just either side of each event's exact odds.
  const near = threshold => [seedsBetween(threshold * .9, threshold), seedsBetween(threshold, threshold * 1.4)].flat();
  const vaporEdge = near(-Math.expm1(-.25 * .0015)), ignitionEdge = near(-Math.expm1(-.25 * .9 * .012));
  const all = restorable();
  for (const s of all) tick(s);
  for (const [i, s] of all.filter((_, i) => i % 4 === 0).entries()) {
    const floor = keelLimit(restore(JSON.stringify(s)), s.environment.chartSeed);
    tick(s, 1); tick(s, .1);
    tick({...s, engine: 'electric', depth: 50, battery: 0, fuel: 20}); tick({...s, engine: 'electric', depth: 50, battery: 0, unpoweredSince: Math.max(0, s.time - 130)});
    tick({...s, engine: 'electric', depth: 50, battery: 0, fuel: 0, unpoweredSince: s.time - 5}); tick({...s, battery: 50, unpoweredSince: s.time - 5});
    tick({...s, fuelLeak: .9, repair: 30, fuel: 60, fuelFire: 0, rng: ignition[i % 6]}); tick({...s, fuelLeak: .001, repair: 30});
    tick({...s, fuelFire: 10, fuelLeak: 0, fuel: 40, rng: vapor[i % 6]}); tick({...s, fuelFire: .1, fuelLeak: 0, repair: 30}); tick({...s, fuelFire: 5, fuel: 0, fuelLeak: 0});
    tick({...s, depth: floor + .4, verticalSpeed: 1.5, bottomed: false, speed: 3}); tick({...s, depth: floor + .2, verticalSpeed: .2, bottomed: true, speed: 6, targetSpeed: 6});
    tick({...s, depth: floor - 3, bottomed: true}); tick({...s, depth: 320, targetDepth: 330, verticalSpeed: 3});
    tick({...s, depth: 2, targetDepth: 0, verticalSpeed: -.5}); tick({...s, depth: .5, targetDepth: 0, verticalSpeed: -1});
    tick({...s, water: 75}); tick({...s, hull: 0}); tick({...s, water: 69.99, flood: 25, repair: 0}); tick({...s, water: 5, flood: 8, repair: 0, floodAlarm: false});
    tick({...s, oxygen: 0}); tick({...s, scope: true, scopeTravel: 1, depth: 20}); tick({...s, silent: true, gunLoudUntil: s.time + 5, targetSpeed: 12});
    tick({...s, targetHeading: (s.heading + 170) % 360, speed: 6}); tick({...s, targetSpeed: -3, speed: 1}); tick({...s, systems: {...s.systems, crew: 0, rudder: 0, ballast: 0, planes: 0}});
    tick({...s, repair: 20, hull: 60, flood: 5, systems: {...s.systems, sonar: 40, crew: 70}, repairLimits: {...s.repairLimits, hull: 80, sonar: 90}});
    if (s.time > 121) tick({...s, engine: 'electric', depth: 50, battery: 0, fuel: 20, unpoweredSince: s.time - 120.1});
    tick({...s, water: 4.5, flood: 8, repair: 0, floodAlarm: false});
    tick({...s, depth: floor + .2, verticalSpeed: .2, bottomed: true, speed: 6, targetSpeed: 6, collisionHits: {...s.collisionHits, scrape: Math.max(0, s.time - 25)}});
    for (const seed of vaporEdge) tick({...s, fuelFire: 10, fuelLeak: 0, fuel: 40, repair: 0, rng: seed});
    for (const seed of ignitionEdge) tick({...s, fuelLeak: .9, fuel: 60, fuelFire: 0, repair: 0, rng: seed});
  }
  const before = runs.map(r => r.input), after = runs.map(r => r.output);
  for (const [what, ok] of [['a vapor explosion', (b, a) => a.impacts.length > b.impacts.length], ['a fuel fire starts', (b, a) => !b.fuelFire && a.fuelFire > 0],
    ['a hard landing', (b, a) => a.replay.some(e => e.event.kind === 'ground')], ['power runs out', (b, a) => a.status === 'expired'],
    ['flooding sinks the boat', (b, a) => a.status === 'lost'], ['the flooding alarm sounds', (b, a) => !b.floodAlarm && a.floodAlarm]])
    assert.ok(before.some((b, i) => ok(b, after[i])), what);
  sameResults(await elm('systems.updateBoat', runs.map(r => [r.input, r.dt])), runs.map(r => [r.output, r.result]));
});

test("the drone's tick matches: link, battery, the return lane, collisions, the seabed, pressure waves and recovery", async () => {
  const runs = [];
  const tick = (state, diesel = false, dt = .25) => runs.push({args: [dt, diesel], ...runTypeScript(state, w => updateDrone(w, dt, diesel))});
  const all = restorable();
  for (const s of all) { tick(s, false); tick(s, true); }
  for (const s of all.filter((_, i) => i % 4 === 2)) {
    const a = s.heading * Math.PI / 180, at = (side, forward, down = 0) => ({x: s.x + Math.cos(a) * side + Math.sin(a) * forward, y: s.y - Math.sin(a) * side + Math.cos(a) * forward, depth: s.depth + down});
    const out = drone => withDrone(s, {mode: 'remote', collisionCooldown: 0, ...drone});
    tick(out({...at(0, 75)})); tick(out({...at(0, 70.5)})); tick(out({...at(4, 0), heading: (s.heading + 270) % 360, speed: 1})); tick(out({...at(0, 101)})); tick(out({...at(0, 55), rangeAlarm: true})); tick(out({...at(30, 0), battery: 10.01, speed: 4})); tick(out({...at(30, 0), battery: .001}));
    tick(out({...at(4, 0), heading: (s.heading + 270) % 360, speed: 8})); tick(out({...at(4, 0), heading: (s.heading + 270) % 360, speed: 8, collisionCooldown: 1}));
    tick(out({...at(30, 0), nosePitch: 30, targetSpeed: 5, speed: 4})); tick(out({...at(30, 0), nosePitch: -45, targetSpeed: 0, targetDepth: s.depth + 20}));
    const p = at(30, 0), floor = bottom(p.x, p.y, s.environment.chartSeed);
    tick(out({...p, depth: Math.min(280, floor - .5), speed: 3})); tick(out({...p, depth: Math.min(280, floor - .5), collisionCooldown: 1}));
    const blast = (dx, extra = {}) => ({id: s.soundSequence, time: s.time - 5, type: 'blast', x: p.x + dx, y: p.y, depth: p.depth, power: 1, heard: false, ...extra});
    tick({...out(p), acoustics: [...s.acoustics, blast(50), blast(200, {id: s.soundSequence + 1}), blast(135, {id: s.soundSequence + 3}), blast(20, {id: s.soundSequence + 2, droneHit: true})], soundSequence: s.soundSequence + 4});
    tick({...out(p), acoustics: [...s.acoustics, blast(5, {depth: undefined})], soundSequence: s.soundSequence + 1});
    const beside = (state, p) => ({...state, x: p.x + 40, y: p.y});
    for (const v of s.ships.filter(v => v.hull > 0).slice(0, 2)) tick(beside(out({x: v.x, y: v.y, depth: v.depth || 3, heading: (v.heading + 180) % 360, speed: 6}), v));
    // Just past each hull's capsule end, where its length and radius decide contact.
    for (const v of s.ships.filter(v => v.hull > 0)) {
      const [half, radius] = v.kind === 'carrier' ? [92, 16] : v.kind === 'sub' ? [27.5, 5] : v.kind === 'fishing' ? [19, 5] : [45, 9], h = v.heading * Math.PI / 180;
      for (const along of [half + radius + .2, half + radius + 6]) { const q = {x: v.x + Math.sin(h) * along, y: v.y + Math.cos(h) * along}; tick(beside(out({...q, depth: v.depth || 3, speed: 0}), q)); }
    }
    if (s.site) {
      tick(beside(out({x: s.site.x, y: s.site.y, depth: s.site.depth, speed: 5}), s.site));
      const half = s.site.kind === 'surface' ? 19 : 27.5, h = s.site.heading * Math.PI / 180;
      for (const along of [half + 5.2, half + 6]) { const q = {x: s.site.x + Math.sin(h) * along, y: s.site.y + Math.cos(h) * along}; tick(beside(out({...q, depth: s.site.depth, speed: 0}), q)); }
    }
    const ret = drone => out({mode: 'return', returnClearance: 8, returnHoldSide: 20, returnHoldForward: 0, ...drone});
    tick(ret({...at(20, 0, 8), returnStage: 0})); tick(ret({...at(14, 0, 8.5), returnStage: 1})); tick(ret({...at(14, 1, 2.5), returnStage: 2})); tick(ret({...at(14, 1, 3.1), returnStage: 2}));
    tick({...ret({...at(14, 0, 2.5), returnStage: 3}), speed: 1}); tick({...ret({...at(14, 0, 2.5), returnStage: 3}), speed: 5, targetHeading: (s.heading + 60) % 360});
    const dock = recoveryDock({...s, roll: s.roll ?? 0});
    tick({...ret({...dock, returnStage: 3}), speed: 1}); tick({...ret({...dock, returnStage: 3}), speed: 3.5});
    tick(withDrone({...s, battery: 50}, {mode: 'stowed', battery: 40, hull: 60, lowAlarm: true}), false); tick(withDrone({...s, battery: .5}, {mode: 'stowed', battery: 40}), false);
    tick(withDrone(s, {mode: 'stowed', battery: 99.95, hull: 30}), true); tick(withDrone(s, {mode: 'lost', collisionCooldown: 1.5}));
  }
  const pairs = runs.map(r => [r.input, r.output]);
  for (const [what, ok] of [['the link is lost', (b, a) => b.drone.mode !== 'lost' && a.drone.mode === 'lost'], ['the drone strikes our hull', (b, a) => a.replay.some(e => e.event.kind === 'collision')],
    ['the drone strikes a ship', (b, a) => a.events.some(e => e.text.includes('vessel / wreck'))],
    ['the drone is recovered', (b, a) => b.drone.mode === 'return' && a.drone.mode === 'stowed'], ['a pressure wave strikes', (b, a) => a.events.some(e => e.text.includes('pressure wave'))],
    ['the drone hits the seabed', (b, a) => a.events.some(e => e.text.includes('Drone impact: seabed'))], ['the range alarm sounds', (b, a) => !b.drone.rangeAlarm && a.drone.rangeAlarm],
    ['the low battery alarm sounds', (b, a) => !b.drone.lowAlarm && a.drone.lowAlarm], ['the return lane advances', (b, a) => a.drone.returnStage > b.drone.returnStage]])
    assert.ok(pairs.some(([b, a]) => ok(b, a)), what);
  sameResults(await elm('systems.updateDrone', runs.map(r => [r.input, ...r.args])), runs.map(r => r.output));
});

// Sounds are made with literal powers, so an invalid one means a bug in new
// code; both languages report it as the sound is made, and still make it.
test('making a sound matches, reporting a non-finite or negative power', async () => {
  const runs = [];
  for (const [i, s] of restorable().filter((_, i) => i % 6 === 0).entries()) for (const power of [0, .8, 2, NaN, Infinity, -Infinity, -1]) {
    const data = {type: ['detonation', 'blast', 'creak'][i % 3], x: s.x + 40, y: s.y - 25, depth: 30, power};
    runs.push({data, ...runTypeScript(s, w => emitSound(w, data))});
  }
  assert.ok(runs.some(r => r.output.invalid.length) && runs.some(r => !r.output.invalid.length), 'valid and invalid powers');
  sameResults(await elm('acoustics.emitSound', runs.map(r => [r.input, r.data])), runs.map(r => r.output));
});
