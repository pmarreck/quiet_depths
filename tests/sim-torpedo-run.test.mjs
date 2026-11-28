import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';
import {putTorpedoInWater, torpedoOrders, updateTorpedoes, MAX_RUN, ARMING_TIME} from '../src/torpedo-run.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The boat's fields the shared harness encodes, as tests/sim-systems.test.mjs picks them.
const FIELDS = ['time', 'x', 'y', 'depth', 'heading', 'pitch', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'noise', 'repair', 'collisionCooldown', 'criticalExposure', 'status', 'rng', 'silent',
  'floodAlarm', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'imploded', 'scope', 'collisionHits', 'systems', 'repairLimits', 'drone', 'impacts',
  'weaponSequence', 'events', 'debrief', 'acoustics', 'soundSequence', 'roll', 'cavitation', 'propRpm', 'gunLoudUntil', 'unpoweredSince', 'scopeTravel'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
const bearingTo = (a, b) => (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
// A ship that gave up its pursuit carries tracking: null in the TypeScript and
// Nothing in Elm; both read as not tracking (as in the ship-record tests).
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

// One torpedo tick in the TypeScript, with the replay events it announced and
// the invalid numbers it refused.
function tick(input, dt) {
  const w = structuredClone(input), replay = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {reports: invalid} = collectInvalidNumbers(() => updateTorpedoes(w, dt));
  const picked = Object.fromEntries(FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));
  if (picked.debrief === undefined) picked.debrief = [];
  return {state: w, output: exact({...picked, ships: w.ships.map(shipOut), projectiles: w.projectiles, aircraft: w.aircraft, airSupport: w.airSupport, reports: w.reports, replay, invalid})};
}

const surfaceDepth = ship => ship.kind === 'sub' ? ship.depth ?? 65 : 3;

// Torpedoes in the water on six missions: the boat's, aimed with some error
// at merchants, escorts, submarines, neutrals, friends and the carrier, and
// enemies', aimed near the boat from a ship or laid as a mine, now and then
// with a noisemaker out. Ships and the boat move between ticks.
let corpus = null;
function runs() {
  if (corpus) return corpus;
  corpus = [];
  const random = seeded(141);
  for (const [k, mission] of ['recon', 'intercept', 'big-kahuna', 'seek-and-destroy-sub', 'tiebreaker', 'seek-and-destroy'].entries()) for (const seed of [5, 23]) {
    const w = restore(save(createGame(mission, seed + k, {weather: 'clear', timeOfDay: 'day', changing: false, difficulty: {airSupport: true}})));
    w.runSetting = pick(random, [600, 1500, MAX_RUN]);
    w.difficulty = {...w.difficulty, damage: pick(random, [0, 0, -1, 1])};
    const afloat = () => w.ships.filter(v => v.hull > 0);
    const anchor = pick(random, afloat());
    const a = random() * Math.PI * 2, d = 700 + random() * 900;
    Object.assign(w, {x: anchor.x + Math.sin(a) * d, y: anchor.y + Math.cos(a) * d, depth: pick(random, [12, 30, 60]), speed: 2, heading: random() * 360, scope: false});
    for (let step = 0; step < 120; step++) {
      if (step % 30 === 0) {
        for (let n = 0; n < 2; n++) {
          const target = pick(random, afloat());
          if (!target) break;
          const heading = (bearingTo(w, target) + (random() - .5) * pick(random, [0, 10, 40]) + 360) % 360, tubeSide = pick(random, [-1, 0, 1]);
          putTorpedoInWater(w, 'player', {x: w.x, y: w.y, depth: w.depth}, heading, surfaceDepth(target),
            {intended: target.id, heading: (heading + tubeSide * 20 + 360) % 360, pitch: tubeSide ? pick(random, [-.2, .1]) : 0, tubeSide, runOut: pick(random, [0, 200, 600])});
        }
        const hostile = afloat().filter(v => v.military && v.side !== 'friendly');
        if (hostile.length) {
          const ship = pick(random, hostile), aim = {x: w.x + (random() - .5) * pick(random, [0, 60, 400]), y: w.y + (random() - .5) * pick(random, [0, 60, 400])};
          const origin = {x: ship.x, y: ship.y, depth: surfaceDepth(ship)};
          // Now and then another military ship closes on the boat, where a torpedo the
          // noisemaker diverts can lock on to her.
          const escort = afloat().find(v => v.military && v !== ship);
          if (escort && random() < .5) { const b = random() * Math.PI * 2; escort.x = w.x + Math.sin(b) * 400; escort.y = w.y + Math.cos(b) * 400; }
          if (random() < .3) putTorpedoInWater(w, 'enemy', {...aim, x: aim.x + 300, depth: w.depth}, bearingTo({x: aim.x + 300, y: aim.y}, aim), w.depth, {age: ARMING_TIME, launcher: random() < .5 ? null : ship.id, aim});
          else putTorpedoInWater(w, 'enemy', origin, bearingTo(origin, aim), w.depth, {heading: ship.heading, tubeSide: pick(random, [-1, 0, 1]), launcher: ship.id, aim});
        }
        if (random() < .6) w.noisemaker = {x: w.x, y: w.y, depth: w.depth, heading: w.heading, speed: 0, time: w.time};
      }
      const dt = pick(random, [.25, .5, 1]);
      w.time += dt;
      for (const v of afloat()) { const r = v.heading * Math.PI / 180; v.x += Math.sin(r) * v.speed * .514444 * dt; v.y += Math.cos(r) * v.speed * .514444 * dt; }
      w.x += Math.sin(w.heading * Math.PI / 180) * w.speed * .514444 * dt; w.y += Math.cos(w.heading * Math.PI / 180) * w.speed * .514444 * dt;
      // The rest of the patrol consumes sounds and impacts.
      w.acoustics = w.acoustics.slice(-16); w.impacts = w.impacts.slice(-8);
      const input = exact(w), {state, output} = tick(input, dt);
      corpus.push({input, dt, output});
      for (const key of Object.keys(state)) w[key] = state[key];
      if (w.status !== 'patrol') break;
    }
  }
  return corpus;
}

test('torpedo runs match tick by tick: homing, searching, decoys, noisemakers and every kind of strike', async () => {
  const calls = runs(), outs = calls.map(c => c.output);
  const texts = new Set(outs.flatMap(o => o.debrief.map(e => e.text)));
  for (const text of ['An incoming torpedo struck your sub.', 'A torpedo followed a submarine decoy, passed it, then resumed its search.'])
    assert.ok(texts.has(text), 'a debrief line: ' + text);
  for (const fragment of ['(direct hit ', 'struck the friendly ', 'the neutral '])
    assert.ok([...texts].some(t => t.includes(fragment)), 'a strike: ' + fragment);
  const events = outs.flatMap(o => o.replay.map(r => r.event));
  assert.ok(events.some(e => e.enemy === true) && events.some(e => e.enemy === false && e.target) && events.some(e => !e.target), 'strikes on ships by both sides and on the boat');
  const torpedoes = outs.flatMap(o => o.projectiles);
  assert.ok(torpedoes.some(p => p.lock) && torpedoes.some(p => p.decoyTarget) && torpedoes.some(p => p.diverted) && torpedoes.some(p => p.decoyCheckedAt !== undefined), 'locks, decoys and diversions');
  assert.ok(outs.some(o => o.reports.some(r => r.id.startsWith('run-'))), 'a run ended at its distance limit');
  assert.ok(outs.some((o, i) => o.airSupport.status !== calls[i].input.airSupport.status), 'a carrier strike scrambling aircraft');
  sameResults(await elm('torpedoRun.updateTorpedoes', calls.map(c => [c.input, c.dt])), outs);
});

test('a fresh run\'s orders and a torpedo put in the water match', async () => {
  const random = seeded(142), calls = runs().filter((_, i) => i % 40 === 0);
  const orders = calls.flatMap(c => [1, 2, 7, 99, 1234].map(id => [c.input, id, random() * 360, pick(random, [3, 40])]));
  sameResults(await elm('torpedoRun.torpedoOrders', orders.map(([s, ...rest]) => [{patrol: s.patrol}, ...rest])), orders.map(([s, ...rest]) => exact(torpedoOrders(s, ...rest))));
  const launches = calls.flatMap(c => [
    [c.input, 'player', {x: c.input.x, y: c.input.y, depth: c.input.depth}, 90, 3, {intended: c.input.ships[0].id, heading: 110, pitch: .1, tubeSide: 1, runOut: 200}],
    [c.input, 'enemy', {x: c.input.x + 900, y: c.input.y, depth: 3}, 270, 40, {heading: 250, tubeSide: -1, launcher: c.input.ships[0].id, aim: {x: c.input.x, y: c.input.y}}],
    [c.input, 'enemy', {x: c.input.x, y: c.input.y + 300, depth: 30}, 180, 30, {age: ARMING_TIME, launcher: null, aim: {x: c.input.x, y: c.input.y}}],
  ]);
  const expected = launches.map(([s, ...rest]) => { const w = structuredClone(s); const shot = putTorpedoInWater(w, ...rest); return exact([shot, w.weaponSequence, w.projectiles]); });
  sameResults(await elm('torpedoRun.putTorpedoInWater', launches), expected);
});
