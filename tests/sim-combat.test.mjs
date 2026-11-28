import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, restore} from '../src/sim.js';
import {chargeAltitude, firingBearing, launchTorpedo, launchHostileTorpedo, restoreIncomingRun, restoreTorpedo, fireDeckGun, aimGunAt, updateCombat} from '../src/combat.js';
import {putTorpedoInWater} from '../src/torpedo-run.js';
import {floorSurface} from '../src/seafloor.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The boat's fields the shared harness encodes, as tests/sim-systems.test.mjs picks them.
const FIELDS = ['time', 'x', 'y', 'depth', 'heading', 'pitch', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'noise', 'repair', 'collisionCooldown', 'criticalExposure', 'status', 'rng', 'silent',
  'floodAlarm', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'imploded', 'scope', 'collisionHits', 'systems', 'repairLimits', 'drone', 'impacts',
  'weaponSequence', 'events', 'debrief', 'acoustics', 'soundSequence', 'roll', 'cavitation', 'propRpm', 'gunLoudUntil', 'unpoweredSince', 'scopeTravel'];
const MORE = ['projectiles', 'aircraft', 'airSupport', 'blasts', 'gunRounds', 'reports', 'tubeReadyAt', 'gun', 'crewQuietUntil'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
const bearingTo = (a, b) => (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
// A ship that gave up its pursuit carries tracking: null in the TypeScript and
// Nothing in Elm; both read as not tracking (as in the ship-record tests).
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

// A call in the TypeScript on a copy of the input, with the replay events it
// announced and the invalid numbers it refused.
function run(input, call) {
  const w = structuredClone(input), replay = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {result, reports: invalid} = collectInvalidNumbers(() => call(w));
  const picked = Object.fromEntries(FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));
  if (picked.debrief === undefined) picked.debrief = [];
  return {result, state: w, output: exact({...picked, ships: w.ships.map(shipOut), ...Object.fromEntries(MORE.map(k => [k, w[k]])), replay, invalid})};
}

// Patrols played long enough to hold contacts with fixes.
let played = null;
function worlds() {
  if (played) return played;
  played = ['recon', 'big-kahuna', 'seek-and-destroy-sub', 'intercept', 'tiebreaker'].map(m => {
    const s = createGame(m, 9, {weather: 'clear', timeOfDay: 'day', changing: false, difficulty: {airSupport: true}});
    Object.assign(s, {targetDepth: 12, scope: true, targetSpeed: 3});
    for (let t = 0; t < 600; t++) step(s, .25, {timeRate: 1, observation: 'scope'});
    return restore(save(s));
  });
  return played;
}

// Combat ticks on each patrol, with the boat surfaced or submerged, the deck
// gun firing at ships and aircraft, aircraft strafing, torpedoes running both
// ways, ships flooding, and sunk ships descending, collapsing and settling.
let corpus = null;
function combats() {
  if (corpus) return corpus;
  corpus = [];
  const random = seeded(151);
  for (const base of worlds()) for (const variant of [0, 1]) {
    const w = structuredClone(base);
    w.difficulty = {...w.difficulty, airSupport: true, damage: pick(random, [0, -1, 1])};
    const afloat = () => w.ships.filter(v => v.hull > 0), anchor = pick(random, afloat()), a = random() * Math.PI * 2;
    Object.assign(w, {x: anchor.x + Math.sin(a) * 900, y: anchor.y + Math.cos(a) * 900, depth: variant ? 0 : 30, targetDepth: variant ? 0 : 30, heading: bearingTo(w, anchor), scope: false});
    for (const v of w.ships) {
      const r = random();
      if (r < .2) { v.hull = 0; v.sinkDepth = pick(random, [0, 15, 30, 500]); if (random() < .5) v.sunkAt = w.time - pick(random, [5, 40]); }
      else if (r < .5) { v.flood = pick(random, [2, 5, 9]); v.hull = pick(random, [100, 60, 47]); }
    }
    if (variant) {
      w.airSupport = {...w.airSupport, status: 'airborne', launchAt: w.time - 30, lastKnown: {x: w.x, y: w.y, depth: 0, heading: 0, speed: 0, time: w.time}};
      w.aircraft = [0, 1].map(i => ({id: 'air-' + (900 + i), name: 'Plane ' + i, x: w.x + 600 + i * 50, y: w.y - 400, altitude: 120, heading: 300, speed: 70, hull: 100, phase: 'attack', takeoffUntil: 0, attack: 0, bank: 0, bombDropped: false}));
    }
    for (let stepIndex = 0; stepIndex < 100; stepIndex++) {
      if (stepIndex % 25 === 0) {
        const target = pick(random, afloat());
        if (target) putTorpedoInWater(w, 'player', {x: w.x, y: w.y, depth: Math.max(w.depth, 3)}, bearingTo(w, target), target.kind === 'sub' ? target.depth ?? 65 : 3, {intended: target.id, runOut: 300});
        const hostile = afloat().find(v => v.military && v.side !== 'friendly');
        if (hostile) putTorpedoInWater(w, 'enemy', {x: hostile.x, y: hostile.y, depth: 3}, bearingTo(hostile, w), Math.max(3, w.depth), {heading: hostile.heading, tubeSide: 0, launcher: hostile.id, aim: {x: w.x, y: w.y}});
      }
      // The deck gun fires at ships and at the aircraft overhead.
      if (variant && w.gun.cooldown <= 0 && random() < .6) {
        const plane = w.aircraft.find(p => p.hull > 0), target = random() < .4 && plane ? plane : pick(random, afloat());
        if (target) { aimGunAt(w, target); fireDeckGun(w, {bearing: (w.heading + w.gun.angle + 360) % 360, elevation: w.gun.elevation}); }
      }
      const dt = pick(random, [.25, .5, 1]);
      w.time += dt;
      w.acoustics = w.acoustics.slice(-16);
      const input = exact(w), {state, output} = run(input, s => updateCombat(s, dt));
      corpus.push({input, dt, output});
      for (const key of Object.keys(state)) w[key] = state[key];
      if (w.status !== 'patrol') break;
    }
  }
  return corpus;
}

test('combat ticks match: aircraft, torpedoes, gun rounds, flooding, sinking, collapse and settling', async () => {
  const calls = combats(), outs = calls.map(c => c.output);
  const texts = [...new Set(outs.flatMap(o => o.debrief.map(e => e.text)))];
  for (const fragment of [' was disabled by flooding.', ' began sinking.', ' came to rest on the seabed.', 'collapsed during the descent.'])
    assert.ok(texts.some(t => t.includes(fragment)), 'a debrief line: ' + fragment);
  const kinds = new Set(outs.flatMap(o => o.replay.map(r => r.event.kind)));
  for (const kind of ['sinking', 'collapse', 'torpedo']) assert.ok(kinds.has(kind), 'a replay event: ' + kind);
  const logs = new Set(outs.flatMap(o => o.events.map(e => e.text)));
  for (const text of ['Gun impact observed.', 'Aircraft hit. Going down.']) assert.ok(logs.has(text), 'a log line: ' + text);
  assert.ok(outs.some(o => o.impacts.some(p => p.kind === 'splash')) && outs.some(o => o.impacts.some(p => p.kind === 'hit')), 'hits and splashes');
  sameResults(await elm('combat.updateCombat', calls.map(c => [c.input, c.dt])), outs);
});

test('launching torpedoes matches, the boat\'s at contacts and an enemy\'s at a report', async () => {
  const random = seeded(152), launches = [], hostile = [];
  for (const base of worlds()) for (let n = 0; n < 60; n++) {
    const w = structuredClone(base);
    if (!w.contacts.length) continue;
    const c = structuredClone(pick(random, w.contacts));
    c.id = 'contact-' + n;
    Object.assign(c, pick(random, [{}, {side: 'friendly'}, {identified: true, military: false}, {kind: 'sub', depthEstimate: pick(random, [20, 80])}, {kind: 'sub'}]));
    if (random() < .3) delete c.fix;
    w.contacts = [...w.contacts, c];
    Object.assign(w, {torps: pick(random, [0, 1, 2, 6]), depth: pick(random, [12, 60, 95, 101]), status: pick(random, ['patrol', 'patrol', 'patrol', 'won']), runSetting: pick(random, [600, 2000, 4320])});
    // The contact's ship, when present, is sometimes an opposing warship just
    // inside or past the run setting, where the launch alarms her more or less
    // seriously.
    if (random() < .5) {
      const margin = random() < .5, foe = w.ships.find(v => v.military && v.side !== 'friendly' && v.hull > 0);
      const ship = margin && foe ? foe : pick(random, w.ships), b = random() * Math.PI * 2, d = margin ? w.runSetting + pick(random, [-25, 25]) : random() * 4000;
      w.ships = [...w.ships, {...ship, id: c.id, x: w.x + Math.sin(b) * d, y: w.y + Math.cos(b) * d}];
    }
    w.systems = {...w.systems, tubes: pick(random, [100, 50, 0])};
    w.tubeReadyAt = {port: w.time + pick(random, [-5, 0, 5]), starboard: w.time + pick(random, [-5, 0, 5])};
    const {result, output} = run(exact(w), s => launchTorpedo(s, c.id));
    launches.push({input: exact(w), id: c.id, expected: [result, output]});
    const ship = pick(random, w.ships.filter(v => v.kind === 'sub') .concat(w.ships.slice(0, 1)));
    const shooter = {...ship, depth: ship.depth ?? 30, pitch: pick(random, [0, .1]), lastTubeSide: pick(random, [undefined, 1, -1])};
    const track = {x: w.x + (random() - .5) * 400, y: w.y + (random() - .5) * 400, depth: pick(random, [10, 60]), heading: random() * 360, speed: 3, time: w.time - 4, age: pick(random, [0, 4, 30])};
    const fired = run(exact(w), s => { const copy = structuredClone(shooter); launchHostileTorpedo(s, copy, track); return copy; });
    hostile.push({input: exact(w), ship: exact(shooter), track, expected: [shipOut(fired.result), fired.output]});
  }
  assert.ok(launches.some(l => l.expected[0]) && launches.some(l => !l.expected[0]), 'launches made and refused');
  const past = launches.filter(l => { const v = l.expected[1].ships.find(s => s.id === l.id); return l.expected[0] && v && Math.hypot(v.x - l.input.x, v.y - l.input.y) > l.input.runSetting; });
  assert.ok(past.some(l => l.expected[1].ships.find(s => s.id === l.id).parley?.level === 4), 'a warship just past the run setting alarmed seriously');
  sameResults(await elm('combat.launchTorpedo', launches.map(l => [l.input, l.id])), launches.map(l => l.expected));
  sameResults(await elm('combat.launchHostileTorpedo', hostile.map(h => [h.input, h.ship, h.track])), hostile.map(h => h.expected));
});

test('the deck gun, its aim, charge altitudes and firing bearings match', async () => {
  const random = seeded(153), shots = [], aims = [], bearings = [];
  for (const base of worlds()) for (let n = 0; n < 60; n++) {
    const w = structuredClone(base);
    Object.assign(w, {depth: pick(random, [0, 0, 1, 3]), status: pick(random, ['patrol', 'patrol', 'won'])});
    w.gun = {...w.gun, ammo: pick(random, [0, 1, 240]), cooldown: pick(random, [0, 0, .1]), shots: pick(random, [0, 4, 9])};
    w.systems = {...w.systems, deckgun: pick(random, [100, 40, 0])};
    // An opponent near the edge of the range at which gunfire alerts her.
    const foe = w.ships.find(v => v.military && v.side !== 'friendly' && v.hull > 0), b = random() * Math.PI * 2, d = pick(random, [5500, 6500]);
    if (foe) Object.assign(foe, {x: w.x + Math.sin(b) * d, y: w.y + Math.cos(b) * d});
    const aim = {bearing: pick(random, [random() * 360, NaN, Infinity]), elevation: pick(random, [random() * 100 - 15, 90, -40, NaN])};
    const {result, output} = run(exact(w), s => fireDeckGun(s, aim));
    shots.push({input: exact(w), aim, expected: [result, output]});
    const point = {x: w.x + (random() - .5) * 3000, y: w.y + (random() - .5) * 3000, ...pick(random, [{}, {vx: 30, vy: -10}, {altitude: 150, vx: -60}])};
    aims.push({input: exact(w), point, expected: run(exact(w), s => aimGunAt(s, point)).output.gun});
    for (const c of w.contacts) bearings.push({input: exact(w), contact: c, expected: firingBearing(w, c)});
  }
  assert.ok(shots.some(s => s.expected[0]) && shots.some(s => s.expected[1].invalid.length), 'shots fired and invalid aims reported');
  sameResults(await elm('combat.fireDeckGun', shots.map(s => [s.input, s.aim])), shots.map(s => s.expected));
  sameResults(await elm('combat.aimGunAt', aims.map(a => [a.input, a.point])), aims.map(a => a.expected));
  sameResults(await elm('combat.firingBearing', bearings.map(b => [b.input, b.contact])), bearings.map(b => b.expected));
  const charges = Array.from({length: 400}, () => ({id: 1, x: 0, y: 0, depth: pick(random, [15, 60]), delay: pick(random, [0, 1, 4, 8]), totalDelay: pick(random, [4, 8]), age: 0,
    exploded: random() < .2, kind: pick(random, ['bomb', 'charge']), ...(random() < .5 ? {airTime: pick(random, [0, 2, 3.5]), airHeight: pick(random, [0, 70, 180])} : {})}));
  // Bombs whose fall takes almost their whole delay sink over a sliver of time.
  for (const c of charges) if (random() < .2) Object.assign(c, {airTime: c.totalDelay - pick(random, [0, .0005, .005]), airHeight: 120, delay: pick(random, [0, .002, .004])});
  sameResults(await elm('combat.chargeAltitude', charges.map(c => [c])), charges.map(c => chargeAltitude(c)));
});

test('torpedo saves and rebuilt incoming runs match, for every rule the save check applies', async () => {
  const random = seeded(154), saves = [], runs = [];
  const breakers = [
    t => { delete t.id; }, t => { t.id = 3.5; }, t => { t.id = null; }, t => { delete t.depth; }, t => { t.depth = null; }, t => { t.depth = 'deep'; }, t => { delete t.runLimit; }, t => { t.runLimit = 50; },
    t => { delete t.traveled; }, t => { delete t.traveled; t.age = 10; }, t => { t.runLimit = 95; }, t => { t.traveled = t.runLimit + 1; }, t => { t.traveled = -1; }, t => { delete t.owner; }, t => { t.owner = 'pirate'; }, t => { delete t.intended; t.lock = 'cobalt'; },
    t => { t.intended = 5; }, t => { t.lock = 7; }, t => { delete t.pingAge; }, t => { t.pingAge = NaN; }, t => { delete t.orderedHeading; delete t.orderedDepth; delete t.searchDirection; delete t.tubeSide; },
    t => { t.searchDirection = 0; }, t => { t.tubeSide = 2; }, t => { t.runOut = -1; }, t => { t.diverted = 'no'; }, t => { t.decoysChecked = [3]; }, t => { delete t.decoysChecked; },
    t => { t.decoyCheckedAt = -1; }, t => { t.decoyCheckedAt = 1e9; }, t => { t.decoyTarget = {x: 1, y: 2, depth: 3}; }, t => { t.decoyTarget = {x: 1, y: 2, depth: 3, expiresAt: 4}; },
    t => { t.path = [{x: 1, y: 2, depth: 3}]; }, t => { delete t.path; }, t => { t.x = Infinity; }, t => { delete t.age; },
    t => { if (t.owner === 'enemy') delete t.launcher; }, t => { if (t.owner === 'enemy') t.aim = {x: 1}; }, t => { if (t.owner === 'enemy') t.aim = null; },
  ];
  for (const base of worlds()) {
    const w = structuredClone(base);
    putTorpedoInWater(w, 'player', {x: w.x, y: w.y, depth: 20}, 90, 20, {intended: w.ships[0].id, runOut: 300});
    putTorpedoInWater(w, 'enemy', {x: w.x + 500, y: w.y, depth: 20}, 270, 20, {heading: 270, launcher: w.ships[0].id, aim: {x: w.x, y: w.y}});
    for (const original of w.projectiles) {
      saves.push({input: exact(w), torpedo: exact(original)});
      for (const breaker of breakers) { const t = structuredClone(exact(original)); breaker(t); saves.push({input: exact(w), torpedo: t}); }
    }
    for (let n = 0; n < 20; n++) {
      const blast = {x: w.x + (random() - .5) * 2000, y: w.y + (random() - .5) * 2000, depth: pick(random, [10, 40]), delay: pick(random, [-1, 0, 4, 12])};
      if (random() < .3) w.ships = w.ships.filter(v => v.kind !== 'sub');
      runs.push({input: exact(w), blast, expected: run(exact(w), s => restoreIncomingRun(s, blast)).output});
    }
  }
  const expected = saves.map(({input, torpedo}) => {
    const s = structuredClone(input), t = structuredClone(torpedo);
    let ok;
    try { ok = restoreTorpedo(s, t); } catch { ok = false; }
    // A player's torpedo carries no launcher or aim in Elm; the TypeScript keeps
    // them, unread, when a damaged save gives one those fields.
    if (ok && t.owner === 'player') { delete t.launcher; delete t.aim; }
    return [ok ? exact(t) : null, s.weaponSequence];
  });
  assert.ok(expected.filter(([t]) => t).length > 10 && expected.filter(([t]) => !t).length > 50, 'saves kept and refused');
  sameResults(await elm('combat.restoreTorpedo', saves.map(s => [s.input, s.torpedo])), expected);
  sameResults(await elm('combat.restoreIncomingRun', runs.map(r => [r.input, r.blast])), runs.map(r => r.expected));
});

// Single combat ticks built on the edges the played runs rarely reach: wrecks
// crossing the depths at which they collapse, a doomed carrier and a listing
// ship flooding, and single gun rounds striking at the waterline, splashing
// near a ship, striking the carrier before her aircraft are up, plunging onto
// a shallow submarine, or strafing a boat just below the surface.
test('single combat ticks match at the edges of collapse, flooding and gun rounds', async () => {
  const random = seeded(155), calls = [], along = (from, heading, d) => ({x: from.x + Math.sin(heading * Math.PI / 180) * d, y: from.y + Math.cos(heading * Math.PI / 180) * d});
  const round = (w, owner, at, altitude, v) => ({id: w.weaponSequence++, owner, ...at, altitude, vx: v.vx ?? 0, vy: v.vy ?? 0, vz: v.vz ?? 0, age: 0, tracer: false});
  for (let n = 0; n < 1200; n++) {
    const base = worlds()[n % 5], w = structuredClone(base), kind = Math.floor(n / 5) % 8, dt = pick(random, [.25, .5, 1]);
    Object.assign(w, {projectiles: [], gunRounds: [], aircraft: [], acoustics: [], blasts: []});
    const deep = Array.from({length: 40}, (_, i) => along(w, i * 37, 400 + i * 150)).find(p => -floorSurface(p.x, p.y, w.environment.chartSeed).height > 160);
    const subs = w.ships.filter(v => v.kind === 'sub'), surface = w.ships.filter(v => v.kind !== 'sub' && v.kind !== 'carrier'), carrier = w.ships.find(v => v.kind === 'carrier');
    if (kind < 3) {
      const v = kind < 2 ? subs[0] : pick(random, surface);
      if (!v || !deep) continue;
      Object.assign(v, deep, {hull: 0, sunkAt: kind < 2 ? w.time - 5 : random() * (w.time - 80), sinkDepth: kind === 0 ? pick(random, [14.5, 17.5]) : kind === 1 ? pick(random, [19, 22.5]) : 70});
      if (kind < 2) v.depth = kind === 0 ? 50 : 22;
      delete v.collapsed; delete v.nextCreak;
    } else if (kind === 3) {
      const v = random() < .5 && carrier ? carrier : pick(random, surface);
      Object.assign(v, {hull: pick(random, [30, 60]), flood: pick(random, [5, 9]), sinkDepth: pick(random, [0, 3.5]), ...(v === carrier ? {directHits: pick(random, [0, 9])} : {})});
    } else if (kind === 4 || kind === 5) {
      const v = kind === 5 && carrier ? carrier : pick(random, surface.filter(s => s.hull > 0));
      if (!v) continue;
      v.sinkDepth = pick(random, [0, .5]);
      const side = v.heading + 90, start = along(v, side, 40), toward = (side + 180) % 360;
      w.gunRounds = [round(w, 'player', start, pick(random, [3.8, 4.5, 4.9, 5.2]) - v.sinkDepth, {vx: Math.sin(toward * Math.PI / 180) * 600, vy: Math.cos(toward * Math.PI / 180) * 600})];
    } else if (kind === 6) {
      const v = random() < .5 ? subs.find(s => s.hull > 0) : pick(random, surface.filter(s => s.hull > 0));
      if (!v) continue;
      if (v.kind === 'sub') { v.depth = pick(random, [7.5, 9, 11]); w.gunRounds = [round(w, 'player', {x: v.x, y: v.y}, 5, {vz: -600})]; }
      else w.gunRounds = [round(w, 'player', along(v, random() * 360, pick(random, [110, 135, 160])), .5, {vz: -100})];
    } else {
      Object.assign(w, {depth: pick(random, [1.5, 2.5, 3.5]), scope: false});
      const heading = random() * 360;
      w.gunRounds = [round(w, 'aircraft', along(w, heading, 30), 6, {vx: -Math.sin(heading * Math.PI / 180) * 300, vy: -Math.cos(heading * Math.PI / 180) * 300, vz: -10})];
    }
    const input = exact(w);
    calls.push({input, dt, output: run(input, s => updateCombat(s, dt)).output});
  }
  const outs = calls.map(c => c.output);
  assert.ok(outs.filter(o => o.replay.some(r => r.event.kind === 'collapse')).length > 20, 'collapses');
  assert.ok(calls.some((c, i) => c.input.airSupport.status !== outs[i].airSupport.status), 'a struck carrier raising her aircraft');
  assert.ok(outs.some(o => o.events.some(e => e.text === 'Aircraft strafing the surfaced hull. Dive!')), 'strafing a boat near the surface');
  assert.ok(outs.some(o => o.impacts.some(p => p.kind === 'hit')) && outs.some(o => o.impacts.some(p => p.kind === 'splash')), 'hits and splashes');
  sameResults(await elm('combat.updateCombat', calls.map(c => [c.input, c.dt])), outs);
});
