import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {playerReport, searchDuration, projectedReport, validReport, scatterAim, updateHostileTrack, reportHunterState, pursueAndAttack} from '../src/hostile-tracks.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const FIELDS = ['x', 'y', 'depth', 'heading', 'speed', 'targetSpeed', 'time', 'rng', 'difficulty', 'systems', 'scope', 'scopeTravel', 'noise', 'bottomed', 'noisemaker',
  'engine', 'events', 'debrief', 'shells', 'soundSequence', 'acoustics'];
const pick = (random, list) => list[Math.floor(random() * list.length)];

// A patrol from a fresh combat game, varied in everything the hunt reads.
function patrol(random, i) {
  const g = createGame(pick(random, ['intercept', 'seek-and-destroy', 'seek-and-destroy-sub', 'big-kahuna']), 3 + i % 7, {weather: 'clear', timeOfDay: 'day', changing: false});
  const depth = pick(random, [0, 2.9, 3, 10, 14, 15, 30, 150]);
  const s = {...Object.fromEntries(FIELDS.filter(k => g[k] !== undefined).map(k => [k, g[k]])), time: 300 + random() * 600, rng: (i * 2654435761) | 0, depth,
    speed: pick(random, [0, 3, 8, -2]), targetSpeed: pick(random, [0, 5, 12]), noise: pick(random, [5, 25, 60, 90]), engine: pick(random, ['diesel', 'electric']),
    bottomed: random() < .2, scope: random() < .5, scopeTravel: random() < .5 ? random() * 3 : undefined, shells: [], debrief: [], events: [], acoustics: [], soundSequence: 40,
    systems: {...g.systems, periscope: pick(random, [100, 40, 0])},
    difficulty: pick(random, [undefined, {}, {pursuit: .4, depthStealth: 2, detection: 1.8}, {pursuit: 2, depthStealth: 0, detection: .4}, {detection: 1.3}])};
  const r = random();
  if (r < .45) s.noisemaker = {x: s.x + (random() - .5) * 1600, y: s.y + (random() - .5) * 1600, depth: 40, heading: 90, speed: 0, time: s.time - pick(random, [1, 20, 31.9, 32, 40])};
  return exact(s);
}

function hunter(random, s, i) {
  const kind = pick(random, ['escort', 'escort', 'sub', 'merchant']), range = pick(random, [150, 400, 410, 430, 900, 1500, 2250, 2290, 2310, 2400, 2590, 2610, 3000, 5000, 6000]), a = random() * 2 * Math.PI;
  const ship = {id: 'h' + i, name: 'Hunter ' + i, kind, x: s.x + Math.sin(a) * range, y: s.y + Math.cos(a) * range, heading: random() * 360, speed: 6, hull: 100,
    alert: pick(random, [0, 30, 42, 50, 55, 56, 90, 100]), attack: pick(random, [-1, 0, .1, 5]), military: true, side: 'hostile',
    depth: kind === 'sub' ? pick(random, [10, 15, 16, 60]) : 0};
  const r = random();
  if (r < .3) ship.report = {...playerReport(s), time: s.time - pick(random, [0, 1, 2, 30, 200]), reason: pick(random, ['propulsion noise', 'noisemaker', 'surfaced hull'])};
  if (random() < .3) ship.tracking = pick(random, ['tracking', 'searching', 'decoy']);
  if (random() < .3) ship.patrolSpeed = 4;
  if (random() < .3) ship.lastTubeSide = pick(random, [1, -1]);
  return ship;
}

// The TypeScript marks a hunter that gave up with tracking: null, never-tracked ones
// with no field; both read as not tracking, and the Elm ship has one Nothing
// for both, so the comparison drops the null, as the ship-record tests do.
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };
const withIds = (s, ...ships) => ({...s, shipIds: ships.map(v => v.id)});
const stateOut = s => exact({rng: s.rng, events: s.events, debrief: s.debrief, shells: s.shells, soundSequence: s.soundSequence, acoustics: s.acoustics,
  charges: s.charges ?? [], launches: s.launches ?? [], invalid: []});

test('a hunter\'s senses match: sight, hearing, the noisemaker, alert and the track it follows', async () => {
  const random = seeded(101), cases = [];
  for (let i = 0; i < 4000; i++) {
    const s = patrol(random, i), ship = hunter(random, s, i), senses = {subVisualRange: pick(random, [1500, 4000, 9000]), storm: pick(random, [0, .5, 1])};
    cases.push([withIds(s, ship), ship, senses, pick(random, [0, .25, 1, 3])]);
  }
  const expected = cases.map(([s, ship, senses, dt]) => { const c = structuredClone(ship); const t = updateHostileTrack(structuredClone(s), c, senses, dt); return [exact(c), t ? exact(t) : null]; });
  const reasons = new Set(expected.map(([ship]) => ship.report?.reason));
  for (const why of ['surfaced hull', 'raised periscope', 'diesel noise', 'propulsion noise', 'noisemaker']) assert.ok(reasons.has(why), 'a report from ' + why);
  assert.ok(expected.some(([, t]) => t) && expected.some(([, t]) => !t), 'tracks and none');
  assert.ok(expected.some(([ship]) => ship.alert === 100) && expected.some(([ship]) => ship.alert === 0), 'alert at both limits');
  sameResults(await elm('hostileTracks.updateHostileTrack', cases), expected);
});

