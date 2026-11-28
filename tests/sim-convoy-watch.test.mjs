import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, restore} from '../src/sim.js';
import {setupHenhouse, signalHail, convoyLosses, updateLamp, updateConvoyRaid, resolveConvoyCharge, updateAlliedWatch, validConvoy, validAlliedWatch, stationLamp} from '../src/convoy-watch.js';
import {dropDepthCharge, recordLampContact} from '../src/patrol-contacts.js';
import {environmentAt} from '../src/environment.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The boat's fields the shared harness encodes, as tests/sim-combat.test.mjs picks them.
const FIELDS = ['time', 'x', 'y', 'depth', 'heading', 'pitch', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'noise', 'repair', 'collisionCooldown', 'criticalExposure', 'status', 'rng', 'silent',
  'floodAlarm', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'imploded', 'scope', 'collisionHits', 'systems', 'repairLimits', 'drone', 'impacts',
  'weaponSequence', 'events', 'debrief', 'acoustics', 'soundSequence', 'roll', 'cavitation', 'propRpm', 'gunLoudUntil', 'unpoweredSince', 'scopeTravel'];
const MORE = ['ships', 'reports', 'blasts', 'contacts', 'nextId'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

function run(input, call) {
  const w = structuredClone(input), replay = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {result, reports: invalid} = collectInvalidNumbers(() => call(w));
  const picked = Object.fromEntries(FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));
  if (picked.debrief === undefined) picked.debrief = [];
  const extra = Object.fromEntries(['convoy', 'alliedLamp'].filter(k => w[k]).map(k => [k, w[k]]));
  return {result, state: w, output: exact({...picked, ...Object.fromEntries(MORE.map(k => [k, w[k]])), ...extra, ships: w.ships.map(shipOut), replay, invalid})};
}

const henhouse = seed => restore(save(createGame('wolf-in-the-henhouse', seed, {weather: 'clear', timeOfDay: pick(seeded(seed), ['day', 'dusk', 'night']), changing: false})));

test('the convoy\'s lamp and the hunter\'s raid match as the boat surfaces, dives and watches the lamp', async () => {
  const random = seeded(181), lamps = [], raids = [], charges = [];
  for (const seed of [3, 4, 5, 6]) {
    const w = henhouse(seed), resolved = new Set();
    for (let n = 0; n < 500; n++) {
      const dt = pick(random, [.25, .5, 1]);
      w.time += dt;
      // Long steady stretches surfaced with the binoculars on the sender, so
      // messages copy in full, between stretches of every other condition.
      const steady = Math.floor(n / 100) % 2 === 0;
      if (steady) Object.assign(w, {depth: 0, scope: true});
      else if (n % 40 === 0) Object.assign(w, {depth: pick(random, [0, 0, 1, 10, 20]), scope: random() < .8});
      const sender = w.convoy.message?.estimate.sender ?? pick(random, ['wren', 'dahlia', 'petrel', 'escort']);
      const input = steady ? {observation: 'tower', lampInView: sender, timeRate: 1}
        : {observation: pick(random, ['scope', 'scope', 'tower', 'tower', undefined]), lampInView: random() < .85 ? sender : pick(random, [null, 'wolf']), timeRate: pick(random, [1, 1, 4, 0, undefined])};
      const before = exact(w), lamp = run(before, s => updateLamp(s, environmentAt(s), input, dt));
      lamps.push({input: before, look: input, dt, expected: lamp.output});
      updateLamp(w, environmentAt(w), input, dt);
      const approaching = n < 30 && random() < .5, raidInput = exact(w), raid = run(raidInput, s => updateConvoyRaid(s, dt, approaching, dropDepthCharge));
      raids.push({input: raidInput, dt, approaching, expected: raid.output});
      updateConvoyRaid(w, dt, approaching, dropDepthCharge);
      for (const b of w.blasts.filter(b => b.convoyCharge && !resolved.has(b.id))) {
        resolved.add(b.id);
        const at = exact(w), charge = {x: b.x + pick(random, [0, 300, 900]), y: b.y, id: b.id};
        charges.push({input: at, charge, expected: run(at, s => resolveConvoyCharge(s, charge)).output});
      }
      if (n % 7 === 0) w.blasts = w.blasts.slice(-4);
      w.acoustics = w.acoustics.slice(-12);
    }
  }
  const reports = new Set(lamps.flatMap(l => l.expected.reports.map(r => r.id.replace(/-\d+$/, ''))));
  for (const id of ['convoy-hail', 'telegram']) assert.ok(reports.has(id), 'a report: ' + id);
  assert.ok(raids.some(r => r.expected.debrief.some(e => e.text.startsWith('The hunter struck'))), 'the hunter strikes');
  assert.ok(raids.some(r => r.expected.blasts.some(b => b.convoyCharge)), 'the escort answers');
  sameResults(await elm('convoyWatch.updateLamp', lamps.map(l => [l.input, exact(l.look), l.dt])), lamps.map(l => l.expected));
  sameResults(await elm('convoyWatch.updateConvoyRaid', raids.map(r => [r.input, r.dt, r.approaching])), raids.map(r => r.expected));
  sameResults(await elm('convoyWatch.resolveConvoyCharge', charges.map(c => [c.input, c.charge])), charges.map(c => c.expected));
});

