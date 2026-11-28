import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fleetTheater, advanceFleetAction, activeVolleys, fleetShotPose, classifyEcho, affiliation, isOpponent, sidesAfloat, friendlyLead, validTheater} from '../src/fleet-action.js';
import {hash01} from '../src/surface-motion.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// Theaters laid out from many origins and seeds, then varied so every
// branch of the battle runs: disabled, damaged and sunk units, a side
// outnumbered from the start, units far from their patrol areas, and an
// incidental merchant that neither side counts.
function theaters() {
  const random = seeded(71), out = [];
  for (let k = 0; k < 36; k++) {
    const origin = {x: (random() - .5) * 8000, y: (random() - .5) * 8000}, seed = Math.floor(random() * 1e6);
    const s = {time: 0, weaponSequence: 1 + Math.floor(random() * 40), patrol: {seed}, ...fleetTheater(origin, seed)};
    const variant = k % 6;
    if (variant === 1) for (const v of s.ships.slice(0, 3)) v.hull = 20 + random() * 18;
    if (variant === 2) { s.ships[1].hull = 0; s.ships[2].hull = 0; s.ships[6].disabled = true; }
    if (variant === 3) for (const v of s.ships.filter((_, i) => i % 2 === 0)) { v.x += 2500; v.y -= 900; }
    if (variant === 4) s.ships.push({id: 'traffic-1', name: 'Halcyon', kind: 'merchant', side: 'hostile', incidental: true, x: origin.x, y: origin.y + 1300, heading: 90, speed: 8, hull: 100, alert: 0, attack: 0});
    if (variant === 5) { s.ships[4].hull = 0; s.ships[5].hull = 0; s.ships[6].hull = 0; }
    out.push(s);
  }
  return out;
}

// Every step of every theater's battle, one second apart: the TypeScript's
// state going in, and what one call leaves. The handler logs each event and,
// as the mission's does, takes an impact id for each arrival.
let corpus = null;
function battles() {
  if (corpus) return corpus;
  corpus = [];
  for (const s of theaters()) for (let t = 0; t <= 300; t++) {
    s.time = t + (s.patrol.seed % 7) / 10;
    const input = exact(s), log = [];
    advanceFleetAction(s, (ship, volley, fired) => { log.push({ship: exact(ship), volley: exact(volley), fired}); if (!fired) s.weaponSequence++; });
    corpus.push({input, output: exact({weaponSequence: s.weaponSequence, ships: s.ships, battle: s.battle, log})});
  }
  return corpus;
}

test('the fleet theater matches: both task groups and their patrol areas, from any origin and seed', async () => {
  const random = seeded(70), cases = [];
  for (let i = 0; i < 600; i++) cases.push([{x: (random() - .5) * 20000, y: (random() - .5) * 20000}, i < 500 ? Math.floor(random() * 1e9) : random() * 1e4 - 5e3]);
  const expected = cases.map(([origin, seed]) => exact(fleetTheater(origin, seed)));
  const eastward = expected.filter((t, i) => t.battle.areas[0].x < cases[i][0].x).length;
  assert.ok(eastward > 100 && eastward < 500, 'both layouts occur');
  sameResults(await elm('fleetAction.fleetTheater', cases), expected);
});