test('the debrief follows each hunter as it detects, reacquires, searches, is decoyed and gives up', async () => {
  const random = seeded(102), cases = [];
  for (let i = 0; i < 1500; i++) {
    const s = patrol(random, i), ship = hunter(random, s, i);
    const base = {...playerReport(s), time: s.time - 3};
    const t = pick(random, [null, {...base, age: 2, reason: 'propulsion noise'}, {...base, age: 8, reason: 'diesel noise'}, {...base, age: 1, reason: 'noisemaker'},
      {...base, age: 3, reason: ''}, {...base, age: 3}, {...base, age: 4}, {...base, age: 4.01, heading: 271.5, speed: -3.25}]);
    cases.push([withIds(s, ship), ship, t]);
  }
  const expected = cases.map(([s, ship, t]) => { const c = structuredClone(ship), state = structuredClone(s); reportHunterState(state, c, t); return [shipOut(c), stateOut(state)]; });
  const lines = expected.flatMap(([, s]) => s.debrief.map(d => d.text.replace(/^(Hunter \d+|An enemy submarine) /, '').split(' ')[0]));
  for (const word of ['detected', 'reacquired', 'lost', 'followed', 'broke']) assert.ok(lines.includes(word), 'a debrief line: ' + word);
  sameResults(await elm('hostileTracks.reportHunterState', cases), expected);
});

test('pursuit and attack match: closing, guns, depth charges and torpedoes, with the patrol\'s own launchers', async () => {
  const random = seeded(103), cases = [];
  for (let i = 0; i < 3000; i++) {
    const s = patrol(random, i), ship = hunter(random, s, i);
    ship.report ??= {...playerReport(s), time: s.time - 2, reason: 'propulsion noise'};
    const t = {...projectedReport(ship.report, s.time), depth: pick(random, [0, 1, 2, 2.01, 40, 200])};
    cases.push([withIds(s, ship), ship, t, pick(random, [.25, 1, 5])]);
  }
  const attacks = {
    dropCharge: (s, {x, y, depth, delay}) => s.charges.push({x, y, depth, delay}),
    launchTorpedo: (s, ship, t) => { s.launches.push({launcher: ship.id, attack: ship.attack, heading: ship.heading, trackAge: t.age}); ship.lastTubeSide = ship.lastTubeSide === 1 ? -1 : 1; },
  };
  const expected = cases.map(([s, ship, t, dt]) => {
    const c = structuredClone(ship), state = {...structuredClone(s), charges: [], launches: []};
    pursueAndAttack(state, c, t, dt, attacks.dropCharge, attacks.launchTorpedo);
    return [exact(c), stateOut(state)];
  });
  assert.ok(expected.some(([, s]) => s.shells.length) && expected.some(([, s]) => s.charges.length) && expected.some(([, s]) => s.launches.length), 'guns, charges and torpedoes');
  assert.ok(expected.some(([ship, s], i) => !s.shells.length && !s.charges.length && !s.launches.length && ship.attack < cases[i][1].attack), 'a hunter waiting on its attack timer');
  sameResults(await elm('hostileTracks.pursueAndAttack', cases), expected);
});

test('reports, projection, scatter, search time and save validation match', async () => {
  const random = seeded(104), reports = [], aims = [], saved = [];
  for (let i = 0; i < 800; i++) {
    const r = {x: (random() - .5) * 9000, y: (random() - .5) * 9000, depth: random() * 200, heading: random() * 360, speed: (random() - .3) * 20, time: random() * 900};
    if (random() < .5) r.reason = 'propulsion noise';
    reports.push([r, r.time + pick(random, [-5, 0, 3, 60]), pick(random, [0, 1.5, 7])]);
    aims.push([{rng: (i * 40503) | 0}, {x: r.x, y: r.y}, pick(random, [0, 25, 300])]);
    const v = {...r};
    const flaw = i % 9;
    if (flaw === 1) delete v.heading; if (flaw === 2) v.time = -1; if (flaw === 3) v.time = 2000; if (flaw === 4) v.x = 'near';
    if (flaw === 5) v.depth = null; if (flaw === 6) delete v.speed; if (flaw === 7) v.y = NaN;
    saved.push([v, 1000, random() < .5]);
  }
  sameResults(await elm('hostileTracks.projectedReport', reports), reports.map(([r, time, lead]) => exact(projectedReport(r, time, lead))));
  sameResults(await elm('hostileTracks.scatterAim', aims), aims.map(([s, target, radius]) => { const c = {...s}; const p = scatterAim(c, target, radius); return [p, c.rng]; }));
  const valid = saved.map(([v, time, legacy]) => validReport(v, time, legacy));
  assert.ok(valid.some(Boolean) && valid.some(v => !v), 'valid and invalid reports');
  sameResults(await elm('hostileTracks.validReport', saved), valid);
  const states = Array.from({length: 40}, (_, i) => ({x: i, y: -i, depth: i * 3, heading: i * 9, speed: i / 4, time: i * 11}));
  sameResults(await elm('hostileTracks.playerReport', states.map(s => [s])), states.map(s => playerReport(s)));
  const difficulties = [{}, {difficulty: {}}, {difficulty: {pursuit: .4}}, {difficulty: {pursuit: 2}}, {difficulty: {pursuit: 1.3, detection: 1}}];
  sameResults(await elm('hostileTracks.searchDuration', difficulties.map(d => [d])), difficulties.map(d => searchDuration(d)));
});