test('the allied lamp watch matches on the fleet action and in the henhouse', async () => {
  const random = seeded(182), calls = [];
  for (const [mission, seed] of [['tiebreaker', 7], ['tiebreaker', 8], ['wolf-in-the-henhouse', 9]]) {
    const s = createGame(mission, seed, {weather: 'clear', timeOfDay: 'day', changing: false});
    for (let t = 0; t < 200; t++) step(s, .25, {timeRate: 1, observation: 'tower'});
    const w = restore(save(s));
    // Friendly ships near the boat, each with a hostile submarine in reach of
    // her sonar, so fixes are made and signaled.
    const hostiles = w.ships.filter(v => v.kind === 'sub' && v.side === 'hostile');
    w.ships.filter(v => v.side === 'friendly' && v.kind !== 'sub').forEach((v, i) => {
      Object.assign(v, {x: w.x + 600 + i * 300, y: w.y + 400 - i * 250, hull: Math.max(v.hull, 50), disabled: false});
      const sub = hostiles[i % Math.max(1, hostiles.length)];
      if (sub) Object.assign(sub, {x: v.x + 700, y: v.y + 300, hull: Math.max(sub.hull, 50)});
    });
    for (let n = 0; n < 400; n++) {
      const dt = pick(random, [.25, .5, 1, 2]);
      w.time += dt;
      const steady = Math.floor(n / 80) % 2 === 0;
      if (steady) Object.assign(w, {depth: 0, scope: true});
      else if (n % 50 === 0) Object.assign(w, {depth: pick(random, [0, 0, 1, 12]), scope: true});
      const sender = w.alliedLamp?.message?.estimate.sender ?? null;
      const input = steady ? {observation: 'tower', lampInView: sender, timeRate: 1}
        : {observation: pick(random, ['tower', 'tower', 'scope', undefined]), lampInView: random() < .85 ? sender : null, timeRate: pick(random, [1, 2, undefined])};
      const before = exact(w), {output} = run(before, x => updateAlliedWatch(x, environmentAt(x), input, dt, recordLampContact));
      calls.push({input: before, look: input, dt, expected: output});
      updateAlliedWatch(w, environmentAt(w), input, dt, recordLampContact);
      w.acoustics = w.acoustics.slice(-12);
    }
  }
  const reports = new Set(calls.flatMap(c => c.expected.reports.map(r => r.id)));
  assert.ok(reports.has('allied-hail') && reports.has('allied-fix'), 'hails and plotted fixes');
  sameResults(await elm('convoyWatch.updateAlliedWatch', calls.map(c => [c.input, exact(c.look), c.dt])), calls.map(c => c.expected));
});

test('the henhouse\'s setup, hails and losses match', async () => {
  const worlds = [3, 11, 19, 27].map(seed => exact(restore(save(createGame('recon', seed)))));
  sameResults(await elm('convoyWatch.setupHenhouse', worlds.map(w => [w])), worlds.map(w => run(w, s => setupHenhouse(s)).output));
  const hails = [0, 99, 100, 1234.5, 3450, 9999].map(range => [{name: 'Wren'}, range]);
  sameResults(await elm('convoyWatch.signalHail', hails), hails.map(([ship, range]) => signalHail(ship, range)));
  const losing = [5, 6].map(seed => { const w = henhouse(seed); w.ships.forEach((v, i) => { if (i % 2) v.hull = 0; }); return exact(w); });
  sameResults(await elm('convoyWatch.convoyLosses', losing.map(w => [w])), losing.map(w => convoyLosses(w)));
});