test('the fleet action matches, step by step: volleys, arrivals, turns, yielding and the handler\'s order', async () => {
  const runs = battles();
  const events = runs.flatMap(r => r.output.log);
  const fired = events.filter(e => e.fired), arrived = events.filter(e => !e.fired);
  assert.ok(fired.length > 500 && arrived.length > 500, 'shots fire and arrive');
  assert.ok(fired.some(e => e.volley.underwater) && fired.some(e => !e.volley.underwater), 'torpedoes and gunfire');
  assert.ok(fired.some(e => e.volley.damage === 0) && fired.some(e => e.volley.damage > 0), 'hits and misses');
  assert.ok(runs.some(r => r.output.log.some(e => !e.fired && e.volley.damage === 0 && r.input.battle.volleys.some(v => v.id === e.volley.id && v.damage > 0))), 'a volley at a sunk ship loses its damage');
  assert.ok(runs.some(r => r.output.log.filter(e => e.fired).length === 2 && r.output.log.some(e => !e.fired)), 'arrivals and fire in one call');
  // Rounds where both sides could fire but one held, because it was outnumbered.
  const able = (s, side) => s.ships.filter(v => !v.incidental && v.side === side && v.hull > 0 && !v.disabled).length;
  const afloat = (s, side) => s.ships.filter(v => !v.incidental && v.side === side && v.hull > 0).length;
  assert.ok(runs.some(r => r.output.battle.round > r.input.battle.round && able(r.input, 'friendly') && able(r.input, 'hostile') &&
    able(r.input, 'friendly') < afloat(r.input, 'hostile') && r.output.log.filter(e => e.fired).length < 2), 'an outnumbered side holds its fire');
  // Rounds where the unit whose turn it was had under 40 hull and a healthier one fired instead.
  const yielded = runs.filter(r => r.output.battle.round > r.input.battle.round).some(r => {
    const round = r.input.battle.round, roll = n => hash01(r.input.patrol.seed, 3000 + round * 64 + n);
    const team = r.input.ships.filter(v => !v.incidental && v.side === 'friendly' && v.hull > 0 && !v.disabled);
    const due = team.length && team[(round + Math.floor(roll(1) * team.length)) % team.length];
    return due && due.hull < 40 && r.output.log.some(e => e.fired && e.ship.side === 'friendly' && e.ship.id !== due.id);
  });
  assert.ok(yielded, 'a damaged unit yields its turn');
  assert.ok(runs.some(r => r.output.log.some(e => e.fired && Math.hypot(e.ship.x - r.input.battle.areas[e.ship.kind === 'sub' ? 1 : 0].x, e.ship.y - r.input.battle.areas[e.ship.kind === 'sub' ? 1 : 0].y) > 1800)), 'a unit far from its area turns for it');
  assert.ok(runs.some(r => r.output.ships.some(v => v.hull === 0) && r.input.ships.every(v => v.incidental || v.hull > 0)), 'ships sink');
  sameResults(await elm('fleetAction.advanceFleetAction', runs.map(r => [r.input])), runs.map(r => r.output));
});

test('active volleys, shot poses, echo affiliations and side counts match', async () => {
  const random = seeded(72), runs = battles();
  const volleys = [...new Map(runs.flatMap(r => r.output.battle.volleys).map(v => [v.id + ':' + v.source, v])).values()];
  assert.ok(volleys.length > 300, 'volleys to read');
  const pick = () => volleys[Math.floor(random() * volleys.length)];
  const shotSets = [];
  for (let i = 0; i < 400; i++) {
    const s = {}, k = i % 8;
    if (k & 1) s.battle = {volleys: Array.from({length: i % 3}, pick)};
    if (k & 2) s.convoy = {shot: i % 5 ? pick() : null};
    if (k & 4) s.traffic = {volleys: Array.from({length: i % 4}, pick)};
    shotSets.push(s);
  }
  sameResults(await elm('fleetAction.activeVolleys', shotSets.map(s => [s])), shotSets.map(s => exact(activeVolleys(s))));
  const poses = volleys.flatMap(v => [v.launched - 3, v.launched, (v.launched + v.arrives) / 2, v.arrives, v.arrives + 7].map(t => [v, t]));
  sameResults(await elm('fleetAction.fleetShotPose', poses), poses.map(([v, t]) => exact(fleetShotPose(v, t))));
  const echoes = [];
  for (const r of runs.filter((_, i) => i % 97 === 0)) for (const kind of ['escort', 'sub', 'merchant']) for (const side of ['friendly', 'hostile', undefined]) for (let j = 0; j < 4; j++) {
    const a = r.input.battle.areas[kind === 'sub' ? 1 : 0], spread = [100, 700, 1100, 3000][j];
    echoes.push([r.input.battle, side ? {kind, side} : {kind}, {x: a.x + (random() - .5) * 2 * spread, y: a.y + (random() - .5) * 2 * spread}, random()]);
  }
  const echoed = echoes.map(([b, ship, at, roll]) => classifyEcho(b, ship, at, roll) ?? null);
  assert.ok(new Set(echoed).size === 3, 'echoes read friendly, hostile and unknown');
  sameResults(await elm('fleetAction.classifyEcho', echoes), echoed);
  const contacts = [];
  for (const side of ['friendly', 'hostile', undefined]) for (const probableSide of ['friendly', 'hostile', undefined]) for (const military of [true, false, undefined]) for (const identified of [true, false, undefined])
    contacts.push(exact({side, probableSide, military, identified}));
  sameResults(await elm('fleetAction.affiliation', contacts.map(c => [c])), contacts.map(c => affiliation(c)));
  sameResults(await elm('fleetAction.isOpponent', contacts.map(c => [c])), contacts.map(c => Boolean(isOpponent(c))));
  const fleets = runs.filter((_, i) => i % 13 === 0).map(r => r.output.ships.map(v => exact({side: v.side, hull: v.hull, incidental: v.incidental})));
  sameResults(await elm('fleetAction.sidesAfloat', fleets.map(f => [f])), fleets.map(f => sidesAfloat(f)));
  sameResults(await elm('fleetAction.friendlyLead', fleets.map(f => [f])), fleets.map(f => friendlyLead(f)));
});

