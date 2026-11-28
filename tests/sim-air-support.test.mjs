import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {raiseCarrierAlarm, requestSupport, updateAircraft} from '../typescript/air-support.ts';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const FIELDS = ['x', 'y', 'depth', 'heading', 'speed', 'time', 'mission', 'rng', 'patrol', 'environment', 'wavePhase', 'lightning', 'difficulty', 'systems', 'scope', 'scopeTravel',
  'ships', 'aircraft', 'airSupport', 'blasts', 'gunRounds', 'weaponSequence', 'soundSequence', 'acoustics', 'events', 'debrief'];
const CHANGED = ['ships', 'aircraft', 'airSupport', 'blasts', 'gunRounds', 'weaponSequence', 'soundSequence', 'acoustics', 'rng', 'events', 'debrief'];
const PHASES = ['takeoff', 'approach', 'search', 'attack', 'egress', 'return', 'down', 'gone'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
// A ship that gave up its pursuit carries tracking: null in the TypeScript and
// Nothing in Elm; both read as not tracking (as in the ship-record tests).
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };
const output = s => exact({...Object.fromEntries(CHANGED.map(f => [f, s[f]])), ships: s.ships.map(shipOut), invalid: []});
const bases = ['big-kahuna', 'recon', 'seek-and-destroy', 'shadow'].flatMap((mission, k) => [7, 41].map(seed => {
  const g = createGame(mission, seed + k, {weather: 'clear', timeOfDay: seed === 7 ? 'day' : 'night', changing: false});
  return Object.fromEntries(FIELDS.map(f => [f, structuredClone(g[f])]));
}));
const carrierOf = s => s.ships.find(v => v.kind === 'carrier');
const reportAt = (s, age, extra = {}) => ({x: s.x, y: s.y, depth: s.depth, heading: s.heading, speed: s.speed, time: s.time - age, ...extra});

// Calls the TypeScript on a copy of the input and keeps the call for Elm.
function call(calls, name, fn, s, ...rest) {
  const input = exact(s), state = structuredClone(input);
  fn(state, ...rest.map(r => r === CARRIER ? carrierOf(state) : r));
  calls.push({name, args: [input, ...rest.map(r => r === CARRIER ? carrierOf(input) : r)], output: output(state)});
  return state;
}
const CARRIER = Symbol('the carrier');

// Whole sorties: each tick hunters may report the boat while it is shallow,
// support is requested and the aircraft fly, while the boat changes depth and
// course; now and then a plane is shot down or the carrier is struck.
let corpus = null;
function sorties() {
  if (corpus) return corpus;
  corpus = [];
  const random = seeded(131);
  for (const base of bases) for (const run of [0, 1]) {
    const s = structuredClone(base);
    s.difficulty = {...s.difficulty, airSupport: true, detection: pick(random, [.7, 1, 1.4]), pursuit: pick(random, [.8, 1, 1.3])};
    const hunters = s.ships.filter(v => v.military && v.side !== 'friendly' && v.kind !== 'carrier');
    for (const v of hunters) { v.alert = 90; delete v.parley; }
    s.depth = run ? 0 : 12; s.scope = !run;
    for (let step = 0; step < 450; step++) {
      const dt = pick(random, [.25, .5, 1, 2]);
      s.time += dt;
      if (random() < .03) { s.depth = pick(random, [0, 1.5, 2.5, 12, 15, 40, 80]); s.scope = s.depth <= 15 && random() < .7; s.scopeTravel = s.scope && random() < .5 ? pick(random, [.4, 1]) : undefined; }
      if (random() < .02) s.heading = random() * 360;
      s.speed = s.depth > 30 ? 4 : 2;
      s.x += Math.sin(s.heading * Math.PI / 180) * s.speed * .514444 * dt; s.y += Math.cos(s.heading * Math.PI / 180) * s.speed * .514444 * dt;
      if (s.depth <= 15 && hunters.length && random() < .15) pick(random, hunters).report = reportAt(s, 0, random() < .1 ? {reason: 'noisemaker'} : {});
      let state = call(corpus, 'requestSupport', requestSupport, s);
      for (const f of CHANGED) s[f] = state[f];
      state = call(corpus, 'updateAircraft', updateAircraft, s, dt);
      for (const f of CHANGED) s[f] = state[f];
      if (s.aircraft.length && random() < .006) pick(random, s.aircraft).hull = 0;
      if (carrierOf(s) && random() < .004) { state = call(corpus, 'raiseCarrierAlarm', raiseCarrierAlarm, s, CARRIER); for (const f of CHANGED) s[f] = state[f]; }
      if (carrierOf(s) && random() < .002) carrierOf(s).hull = 0;
      // The rest of the patrol consumes sounds, rounds and blasts.
      s.acoustics = s.acoustics.slice(-12); s.gunRounds = s.gunRounds.slice(-6); s.blasts = s.blasts.slice(-6);
    }
  }
  return corpus;
}

