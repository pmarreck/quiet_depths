import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {temperament, freshTraffic, encounterTime, resumeTraffic, encounterGroups, playerSignal, canAttackPlayer, advanceTraffic, validTraffic} from '../src/cold-watch.js';
import {chartDepth} from '../typescript/coast.ts';
import {DAY_SECONDS} from '../typescript/patrol-calendar.ts';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const HALF_DAY = DAY_SECONDS / 2;
const FIELDS = ['x', 'y', 'time', 'mission', 'environment', 'patrol', 'ships', 'traffic', 'weaponSequence'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
// A ship that gave up its pursuit carries tracking: null in the TypeScript and
// Nothing in Elm; both read as not tracking (as in the ship-record tests).
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

// Patrols from just before a watch's traffic arrives, advanced a few seconds
// at a time with every ship dead-reckoned between calls, so stands escalate,
// volleys fly and land, and ships close and open the range. Every call's
// input and output is kept.
// One watch tick for an input, with the signal stand-in's log.
function tick(input, holiday) {
  const state = {...structuredClone(input), log: []};
  advanceTraffic(state, holiday, (action, v, shot) => {
    state.log.push({action, ship: shipOut(v), shot: shot ? exact(shot) : null});
    if (action === 'answer') state.weaponSequence++;
  });
  return {ships: state.ships.map(shipOut), traffic: exact(state.traffic), weaponSequence: state.weaponSequence, log: state.log};
}

let corpus = null;
function watches() {
  if (corpus) return corpus;
  corpus = [];
  const random = seeded(111);
  for (const [k, mission] of ['recon', 'intercept', 'shadow', 'survey', 'seek-and-destroy', 'tiebreaker', 'wolf-in-the-henhouse', 'sneaky-seamen'].entries()) for (const seed of [11, 29, 47]) {
    const g = createGame(mission, seed + k, {weather: 'clear', timeOfDay: 'day', changing: false});
    const s = Object.fromEntries(FIELDS.map(f => [f, structuredClone(g[f])]));
    const window = 1 + (seed % 3);
    s.time = encounterTime(s.patrol.seed, window) - 3;
    s.traffic = {window: window - 1, next: 0, turn: 0, volleys: []};
    s.weaponSequence = 5;
    for (const v of s.ships) if (v.military && v.side !== 'friendly' && random() < .5) {
      if (random() < .5) v.report = {x: s.x + 40, y: s.y - 30, depth: 20, heading: 0, speed: 3, time: s.time - pick(random, [0, 10, 31])};
      else v.parley = {against: 'player', level: 1, order: 'warn', range: 900, next: s.time, cruise: v.speed, origin: {x: s.x, y: s.y, time: s.time - pick(random, [5, 80])}};
    }
    const holiday = random() < .3;
    for (let step = 0; step < 260; step++) {
      const dt = pick(random, [1, 2, 4]);
      s.time += dt;
      for (const v of s.ships) { const a = v.heading * Math.PI / 180; v.x += Math.sin(a) * v.speed * .514444 * dt; v.y += Math.cos(a) * v.speed * .514444 * dt; }
      // Now and then the player is heard, so hostile traffic turns on the boat.
      if (random() < .03) for (const v of s.ships) if (v.incidental && v.side === 'hostile') v.report = {x: s.x, y: s.y, depth: 20, heading: 0, speed: 3, time: s.time};
      const input = exact(s), output = tick(input, holiday);
      corpus.push({input, holiday, output});
      s.ships = structuredClone(output.ships); s.traffic = structuredClone(output.traffic); s.weaponSequence = output.weaponSequence;
    }
  }
  return corpus;
}

test('the cold watch matches call by call: arrivals, stands, warnings, volleys, answers and retreats', async () => {
  const runs = watches(), log = runs.flatMap(r => r.output.log);
  const actions = new Set(log.map(e => e.action));
  for (const a of ['arrival', 'withdraw', 'attack', 'answer']) assert.ok(actions.has(a), 'a signal: ' + a);
  assert.ok(['ping', 'shell', 'short-run'].filter(a => actions.has(a)).length >= 2, 'warnings of two kinds');
  const orders = new Set(runs.flatMap(r => r.output.ships.map(v => v.parley?.order)));
  for (const o of ['watch', 'approach', 'stop', 'warn', 'fight', 'retreat']) assert.ok(orders.has(o), 'a stand: ' + o);
  assert.ok(runs.some(r => r.output.ships.some(v => v.parley?.against === 'player')), 'stands against the player');
  assert.ok(log.some(e => e.action === 'answer' && e.shot.damage > 0), 'volleys that hit');
  sameResults(await elm('coldWatch.advanceTraffic', runs.map(r => [r.input, r.holiday])), runs.map(r => r.output));
});

// Single turns from random encounters: two to five ships of every kind and
// side, damaged, flooded, disabled or whole, with stands against each other or
// the player at every level and age, recent attacks on the player, reports of
// the boat, and volleys landing. A quarter of the patrol seeds are chosen so
// that a ship's temperament falls near the spoiling-for-a-fight threshold.
test('single watch turns match across random encounters of every kind', async () => {
  const random = seeded(114), cases = [];
  const g = createGame('recon', 5, {weather: 'clear', timeOfDay: 'day', changing: false});
  const base = Object.fromEntries(FIELDS.map(f => [f, structuredClone(g[f])]));
  const ORDERS = ['watch', 'approach', 'stop', 'warn', 'fight', 'retreat'];
  const around = () => ({x: base.x + (random() - .5) * 4000, y: base.y + (random() - .5) * 4000});
  for (let n = 0; n < 5000; n++) {
    const s = structuredClone(base);
    s.mission = pick(random, ['recon', 'shadow', 'tiebreaker', 'sneaky-seamen']);
    s.patrol = {...s.patrol, seed: Math.floor(random() * 1e7)};
    s.time = 40000 + Math.floor(random() * 2000);
    s.traffic = {window: Math.floor(s.time / HALF_DAY), next: 0, turn: Math.floor(random() * 50), volleys: []};
    s.weaponSequence = 1000;
    s.ships = Array.from({length: 2 + Math.floor(random() * 4)}, (_, i) => {
      const kind = pick(random, ['sub', 'escort', 'merchant', 'carrier']), incidental = random() < .5;
      const v = {id: incidental ? `passage-0-${i % 4}-${Math.floor(i / 4)}` : 'ship-' + i, name: 'Ship ' + i, kind, military: random() < .92,
        side: pick(random, ['friendly', 'hostile', 'hostile', undefined]), ...around(), heading: random() * 360, speed: pick(random, [0, 3, 6, 9]),
        hull: pick(random, [100, 100, 80, 69, 46, 20, 0]), alert: 0, attack: 0, depth: kind === 'sub' ? (random() < .25 ? undefined : 40) : 0,
        flood: pick(random, [0, 0, 0, 4, 9]), disabled: random() < .2, incidental: incidental || undefined};
      if (kind === 'carrier') v.directHits = pick(random, [0, 1, 2]);
      if (random() < .25) v.lastAttackAt = s.time - pick(random, [10, 42, 44, 46, 80]);
      if (random() < .3) v.report = {...around(), depth: 20, heading: 0, speed: 3, time: s.time - pick(random, [0, 29, 30, 31])};
      return v;
    });
    for (const v of s.ships) if (random() < .6) {
      const others = s.ships.filter(o => o !== v);
      const against = random() < .4 ? null : pick(random, others);
      // Some stands recorded a range just either side of the 75 m by which a
      // ship opening the range counts as leaving.
      const range = against && random() < .4 ? Math.max(0, Math.hypot(v.x - against.x, v.y - against.y) - pick(random, [60, 74.9, 75, 75.1, 90])) : pick(random, [300, 900, 1500, 2400]);
      v.parley = {against: against ? against.id : 'player', level: pick(random, [0, 1, 2, 3, 4]), order: pick(random, ORDERS),
        range, next: s.time + pick(random, [-5, 0, 0, 5]), cruise: pick(random, [4, 6, 8])};
      if (random() < .7) v.parley.origin = {...around(), time: s.time - pick(random, [0, 30, 72, 74, 76, 100])};
    }
    for (let k = pick(random, [0, 0, 1, 2]); k > 0; k--) {
      const from = pick(random, s.ships), to = pick(random, s.ships), warning = random() < .3;
      s.traffic.volleys.push({id: 900 + k, source: from.id, target: to.id, underwater: random() < .5, warning, from: {x: from.x, y: from.y, altitude: 4}, to: {x: to.x, y: to.y, altitude: 0},
        launched: s.time - 5, arrives: s.time + pick(random, [-1, 0, 0, 10]), damage: warning ? 0 : pick(random, [0, 18, 30, 90])});
    }
    if (n % 4 === 0) for (let tries = 0; tries < 300 && !s.ships.some(v => Math.abs(temperament(s.patrol.seed, v.id) - .905) < .025); tries++) s.patrol.seed = Math.floor(random() * 1e7);
    const input = exact(s), holiday = random() < .3;
    cases.push({input, holiday, output: tick(input, holiday)});
  }
  const log = cases.flatMap(c => c.output.log), actions = new Set(log.map(e => e.action));
  for (const a of ['withdraw', 'attack', 'answer', 'ping', 'shell', 'short-run']) assert.ok(actions.has(a), 'a signal: ' + a);
  const landed = cases.flatMap(c => c.input.traffic.volleys.filter(v => v.arrives <= c.input.time && v.damage).map(v => [c, v]));
  assert.ok(landed.some(([c, v]) => c.input.ships.find(x => x.id === v.target)?.kind === 'carrier' && c.input.ships.find(x => x.id === v.target).hull > 0), 'a volley landing on a carrier');
  assert.ok(log.some(e => e.action === 'attack' && e.ship.disabled === false) && cases.some(c => c.input.ships.some(v => v.disabled && v.parley?.order === 'fight')), 'disabled ships in a fight');
  sameResults(await elm('coldWatch.advanceTraffic', cases.map(c => [c.input, c.holiday])), cases.map(c => c.output));
});

// Arrivals at the moment a watch's traffic is due, over many patrol seeds,
// watches and charts, with most boats placed near the coast so that groups
// must try several bearings for deep enough water and submarines are kept off
// the bottom. Some boats sit in shallows or ashore (not a place play can reach)
// so that groups find no passage at all.
test('passing traffic arrives as in the TypeScript across seeds, watches and coastal waters', async () => {
  const random = seeded(115), cases = [];
  const bases = [5, 23, 61].map(seed => createGame('recon', seed, {weather: 'clear', timeOfDay: 'day', changing: false}))
    .map(g => Object.fromEntries(FIELDS.map(f => [f, structuredClone(g[f])])));
  while (cases.length < 900) {
    const base = pick(random, bases), x = base.x + (random() - .5) * 40000, y = base.y + (random() - .5) * 40000;
    const depth = chartDepth(x, y, base.environment.chartSeed);
    if (depth > 150 && random() < .9) continue;
    const s = structuredClone(base), seed = Math.floor(random() * 1e7), window = 1 + Math.floor(random() * 30);
    Object.assign(s, {x, y, ships: [], weaponSequence: 1, patrol: {...s.patrol, seed}, time: encounterTime(seed, window)});
    s.traffic = {window: window - 1, next: s.time + 100, turn: 0, volleys: []};
    const input = exact(s);
    cases.push({input, output: tick(input, false)});
  }
  const arrivals = cases.flatMap(c => c.output.ships);
  const groups = cases.map(c => { const g = encounterGroups(c.input.patrol.seed, c.input.traffic.window + 1); return [g.friendlySub, g.hostileSub, g.friendlySurface, g.hostileSurface].filter(Boolean).length; });
  assert.ok(cases.some((c, i) => new Set(c.output.ships.map(v => v.id.split('-')[2])).size < groups[i]), 'a group with no passage');
  assert.ok(arrivals.some(v => v.kind === 'sub' && v.depth < 35), 'a submarine kept off the bottom');
  assert.ok(arrivals.some(v => v.id.endsWith('-2')), 'a group of three or more');
  sameResults(await elm('coldWatch.advanceTraffic', cases.map(c => [c.input, false])), cases.map(c => c.output));
});

test('the watch\'s schedule, groups and temperaments match', async () => {
  const random = seeded(112), seeds = Array.from({length: 60}, () => Math.floor(random() * 1e7));
  const pairs = seeds.flatMap(seed => [0, 1, 2, 7, 40].map(w => [seed, w]));
  sameResults(await elm('coldWatch.encounterTime', pairs), pairs.map(([seed, w]) => encounterTime(seed, w)));
  sameResults(await elm('coldWatch.encounterGroups', pairs), pairs.map(([seed, w]) => encounterGroups(seed, w)));
  const times = seeds.flatMap(seed => [0, 100, HALF_DAY - 1, HALF_DAY, encounterTime(seed, 1) - .001, encounterTime(seed, 1), 200000].map(t => [t, seed]));
  sameResults(await elm('coldWatch.resumeTraffic', times), times.map(([t, seed]) => resumeTraffic(t, seed)));
  sameResults(await elm('coldWatch.freshTraffic', times.map(([t]) => [t])), times.map(([t]) => freshTraffic(t)));
  const ids = ['friendly-1', 'hostile-4', 'passage-3-1-2', 'cobalt', '', 'ship 🚢', '\ud800lone', 'a\udc00b', '\ud800\ud800x', 'Ünïcode'];
  const names = seeds.flatMap(seed => ids.map(id => [seed, id]));
  sameResults(await elm('coldWatch.temperament', names), names.map(([seed, id]) => temperament(seed, id)));
});

test('signals from the player and attack permission match', async () => {
  const random = seeded(113), cases = [];
  for (const r of watches().filter((_, i) => i % 9 === 0)) for (const v of r.input.ships.slice(0, 6)) {
    const s = r.input, variant = {...v, ...pick(random, [{}, {side: 'friendly'}, {military: false}, {hull: 0}, {parley: {against: 'player', level: 2, order: 'fight', range: 500, next: s.time, cruise: 4}},
      {parley: {against: 'hostile-2', level: 1, order: 'warn', range: 800, next: s.time, cruise: 6}}, {report: {x: s.x + 620, y: s.y - 130, depth: 10, heading: 4, speed: 2, time: s.time - 3}}])};
    const source = pick(random, ['absent', null, {x: s.x + 377, y: s.y - 1260}]);
    cases.push({s, ship: variant, serious: random() < .5, source});
  }
  const expected = cases.map(({s, ship, serious, source}) => { const c = structuredClone(ship); if (source === 'absent') playerSignal(s, c, serious); else playerSignal(s, c, serious, source); return shipOut(c); });
  assert.ok(expected.some((v, i) => v.parley?.origin && !cases[i].ship.parley?.origin), 'origins recorded');
  sameResults(await elm('coldWatch.playerSignal', cases.map(({s, ship, serious, source}) => source === 'absent' ? [s, ship, serious] : [s, ship, serious, source])), expected);
  const permissions = cases.map(({s, ship}) => [s, {...ship, alert: pick(random, [0, 79.9, 80, 95]), ...(random() < .3 ? {incidental: true} : {})}]);
  const allowed = permissions.map(([s, ship]) => Boolean(canAttackPlayer(s, ship)));
  assert.ok(allowed.some(Boolean) && allowed.some(a => !a), 'allowed and refused');
  sameResults(await elm('coldWatch.canAttackPlayer', permissions), allowed);
});

test('traffic save validation matches, for every rule it checks', async () => {
  const runs = watches().filter(r => r.output.traffic.volleys.length).filter((_, i) => i % 4 === 0);
  assert.ok(runs.length > 10, 'watches with volleys in flight');
  const breakers = [
    s => { s.traffic.window = 1.5; }, s => { s.traffic.window = -2; }, s => { s.traffic.window = 99999; }, s => { s.traffic.turn = -1; }, s => { s.traffic.turn = 2 ** 53; },
    s => { s.traffic.window = Math.floor(s.time / HALF_DAY) + 1; }, s => { s.traffic.next = -1; }, s => { s.traffic.next = Infinity; }, s => { s.traffic.volleys = {}; }, s => { s.ships.push({...s.ships[0]}); },
    s => { const v = s.ships.find(x => x.incidental); if (v) v.id = 'visitor-1'; }, s => { const v = s.ships.find(x => x.incidental); if (v) v.id = 'passage-1-2-4'; },
    s => { const v = s.ships.find(x => x.incidental); if (v) v.id = 'passage-1-4-0'; }, s => { const v = s.ships.find(x => x.incidental); if (v) v.id = 'passage-x-1-1'; }, s => { const v = s.ships.find(x => x.incidental); if (v) v.id = 'passage--1-1'; }, s => { const v = s.ships.find(x => x.incidental); if (v) delete v.side; },
    s => { const v = s.ships.find(x => x.incidental); if (v) v.incidental = false; }, s => { s.ships[0].lastAttackAt = s.time + 1; }, s => { s.ships[0].lastAttackAt = -1; },
    s => { const v = s.ships.find(x => x.parley); if (v) v.parley.level = 5; }, s => { const v = s.ships.find(x => x.parley); if (v) v.parley.level = 1.5; },
    s => { const v = s.ships.find(x => x.parley); if (v) v.parley.range = -1; }, s => { const v = s.ships.find(x => x.parley); if (v) v.parley.next = NaN; },
    s => { const v = s.ships.find(x => x.parley); if (v) v.parley.against = 'nobody'; }, s => { const v = s.ships.find(x => x.parley); if (v) v.parley.origin = {x: 0, y: 0, time: s.time + 5}; },
    s => { s.traffic.volleys[0].id = 0; }, s => { s.traffic.volleys[0].id = s.weaponSequence; }, s => { s.traffic.volleys.push({...s.traffic.volleys[0]}); },
    s => { s.traffic.volleys[0].warning = 'no'; }, s => { s.traffic.volleys[0].from.x = NaN; }, s => { s.traffic.volleys[0].to.altitude = Infinity; },
    s => { s.traffic.volleys[0].launched = s.time + 1; }, s => { s.traffic.volleys[0].arrives = s.time; }, s => { s.traffic.volleys[0].damage = -1; },
    s => { s.traffic.volleys[0].warning = true; s.traffic.volleys[0].damage = 5; }, s => { s.traffic.volleys[0].source = 'nobody'; },
    s => { s.traffic.volleys[0].target = 'player'; s.traffic.volleys[0].warning = false; s.traffic.volleys[0].damage = 0; }, s => { s.traffic.volleys[0].target = 'player'; s.traffic.volleys[0].warning = true; s.traffic.volleys[0].damage = 0; },
  ];
  const cases = [];
  for (const r of runs) {
    const after = exact({...r.input, ships: r.output.ships, traffic: r.output.traffic, weaponSequence: r.output.weaponSequence});
    cases.push(after);
    for (const breaker of breakers) { const s = structuredClone(after); breaker(s); cases.push(s); }
  }
  const valid = cases.map(s => Boolean(validTraffic(s)));
  assert.ok(valid.filter(Boolean).length >= runs.length && valid.filter(v => !v).length > runs.length * 20, 'unchanged watches pass and broken ones fail');
  sameResults(await elm('coldWatch.validTraffic', cases.map(s => [s])), valid);
});