// Each way a saved fleet action can be unusable, applied to battles in
// progress, plus the same battles unchanged.
test('fleet action save validation matches, for every rule it checks', async () => {
  const runs = battles().filter((r, i) => i % 23 === 0 && r.output.battle.volleys.length > 0);
  assert.ok(runs.length > 40, 'battles with volleys in flight');
  const breakers = [
    s => { s.battle.round = -1; }, s => { s.battle.round = 1.5; }, s => { s.battle.round = NaN; }, s => { s.battle.next = -1; }, s => { s.battle.next = Infinity; },
    s => { s.battle.areas.pop(); }, s => { s.battle.areas.push({...s.battle.areas[0]}); }, s => { s.battle.areas[1].radius = 0; }, s => { s.battle.areas[0].label = 5; },
    s => { s.battle.areas[0].x = NaN; }, s => { s.battle.areas = {}; }, s => { delete s.battle; },
    s => { s.ships.splice(3, 1); }, s => { s.ships.push({...s.ships[0], id: 'friendly-9'}); }, s => { s.ships[0].id = 'friendly-7'; }, s => { s.ships[5].side = 'friendly'; },
    s => { s.ships[2].military = false; }, s => { s.ships[3].kind = 'escort'; }, s => { s.ships[0].kind = 'sub'; }, s => { delete s.ships[7].depth; }, s => { s.ships[7].depth = Infinity; },
    s => { s.ships.push({...s.ships[0], id: 'traffic-2', incidental: true}); },
    s => { while (s.battle.volleys.length <= 12) s.battle.volleys.push({...s.battle.volleys[0], id: s.weaponSequence + s.battle.volleys.length}); s.weaponSequence += 40; },
    s => { s.battle.volleys[0].id = 0; }, s => { s.battle.volleys[0].id = 1.5; }, s => { s.battle.volleys[0].id = s.weaponSequence; }, s => { s.battle.volleys[0].id = 2 ** 53; s.weaponSequence = 2 ** 54; },
    s => { s.battle.volleys.push({...s.battle.volleys[0]}); }, s => { s.battle.volleys[0].underwater = 'yes'; }, s => { delete s.battle.volleys[0].from.altitude; },
    s => { s.battle.volleys[0].to.x = NaN; }, s => { s.battle.volleys[0].launched = -1; }, s => { s.battle.volleys[0].launched = s.time + 1; }, s => { s.battle.volleys[0].arrives = s.time; },
    s => { s.battle.volleys[0].launched = s.battle.volleys[0].arrives; }, s => { s.battle.volleys[0].damage = -1; }, s => { s.battle.volleys[0].damage = NaN; },
    s => { s.battle.volleys[0].source = 'nobody'; }, s => { s.battle.volleys[0].target = s.battle.volleys[0].source; }, s => { s.battle.volleys = 'none'; },
  ];
  const cases = [];
  for (const r of runs) {
    const after = {...r.input, time: r.input.time, weaponSequence: r.output.weaponSequence, ships: r.output.ships, battle: r.output.battle};
    cases.push(exact(after));
    for (const breaker of breakers) { const s = structuredClone(exact(after)); breaker(s); cases.push(s); }
  }
  const valid = cases.map(s => Boolean(validTheater(s)));
  assert.ok(valid.filter(Boolean).length >= runs.length && valid.filter(v => !v).length > runs.length * (breakers.length - 2), 'unchanged battles pass and broken ones fail');
  sameResults(await elm('fleetAction.validTheater', cases.map(s => [s])), valid);
});
