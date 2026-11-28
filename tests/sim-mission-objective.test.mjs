import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {missions} from '../typescript/mission-catalog.ts';
import {evaluateObjective, allSunk, convoyTransportIds} from '../src/mission-objective.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const FIELDS = ['time', 'x', 'y', 'mission', 'home', 'patrol', 'photos', 'ships', 'trackTime'];
// Stand-ins for the rescue and survey work, matching the harness's Elm ones.
const work = {
  rescue: (s, dt) => { s.workCalls.push('rescue'); return dt > .5; },
  survey: (s, dt) => { s.workCalls.push('survey'); return dt > .5; },
};

// Each objective on both sides of its threshold, on a fresh game of each mission.
function variants(s, objective, random) {
  const out = [{}], goal = s.patrol.photoGoal, track = s.patrol.trackGoal;
  for (const n of [goal - 1, goal, goal + 1]) out.push({photos: Array.from({length: Math.max(0, n)}, (_, i) => ({id: i}))});
  out.push({patrol: {...s.patrol, photoGoal: 2.5}, photos: [{}, {}]}, {patrol: {...s.patrol, photoGoal: 2.5}, photos: [{}, {}, {}]});
  for (const t of [track - .001, track, track + 5, 0]) out.push({trackTime: t});
  const radius = objective.radius ?? 200;
  for (const d of [radius - .01, radius, radius + .01, 5000]) { const a = random() * 2 * Math.PI; out.push({x: s.home.x + Math.sin(a) * d, y: s.home.y + Math.cos(a) * d}); }
  const targets = objective.targets ?? (objective.hunter ? [objective.hunter] : []);
  if (targets.length) {
    const sink = (ids, hull) => s.ships.map(v => ids.includes(v.id) ? {...v, hull} : v);
    out.push({ships: sink(targets, 0)}, {ships: sink(targets, -0)}, {ships: sink(targets.slice(1), 0)}, {ships: sink(targets, .5)},
      {ships: sink(targets, 0).filter(v => v.id !== targets[0])});
  }
  if (objective.kind === 'fleetLead') {
    const ids = side => s.ships.filter(v => v.side === side && !v.incidental).map(v => v.id);
    for (let f = 0; f <= 3; f++) for (let h = 0; h <= 3; h++)
      out.push({ships: s.ships.map(v => ids('friendly').slice(0, f).includes(v.id) || ids('hostile').slice(0, h).includes(v.id) ? {...v, hull: 0} : v)});
  }
  return out;
}

test('the objective verdict matches for every mission, each objective on both sides of its threshold, and the work it runs', async () => {
  const random = seeded(91), cases = [];
  for (const m of missions) for (const seed of [4, 23]) {
    const game = createGame(m.id, seed, {weather: 'clear', timeOfDay: 'day', changing: false});
    const s = Object.fromEntries(FIELDS.map(k => [k, game[k]]));
    for (const v of variants(s, m.objective, random)) for (const dt of [.25, 1]) cases.push([exact({...s, ...v}), dt]);
  }
  const expected = cases.map(([s, dt]) => { const c = {...structuredClone(s), workCalls: []}; return [evaluateObjective(c, dt, work), c.workCalls]; });
  const verdicts = new Map();
  cases.forEach(([s], i) => { const kind = missions.find(m => m.id === s.mission).objective.kind; verdicts.set(kind, (verdicts.get(kind) ?? new Set()).add(expected[i][0])); });
  assert.deepStrictEqual([...verdicts].filter(([kind, seen]) => kind !== 'survive' && seen.size < 2).map(([kind]) => kind), [], 'every objective kind is met and unmet');
  sameResults(await elm('missionObjective.evaluateObjective', cases), expected);
});

test('sinking checks and the convoy\'s transports match', async () => {
  const random = seeded(92), cases = [];
  for (let i = 0; i < 600; i++) {
    const ships = Array.from({length: Math.floor(random() * 5)}, (_, j) => ({id: 'ship-' + Math.floor(random() * 4), hull: [0, -0, .1, 50, 100][Math.floor(random() * 5)] + (j * 0)}));
    cases.push([ships, Array.from({length: Math.floor(random() * 4)}, () => 'ship-' + Math.floor(random() * 4))]);
  }
  const expected = cases.map(([ships, targets]) => allSunk(ships, targets));
  assert.ok(expected.some(Boolean) && expected.some(v => !v), 'sunk and afloat');
  sameResults(await elm('missionObjective.allSunk', cases), expected);
  sameResults(await elm('missionObjective.convoyTransportIds'), [[...convoyTransportIds]]);
});