test('whole sorties match call by call: arming, launch, approach, search, attack, bombs, strafing, call-off and return', async () => {
  const calls = sorties(), outs = calls.map(c => c.output);
  const phases = new Set(outs.flatMap(o => o.aircraft.map(p => p.phase)));
  for (const phase of PHASES.filter(p => p !== 'gone' && p !== 'down')) assert.ok(phases.has(phase), 'an aircraft phase: ' + phase);
  for (const status of ['idle', 'arming', 'airborne', 'spent']) assert.ok(outs.some(o => o.airSupport.status === status), 'a sortie status: ' + status);
  const texts = new Set(outs.flatMap(o => o.events.map(e => e.text)));
  for (const text of ['Intercepted radio traffic. Air search called off.', 'Aircraft airborne from Greybank. They still have to reach the patrol area.', 'Intercepted flight-deck alarm. Fighters scrambling.'])
    assert.ok(texts.has(text), 'a log line: ' + text);
  assert.ok(outs.some(o => o.blasts.some(b => b.kind === 'bomb')) && outs.some(o => o.gunRounds.some(r => r.owner === 'aircraft')), 'bombs and strafing');
  for (const name of ['requestSupport', 'updateAircraft', 'raiseCarrierAlarm']) {
    const of = calls.filter(c => c.name === name);
    sameResults(await elm('airSupport.' + name, of.map(c => c.args)), of.map(c => c.output));
  }
});

// Single aircraft updates from every phase, at every range that changes what an
// aircraft does, over a boat surfaced, at periscope depth or deep, with fresh,
// legacy and carrier-alarm reports, shot-down planes and planes flying home.
test('single aircraft updates match across phases, ranges, reports and conditions', async () => {
  const random = seeded(132), calls = [];
  for (let n = 0; n < 3000; n++) {
    const s = structuredClone(pick(random, bases));
    s.time = 600 + Math.floor(random() * 400);
    s.depth = pick(random, [0, 2, 2.5, 12, 15, 16, 60]); s.scope = random() < .6; s.scopeTravel = random() < .3 ? pick(random, [.2, 1]) : undefined;
    s.systems = {...s.systems, periscope: pick(random, [1, .5, 0])};
    s.difficulty = {...s.difficulty, detection: pick(random, [undefined, .6, 1, 1.5]), pursuit: pick(random, [undefined, 1])};
    const report = pick(random, [null, reportAt(s, pick(random, [0, 30, 200])), {x: s.x + 300, y: s.y - 200, time: s.time - 20}, reportAt(s, 1, {reason: 'an explosion near the carrier'})]);
    s.airSupport = {...s.airSupport, status: pick(random, ['airborne', 'airborne', 'arming', 'spent']), launchAt: s.time - pick(random, [10, 100, 400]), requestedAt: s.time - 450, lastKnown: report};
    const at = report ?? s;
    s.aircraft = Array.from({length: 1 + Math.floor(random() * 3)}, (_, i) => {
      const phase = pick(random, PHASES), range = pick(random, [100, 170, 190, 400, 460, 850, 950, 1250, 1350, 1700, 1900, 3000]), a = random() * Math.PI * 2;
      const home = phase === 'return' ? pick(random, [5, 30, 200, 3000]) : null;
      const p = {id: 'air-' + i, name: 'Plane ' + i, x: home === null ? at.x + Math.sin(a) * range : s.airSupport.base.x + home, y: home === null ? at.y + Math.cos(a) * range : s.airSupport.base.y,
        altitude: pick(random, [-5, 10, 65, 120, 180, 200]), heading: random() * 360, speed: pick(random, [70, 90]), hull: pick(random, [100, 100, 100, 0]), phase,
        takeoffUntil: s.time + pick(random, [-1, 0, 2]), attack: pick(random, [0, 0, .1, .45, 999]), bank: pick(random, [0, .3]), bombDropped: random() < .4};
      if (random() < .5) p.egress = pick(random, [.1, 5, 10]);
      if (random() < .3) p.previous = {x: p.x, y: p.y, altitude: p.altitude};
      return p;
    });
    call(calls, 'updateAircraft', updateAircraft, s, pick(random, [.25, 1, 2]));
  }
  const outs = calls.map(c => c.output);
  assert.ok(outs.some(o => o.aircraft.some(p => p.phase === 'down')) && calls.some((c, i) => c.args[0].aircraft.length > outs[i].aircraft.length), 'planes falling and leaving');
  assert.ok(outs.some(o => o.blasts.some(b => b.depth === 40)) && outs.some(o => o.blasts.some(b => b.depth === 15)), 'legacy and surfaced bomb depths');
  sameResults(await elm('airSupport.updateAircraft', calls.map(c => c.args)), outs);
});

