import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {missions} from '../typescript/mission-catalog.ts';
import {launchWatchSeconds, recordLocalLaunch, crewOnAlert, crewPeriod, messLine, messClips} from '../src/mess-watch.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const FIELDS = ['x', 'y', 'time', 'crewQuietUntil', 'hull', 'systems', 'repairLimits', 'fuelLeak', 'fuelFire', 'water', 'projectiles', 'battle', 'convoy', 'traffic',
  'mission', 'ships', 'aircraft', 'silent', 'alert', 'shock', 'flood', 'pressureAlarm', 'gunLoudUntil'];
const SYSTEM_KEYS = ['diesel', 'fuelTank', 'batteryBank', 'tubes', 'engine', 'propeller', 'oxygen', 'ballast', 'planes', 'rudder', 'sonar', 'periscope', 'deckgun', 'crew'];
const PHASES = ['takeoff', 'approach', 'search', 'attack', 'egress', 'return', 'down', 'gone'];

// A watch with nothing to alert the crew: repairs complete, no threats.
function calm(mission, seed) {
  const s = createGame(mission, seed, {weather: 'clear', timeOfDay: 'day', changing: false});
  Object.assign(s, {time: 400, crewQuietUntil: 0, silent: false, alert: 0, shock: 0, flood: 0, pressureAlarm: 0, gunLoudUntil: 0, fuelLeak: 0, fuelFire: 0, water: 0,
    projectiles: [], ships: [], aircraft: []});
  s.repairLimits = {...s.repairLimits, hull: s.hull};
  for (const key of SYSTEM_KEYS) s.repairLimits[key] = s.systems[key];
  s.traffic = {...s.traffic, volleys: []};
  if (s.battle) s.battle = {...s.battle, volleys: []};
  return Object.fromEntries(FIELDS.filter(k => s[k] !== undefined).map(k => [k, s[k]]));
}

const at = (s, distance, bearing = 0) => ({x: s.x + Math.sin(bearing) * distance, y: s.y + Math.cos(bearing) * distance});
const ship = (s, distance, extra) => ({id: 'v' + distance, name: 'Vessel', kind: 'escort', heading: 0, speed: 4, hull: 100, alert: 0, attack: 0, ...at(s, distance, 1), ...extra});
const volley = (s, distance, underwater) => ({id: 1, underwater, from: {...at(s, distance + 300, 2), altitude: -20}, to: {...at(s, distance, 2), altitude: -20},
  source: 'a', target: 'b', launched: s.time - 10, arrives: s.time + 1e-9, damage: 10});

// Each way the watch can be raised, on its own, with a near miss beside it.
function triggers(s) {
  const lim = s.repairLimits;
  return [
    {silent: true}, {alert: 31}, {alert: 30}, {shock: .1}, {flood: .1}, {pressureAlarm: 1}, {gunLoudUntil: s.time + 1}, {gunLoudUntil: s.time},
    {crewQuietUntil: s.time + 1}, {crewQuietUntil: s.time}, {fuelLeak: .01}, {fuelFire: .01}, {water: 4.01}, {water: 4},
    {hull: lim.hull - 1}, ...SYSTEM_KEYS.map(key => ({systems: {...s.systems, [key]: lim[key] - .5}})),
    {projectiles: [at(s, 1999)]}, {projectiles: [at(s, 2001)]},
    {traffic: {...s.traffic, volleys: [volley(s, 1500, true)]}}, {traffic: {...s.traffic, volleys: [volley(s, 1500, false)]}}, {traffic: {...s.traffic, volleys: [volley(s, 2500, true)]}},
    {convoy: {shot: volley(s, 1000, true)}}, {convoy: {shot: null}},
    ...(s.battle ? [{battle: {...s.battle, volleys: [volley(s, 1200, true)]}}, {traffic: {...s.traffic, volleys: []}, battle: {...s.battle, volleys: [volley(s, 2200, true)]}}] : []),
    {ships: [ship(s, 1500, {military: true, side: 'hostile'})]}, {ships: [ship(s, 1500, {military: true})]}, {ships: [ship(s, 1500, {military: true, side: 'friendly'})]},
    {ships: [ship(s, 1500, {side: 'hostile'})]}, {ships: [ship(s, 1500, {military: true, side: 'hostile', hull: 0})]}, {ships: [ship(s, 2500, {military: true, side: 'hostile'})]},
    ...['tracking', 'searching', 'decoy'].map(tracking => ({ships: [ship(s, 9000, {military: true, side: 'hostile', tracking})]})),
    ...PHASES.map(phase => ({aircraft: [{...at(s, 1500, 3), hull: 100, phase}]})),
    {aircraft: [{...at(s, 2100, 3), hull: 100, phase: 'attack'}]}, {aircraft: [{...at(s, 500, 3), hull: 0, phase: 'attack'}]},
  ];
}