// Saved patrols from played henhouse and fleet-action runs, each also damaged
// one way, checked as restore and the missions check them.
test('saved convoys and allied watches are kept and refused as the TypeScript does, and the station lamp matches', async () => {
  // Each check sees saves damaged only in what it checks: a field of the wrong
  // type anywhere fails the whole restore in both languages.
  const random = seeded(183), saves = [], convoySaves = [], watchSaves = [];
  const convoyBreakers = [
    w => { w.convoy.round = 1.5; }, w => { w.convoy.round = -1; }, w => { w.convoy.number = 2.5; }, w => { w.convoy.number = -1; }, w => { w.convoy.next = -1; },
    w => { if (w.convoy.message) w.convoy.message.estimate.sender = 'wolf'; }, w => { if (w.convoy.message) w.convoy.message.estimate.number += 1; },
    w => { if (w.convoy.pin) w.convoy.pin.number = w.convoy.number + 1; }, w => { if (w.convoy.pin) w.convoy.pin.sender = 'plover'; },
    w => { if (w.convoy.shot) w.convoy.shot.source = 'escort'; }, w => { if (w.convoy.shot) w.convoy.shot.target = 'wolf'; }, w => { if (w.convoy.shot) w.convoy.shot.underwater = false; },
    w => { if (w.convoy.shot) w.convoy.shot.id = w.weaponSequence; }, w => { if (w.convoy.shot) w.convoy.shot.arrives = w.time; }, w => { if (w.convoy.shot) w.convoy.shot.damage = -1; },
    w => { w.ships.find(v => v.id === 'plover').settled = false; }, w => { w.ships.find(v => v.id === 'plover').hull = 5; }, w => { w.ships.find(v => v.id === 'plover').wreckMark.observed = false; },
    w => { w.ships = w.ships.filter(v => v.id !== 'petrel'); }, w => { w.ships.find(v => v.id === 'wolf').side = 'friendly'; }, w => { w.ships.find(v => v.id === 'escort').kind = 'merchant'; },
    w => { w.ships.push({...structuredClone(w.ships[0]), id: 'stray'}); }, w => { w.convoy = null; }, w => { delete w.convoy; },
  ];
  const watchBreakers = [
    w => { if (w.alliedLamp) w.alliedLamp.sequence = 1.5; }, w => { if (w.alliedLamp) w.alliedLamp.lastIssue = -2; }, w => { if (w.alliedLamp) w.alliedLamp.lastIssue = w.time + 1; },
    w => { if (w.alliedLamp?.message) w.alliedLamp.message.estimate.number = w.alliedLamp.sequence + 1; }, w => { if (w.alliedLamp?.message) w.alliedLamp.message.estimate.target = w.ships.find(v => v.kind !== 'sub').id; },
    w => { const v = w.ships.find(v => v.lampFix); if (v) v.lampFix.sender = 'nobody'; }, w => { delete w.alliedLamp; }, w => { w.alliedLamp = null; },
  ];
  for (const seed of [3, 4]) {
    const w = henhouse(seed);
    for (let n = 0; n < 300; n++) {
      w.time += .5;
      Object.assign(w, {depth: 0, scope: true});
      updateLamp(w, environmentAt(w), {observation: 'tower', lampInView: w.convoy.message?.estimate.sender ?? null, timeRate: 1}, .5);
      updateConvoyRaid(w, .5, false, dropDepthCharge);
      updateAlliedWatch(w, environmentAt(w), {observation: 'tower', lampInView: w.alliedLamp?.message?.estimate.sender ?? null, timeRate: 1}, .5, recordLampContact);
      w.acoustics = w.acoustics.slice(-12);
      if (n % 15 === 0) {
        saves.push(exact(w));
        const badConvoy = structuredClone(exact(w)), badWatch = structuredClone(exact(w));
        pick(random, convoyBreakers)(badConvoy);
        pick(random, watchBreakers)(badWatch);
        convoySaves.push(exact(w), badConvoy);
        watchSaves.push(exact(w), badWatch);
      }
    }
  }
  const expected = (list, check) => list.map(w => { try { return check(structuredClone(w)) === true; } catch { return false; } });
  const convoyOk = expected(convoySaves, validConvoy), watchOk = expected(watchSaves, validAlliedWatch);
  assert.ok(convoyOk.filter(Boolean).length > 10 && convoyOk.filter(v => !v).length > 10, 'convoys kept and refused');
  assert.ok(watchOk.filter(Boolean).length > 5 && watchOk.filter(v => !v).length > 5, 'allied watches kept and refused');
  sameResults(await elm('convoyWatch.validConvoy', convoySaves.map(w => [w])), convoyOk);
  sameResults(await elm('convoyWatch.validAlliedWatch', watchSaves.map(w => [w])), watchOk);
  sameResults(await elm('convoyWatch.stationLamp', saves.map(w => [w])), saves.map(w => exact(stationLamp(w) ?? null)));
});