// Requests from every sortie state, launch time and carrier deck, with hunters
// either side of each threshold: alert, report age, a noisemaker, permission to
// attack and a newer report already in; and carrier alarms in every state.
test('support requests and carrier alarms match across sortie states and hunters', async () => {
  const random = seeded(133), calls = [];
  for (let n = 0; n < 3000; n++) {
    const s = structuredClone(pick(random, bases));
    s.time = 600 + Math.floor(random() * 400);
    s.difficulty = {...s.difficulty, airSupport: pick(random, [true, true, false, undefined])};
    s.airSupport = {...s.airSupport, status: pick(random, ['idle', 'idle', 'arming', 'airborne', 'spent']), launchAt: pick(random, [null, s.time - 1, s.time, s.time + 1]),
      requestedAt: null, lastKnown: pick(random, [null, reportAt(s, 5), reportAt(s, .5), {x: 0, y: 0, time: s.time - 2}])};
    const carrier = carrierOf(s);
    if (carrier) { carrier.hull = pick(random, [100, 100, 0]); carrier.fighterCount = pick(random, [1, 2, 3]); }
    for (const v of s.ships) if (v.military && v.kind !== 'carrier') {
      v.alert = pick(random, [40, 55, 56, 90]);
      if (random() < .3) v.parley = {against: random() < .6 ? 'player' : s.ships[0].id, level: 4, order: pick(random, ['fight', 'warn']), range: 500, next: s.time, cruise: 4};
      if (random() < .2) v.incidental = true;
      if (random() < .7) v.report = reportAt(s, pick(random, [0, 3, 4, 4.5]), pick(random, [{}, {}, {reason: 'noisemaker'}, {reason: 'sonar contact'}]));
    }
    if (carrier && random() < .3) call(calls, 'raiseCarrierAlarm', raiseCarrierAlarm, s, CARRIER);
    else call(calls, 'requestSupport', requestSupport, s);
  }
  const outs = calls.map(c => c.output), texts = new Set(outs.flatMap(o => o.events.map(e => e.text)));
  for (const count of ['One fighter is', '2 fighters are', '3 fighters are']) assert.ok([...texts].some(t => t.includes(count)), 'a launch: ' + count);
  assert.ok(calls.some((c, i) => c.args[0].airSupport.status !== 'spent' && outs[i].airSupport.status === 'spent'), 'a sortie spent when the deck is lost');
  for (const name of ['requestSupport', 'raiseCarrierAlarm']) {
    const of = calls.filter(c => c.name === name);
    sameResults(await elm('airSupport.' + name, of.map(c => c.args)), of.map(c => c.output));
  }
});