test('new games start with no shock rather than an undefined one', () => {
  for (const {id} of missions) assert.equal(createGame(id, 3, {weather: 'clear', timeOfDay: 'day', changing: false}).shock, 0, id);
});

test('the crew\'s alert matches, for every mission, every trigger and its near miss, and mixtures of them', async () => {
  const random = seeded(81), cases = [];
  for (const {id} of missions) for (const seed of [5, 17]) {
    const s = calm(id, seed), all = triggers(s);
    for (const stations of [true, false]) cases.push([s, stations]);
    for (const t of all) cases.push([exact({...s, ...t}), random() < .5]);
    for (let k = 0; k < 12; k++) {
      const mixed = {...s};
      for (const t of all) if (random() < .06) Object.assign(mixed, t);
      cases.push([exact(mixed), random() < .5]);
    }
  }
  const expected = cases.map(([s, stations]) => crewOnAlert(structuredClone(s), stations));
  assert.ok(missions.some(m => m.actionStations) && missions.some(m => !m.actionStations), 'both kinds of patrol');
  assert.ok(cases.some(([s, stations], i) => !expected[i] && !stations) && cases.filter((_, i) => expected[i]).length > cases.length / 3, 'calm watches and raised ones');
  sameResults(await elm('messWatch.crewOnAlert', cases), expected);
});

test('a nearby launch keeps the crew quiet for the watch, and a distant one does not', async () => {
  const random = seeded(82), cases = [];
  for (let i = 0; i < 400; i++) {
    const s = {x: (random() - .5) * 9000, y: (random() - .5) * 9000, time: random() * 3000, crewQuietUntil: random() * 3000};
    const d = [0, 1999.999, 2000, 2000.001, random() * 5000][i % 5], a = random() * 2 * Math.PI;
    cases.push([s, {x: s.x + Math.sin(a) * d, y: s.y + Math.cos(a) * d}]);
  }
  const expected = cases.map(([s, launcher]) => { const c = {...s}; recordLocalLaunch(c, launcher); return c.crewQuietUntil; });
  assert.ok(expected.some((q, i) => q !== cases[i][0].crewQuietUntil) && expected.some((q, i) => q === cases[i][0].crewQuietUntil), 'near and far launches');
  sameResults(await elm('messWatch.recordLocalLaunch', cases), expected);
  sameResults(await elm('messWatch.launchWatchSeconds'), [launchWatchSeconds]);
});

test('the mess deck\'s routine, lines and clips match', async () => {
  const hours = [-1, -0, NaN, Infinity, 5.999, 6, 6.999, 7, 7.999, 8, 12, 12.549, 12.55, 13.999, 14, 14.999, 15, 18, 18.549, 18.55, 18.999, 19, 22.999, 23, 23.249, 23.25, 24];
  for (let h = 0; h < 24.5; h += .05) hours.push(h);
  sameResults(await elm('messWatch.crewPeriod', hours.map(h => [h])), hours.map(h => crewPeriod(h)));
  const lines = [];
  for (const period of ['breakfast', 'coffee', 'meal', 'sleep', 'music', 'lights-out', null])
    for (const choice of [-.5, -0, 0, .2, .4999, .5, .99, 1, 1.5, NaN, Infinity])
      for (const last of [null, 'coffee', 'eggs', 'mess-a', 'steak', 'nope']) lines.push([period, choice, last]);
  const expectedLines = lines.map(([p, c, l]) => messLine(p, c, l ?? undefined) ?? null);
  assert.ok(expectedLines.some(l => l === null) && new Set(expectedLines).size > 8, 'lines and silences');
  sameResults(await elm('messWatch.messLine', lines), expectedLines);
  sameResults(await elm('messWatch.messClips'), [messClips]);
});
