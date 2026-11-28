import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {temperament, freshTraffic, encounterTime, resumeTraffic, encounterGroups, playerSignal, canAttackPlayer, advanceTraffic, validTraffic} from '../src/cold-watch.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const FIELDS = ['x', 'y', 'time', 'mission', 'environment', 'patrol', 'ships', 'traffic', 'weaponSequence'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
// A ship that gave up its pursuit carries tracking: null in the TypeScript and
// Nothing in Elm; both read as not tracking (as in the ship-record tests).
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

// Patrols from just before a watch's traffic arrives, advanced a few seconds
// at a time with every ship dead-reckoned between calls, so stands escalate,
// volleys fly and land, and ships close and open the range. Every call's
// input and output is kept.
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
      const input = exact(s), state = {...structuredClone(s), log: []};
      advanceTraffic(state, holiday, (action, v, shot) => {
        state.log.push({action, ship: shipOut(v), shot: shot ? exact(shot) : null});
        if (action === 'answer') state.weaponSequence++;
      });
      corpus.push({input, holiday, output: {ships: state.ships.map(shipOut), traffic: exact(state.traffic), weaponSequence: state.weaponSequence, log: state.log}});
      Object.assign(s, {ships: state.ships, traffic: state.traffic, weaponSequence: state.weaponSequence});
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

test('the watch\'s schedule, groups and temperaments match', async () => {
  const random = seeded(112), seeds = Array.from({length: 60}, () => Math.floor(random() * 1e7));
  const pairs = seeds.flatMap(seed => [0, 1, 2, 7, 40].map(w => [seed, w]));
  sameResults(await elm('coldWatch.encounterTime', pairs), pairs.map(([seed, w]) => encounterTime(seed, w)));
  sameResults(await elm('coldWatch.encounterGroups', pairs), pairs.map(([seed, w]) => encounterGroups(seed, w)));
  const times = seeds.flatMap(seed => [0, 100, 43199, 43200, encounterTime(seed, 1) - .001, encounterTime(seed, 1), 200000].map(t => [t, seed]));
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
    s => { s.traffic.next = -1; }, s => { s.traffic.next = Infinity; }, s => { s.traffic.volleys = {}; }, s => { s.ships.push({...s.ships[0]}); },
    s => { const v = s.ships.find(x => x.incidental); if (v) v.id = 'visitor-1'; }, s => { const v = s.ships.find(x => x.incidental); if (v) delete v.side; },
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
