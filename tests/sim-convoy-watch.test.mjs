import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, restore} from '../src/sim.js';
import {setupHenhouse, signalHail, convoyLosses, updateLamp, updateConvoyRaid, resolveConvoyCharge, updateAlliedWatch, validConvoy, validAlliedWatch, stationLamp} from '../src/convoy-watch.js';
import {dropDepthCharge, recordLampContact} from '../src/patrol-contacts.js';
import {environmentAt, hash01} from '../src/environment.js';
import {lampRange, alliedFix, liveTransmission} from '../src/signal-lamp.js';
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
  const saves = [], convoySaves = [], watchSaves = [];
  const convoyBreakers = [
    w => { w.convoy.round = 1.5; }, w => { w.convoy.round = -1; }, w => { w.convoy.number = 2.5; }, w => { w.convoy.number = -1; }, w => { w.convoy.next = -1; },
    w => { if (w.convoy.message) w.convoy.message.estimate.sender = 'wolf'; }, w => { if (w.convoy.message) w.convoy.message.estimate.number += 1; },
    w => { if (w.convoy.pin) w.convoy.pin.number = w.convoy.number + 1; }, w => { if (w.convoy.pin) w.convoy.pin.sender = 'plover'; },
    w => { if (w.convoy.shot) w.convoy.shot.source = 'escort'; }, w => { if (w.convoy.shot) w.convoy.shot.target = 'wolf'; }, w => { if (w.convoy.shot) w.convoy.shot.underwater = false; },
    w => { if (w.convoy.shot) w.convoy.shot.id = w.weaponSequence; }, w => { if (w.convoy.shot) w.convoy.shot.arrives = w.time; }, w => { if (w.convoy.shot) w.convoy.shot.damage = -1; },
    w => { w.ships.find(v => v.id === 'plover').settled = false; }, w => { w.ships.find(v => v.id === 'plover').hull = 5; }, w => { w.ships.find(v => v.id === 'plover').wreckMark.observed = false; },
    w => { w.ships = w.ships.filter(v => v.id !== 'petrel'); }, w => { w.ships.find(v => v.id === 'wolf').side = 'friendly'; }, w => { w.ships.find(v => v.id === 'escort').kind = 'merchant'; },
    w => { w.ships.push({...structuredClone(w.ships[0]), id: 'stray'}); }, w => { w.convoy = null; }, w => { delete w.convoy; },
    // A count that is not whole with no telegram to compare it against, and incidental traffic, which the cast check skips.
    w => { Object.assign(w.convoy, {number: 2.5, message: null, pin: null}); },
    w => { const copy = structuredClone(w.ships.find(v => v.id === 'dahlia')); delete copy.lampFix; w.ships.push({...copy, id: 'stray-merchant', incidental: true}); },
  ];
  const watchBreakers = [
    w => { if (w.alliedLamp) w.alliedLamp.sequence = 1.5; }, w => { if (w.alliedLamp) w.alliedLamp.lastIssue = -2; }, w => { if (w.alliedLamp) w.alliedLamp.lastIssue = w.time + 1; },
    w => { if (w.alliedLamp?.message) w.alliedLamp.message.estimate.number = w.alliedLamp.sequence + 1; }, w => { if (w.alliedLamp?.message) w.alliedLamp.message.estimate.target = w.ships.find(v => v.kind !== 'sub').id; },
    w => { const v = w.ships.find(v => v.lampFix); if (v) v.lampFix.sender = 'nobody'; }, w => { delete w.alliedLamp; }, w => { w.alliedLamp = null; },
    // A ship holding another friendly ship's fix.
    w => { const v = w.ships.find(v => v.lampFix), other = w.ships.find(x => x.side === 'friendly' && x.kind !== 'sub' && x.id !== v?.id); if (v && other) v.lampFix.sender = other.id; },
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
        convoySaves.push(exact(w));
        watchSaves.push(exact(w));
        for (const breaker of convoyBreakers) { const bad = structuredClone(exact(w)); breaker(bad); convoySaves.push(bad); }
        for (const breaker of watchBreakers) { const bad = structuredClone(exact(w)); breaker(bad); watchSaves.push(bad); }
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

// Edges the played patrols rarely reach: the hail's depth and reach by day and
// night, the lamp's depth, range and a damaged periscope, a torpedo arriving
// on the tick or at a ship already sunk, a disabled escort, charges at the edge
// of reach and odds, and the allied watch's sweeps, fix freshness, standing
// messages, waiting for the convoy's own report and a watch not yet begun.
test('the convoy\'s and the allied watch\'s constructed edges match', async () => {
  const lamps = [], raids = [], charges = [], allied = [];
  const game = (seed, timeOfDay) => restore(save(createGame('wolf-in-the-henhouse', seed, {weather: 'clear', timeOfDay, changing: false})));
  const place = (w, v, d, deg = 40) => Object.assign(v, {x: w.x + Math.sin(deg * Math.PI / 180) * d, y: w.y + Math.cos(deg * Math.PI / 180) * d});
  const ship = (w, id) => w.ships.find(v => v.id === id);
  const scatter = w => { for (const id of ['wren', 'dahlia', 'petrel', 'escort']) place(w, ship(w, id), 20000); };
  const lamp = (w, look, dt = 1) => { const input = exact(w); lamps.push({input, look: exact(look), dt, expected: run(input, s => updateLamp(s, environmentAt(s), look, dt)).output}); updateLamp(w, environmentAt(w), look, dt); };
  const raid = (w, dt = .25) => { const input = exact(w); raids.push({input, dt, approaching: false, expected: run(input, s => updateConvoyRaid(s, dt, false, dropDepthCharge)).output}); };
  const watch = (w, dt = .25, look = {observation: 'tower', lampInView: null, timeRate: 1}) => { const input = exact(w); allied.push({input, look: exact(look), dt, expected: run(input, s => updateAlliedWatch(s, environmentAt(s), look, dt, recordLampContact)).output}); };
  for (const seed of [3, 4]) for (const timeOfDay of ['day', 'night']) {
    const base = game(seed, timeOfDay), range = lampRange(environmentAt(base));
    // The hail: the boat's depth, and the nearest merchant either side of its reach.
    for (const [depth, d] of [[1, 1000], [1.5, 1000], [2, 1000], ...[3000, 3399, 3401, range * 1.2, range * 1.3, range * 1.34, range * 1.36].map(d => [0, d])]) {
      const w = structuredClone(base);
      Object.assign(w, {depth});
      w.convoy.message = null;
      scatter(w);
      place(w, ship(w, 'dahlia'), d);
      lamp(w, {observation: 'tower', lampInView: 'dahlia', timeRate: 1});
    }
    // Copying: scope and tower depths, the sender either side of the lamp's range, a damaged periscope.
    const hailed = structuredClone(base);
    hailed.depth = 0;
    hailed.convoy.message = null;
    scatter(hailed);
    place(hailed, ship(hailed, 'wren'), 1200);
    updateLamp(hailed, environmentAt(hailed), {}, 1);
    assert.equal(hailed.convoy.message?.estimate.sender, 'wren', 'the wren hails');
    for (const [observation, depth, d, periscope] of [['scope', 15, 1200, 100], ['scope', 15.5, 1200, 100], ['scope', 16, 1200, 100], ['tower', 1, 1200, 100],
      ['tower', 1.5, 1200, 100], ['tower', 0, range - 1, 100], ['tower', 0, range + 1, 100], ['scope', 10, 1200, 0], ['scope', 10, 1200, 19], ['scope', 10, 1200, 20]]) {
      const w = structuredClone(hailed);
      Object.assign(w, {depth, scope: true, scopeTravel: 1});
      w.systems = {...w.systems, periscope};
      place(w, ship(w, 'wren'), d);
      for (let k = 0; k < 3; k++) lamp(w, {observation, lampInView: 'wren', timeRate: 1});
    }
    // The raid: arriving on the tick or just before, at a ship already sunk, and a disabled escort or none.
    const armed = structuredClone(base);
    armed.convoy.next = armed.time;
    updateConvoyRaid(armed, .25, false, dropDepthCharge);
    assert.ok(armed.convoy.shot, 'the hunter fires');
    for (const change of [w => { w.time = w.convoy.shot.arrives; }, w => { w.time = w.convoy.shot.arrives - .1; },
      w => { w.time = w.convoy.shot.arrives; ship(w, w.convoy.shot.target).hull = 0; }, w => { w.time = w.convoy.shot.arrives + 1; w.convoy.shot.damage = 0; }]) {
      const w = structuredClone(armed);
      change(w);
      raid(w);
    }
    for (const disabled of [true, false]) {
      const w = structuredClone(base);
      w.convoy.next = w.time;
      ship(w, 'escort').disabled = disabled;
      raid(w);
    }
    // Charges either side of the reach, and charges either side of the odds.
    const wolf = ship(base, 'wolf'), odds = id => hash01(base.patrol.seed, id + 14600);
    const first = (lo, hi) => { for (let id = 1; ; id++) if (lo <= odds(id) && odds(id) < hi) return id; };
    for (const [d, id] of [[599, first(0, .3)], [625, first(0, .3)], [649, first(0, .3)], [651, first(0, .3)], [100, first(.3, .32)], [100, first(.32, .34)]]) {
      const w = structuredClone(base), charge = {x: wolf.x + d, y: wolf.y, id};
      charges.push({input: exact(w), charge, expected: run(exact(w), s => resolveConvoyCharge(s, charge)).output});
    }
    // The allied watch on a quiet chart ten minutes in, between beats: the hunter far off and no fix held.
    const quiet = structuredClone(base);
    Object.assign(quiet, {depth: 0, time: 600.1});
    quiet.convoy.message = null;
    for (const v of quiet.ships) delete v.lampFix;
    place(quiet, ship(quiet, 'wolf'), 30000, 200);
    quiet.alliedLamp = {message: null, sequence: 4, lastIssue: -1};
    // A sweep heard either side of its reach, on the wren's beat.
    const offset = 7 + quiet.ships.findIndex(v => v.id === 'wren') * 6;
    for (const d of [3900, 4100, 4300]) {
      const w = structuredClone(quiet);
      w.difficulty = {...w.difficulty, pingDetection: 1};
      w.time = offset + 36 * Math.ceil((w.time - offset) / 36 + 1);
      place(w, ship(w, 'wren'), d);
      watch(w, .5);
    }
    // A fix offered just inside and past its freshness.
    for (const age of [40, 42, 44.9, 45]) {
      const w = structuredClone(quiet);
      place(w, ship(w, 'wren'), 900);
      ship(w, 'wren').lampFix = alliedFix(ship(w, 'wren'), {...ship(base, 'wolf'), depth: ship(base, 'wolf').depth}, w.time - age, 4);
      watch(w);
    }
    // An uncopied message either side of three minutes.
    for (const age of [170, 175, 179.9, 181]) {
      const w = structuredClone(quiet), fix = alliedFix(ship(w, 'wren'), ship(base, 'wolf'), w.time - age, 4);
      place(w, ship(w, 'wren'), 900);
      w.alliedLamp = {message: liveTransmission(fix), sequence: 4, lastIssue: fix.time};
      watch(w);
    }
    // The convoy's own report being copied, a fresh fix waiting.
    for (const [elapsed, copied, since] of [[10, 0, null], [17, 0, null], [25, 0, null], [25, 1, null], [25, 0, 3]]) {
      const w = structuredClone(quiet);
      place(w, ship(w, 'dahlia'), 900);
      updateLamp(w, environmentAt(w), {}, 1);
      assert.ok(w.convoy.message, 'the convoy hails');
      Object.assign(w.convoy.message, {elapsed, copied, since: since === null ? null : w.time - since, delivered: false});
      place(w, ship(w, 'wren'), 1000, 80);
      ship(w, 'wren').lampFix = alliedFix(ship(w, 'wren'), ship(base, 'wolf'), w.time - 5, 4);
      watch(w);
    }
    // A watch not yet begun, with nothing to signal.
    const fresh = structuredClone(quiet);
    delete fresh.alliedLamp;
    watch(fresh);
  }
  assert.ok(allied.filter(c => c.expected.reports.some(r => r.id === 'allied-hail')).length >= 8, 'fresh fixes issued');
  sameResults(await elm('convoyWatch.updateLamp', lamps.map(l => [l.input, l.look, l.dt])), lamps.map(l => l.expected));
  sameResults(await elm('convoyWatch.updateConvoyRaid', raids.map(r => [r.input, r.dt, r.approaching])), raids.map(r => r.expected));
  sameResults(await elm('convoyWatch.resolveConvoyCharge', charges.map(c => [c.input, c.charge])), charges.map(c => c.expected));
  sameResults(await elm('convoyWatch.updateAlliedWatch', allied.map(c => [c.input, c.look, c.dt])), allied.map(c => c.expected));
});
