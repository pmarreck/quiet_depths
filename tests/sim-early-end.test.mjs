import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {missions} from '../typescript/mission-catalog.ts';
import {insidePickup, earlyEndOffered, partialCredit, extractionPrompt, endPatrolEarly, partialSummary, pickupRadius} from '../src/early-end.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const FIELDS = ['x', 'y', 'mission', 'status', 'phase', 'depth', 'time', 'home', 'patrol', 'photos', 'trackTime', 'ships', 'operation', 'events', 'debrief'];
const pick = (random, list) => list[Math.floor(random() * list.length)];

// Every mission at extraction and around it, with each early-end rule's
// threshold met, missed and met exactly: photographs, sunk targets, carrier
// hits, survivors, scan time, survey photographs and tracking time. Home sits
// on whole meters, so a boat placed along an axis is exactly at the radius.
let corpus = null;
function extractions() {
  if (corpus) return corpus;
  corpus = [];
  const random = seeded(121);
  for (const m of missions) for (const seed of [3, 17]) {
    const g = createGame(m.id, seed, {weather: 'clear', timeOfDay: 'day', changing: false});
    const base = Object.fromEntries(FIELDS.map(f => [f, structuredClone(g[f] ?? null)]));
    base.debrief ??= [];
    base.home = {x: Math.round(base.home.x), y: Math.round(base.home.y)};
    const rule = m.earlyEnd, goal = m.objective;
    const around = n => [0, n - 1, n, n + 1].filter(v => v >= 0);
    const targets = goal.kind === 'sink' ? goal.targets : [];
    for (let i = 0; i < 60; i++) {
      const s = structuredClone(base);
      s.status = pick(random, ['patrol', 'patrol', 'patrol', 'won']);
      s.phase = pick(random, ['objective', 'objective', 'objective', 'extract']);
      const d = pick(random, [0, 150, pickupRadius - .1, pickupRadius, pickupRadius + .1, 900]);
      if (random() < .5) { s.x = s.home.x + d; s.y = s.home.y; } else { const a = random() * Math.PI * 2; s.x = s.home.x + d * Math.sin(a); s.y = s.home.y + d * Math.cos(a); }
      s.depth = pick(random, [0, .5, 1, 1.01, 15]);
      s.time = 600 + Math.floor(random() * 3000);
      s.photos = Array.from({length: pick(random, [...around(rule?.atLeast ?? 1), s.patrol.photoGoal])}, (_, k) => ({id: 'p' + k}));
      for (const id of targets) {
        const v = s.ships.find(x => x.id === id);
        if (!v) continue;
        v.hull = pick(random, [0, 0, .5, 40, 100]);
        const hits = pick(random, [undefined, 0, 1, 2, 3]);
        if (hits === undefined) delete v.directHits; else v.directHits = hits;
      }
      if (s.operation && random() < .9) {
        const scanFor = rule?.kind === 'scanOrPhotographs' ? rule.scanShare * goal.scanSeconds : 30;
        s.operation.rescued = pick(random, around(rule?.kind === 'survivors' ? rule.atLeast : 2));
        s.operation.scan = pick(random, [0, scanFor - .001, scanFor, scanFor + 1]);
        s.operation.photoAngles = Array.from({length: pick(random, around(rule?.kind === 'scanOrPhotographs' ? rule.photographs : 2))}, () => Math.floor(random() * 360));
      } else s.operation = null;
      const tracked = rule?.kind === 'tracking' ? rule.share * s.patrol.trackGoal : s.patrol.trackGoal / 2;
      s.trackTime = pick(random, [0, tracked - .5, tracked, tracked + .5, s.patrol.trackGoal]);
      corpus.push({s: exact(s), armed: random() < .6, rule: rule?.kind ?? null});
    }
  }
  return corpus;
}

test('whether the pickup circle holds the boat and an early end is offered matches', async () => {
  const cases = extractions(), states = cases.map(c => [c.s]);
  const inside = cases.map(c => insidePickup(c.s)), offered = cases.map(c => earlyEndOffered(c.s));
  assert.ok(inside.some(Boolean) && inside.some(v => !v), 'inside and outside the circle');
  assert.ok(cases.some(c => Math.hypot(c.s.x - c.s.home.x, c.s.y - c.s.home.y) === pickupRadius), 'a boat exactly at the radius');
  assert.ok(offered.filter(Boolean).length > 20 && offered.some(v => !v), 'offered and not');
  sameResults(await elm('earlyEnd.insidePickup', states), inside);
  sameResults(await elm('earlyEnd.earlyEndOffered', states), offered);
  const prompts = cases.map(c => [c.armed, c.s]);
  const expected = prompts.map(([armed, s]) => extractionPrompt(armed, s));
  assert.ok(expected.some(p => p.ask) && expected.some(p => !p.ask && !p.armed) && expected.some(p => !p.ask && p.armed), 'asked, disarmed and armed');
  sameResults(await elm('earlyEnd.extractionPrompt', prompts), expected);
});

test('partial credit matches for every rule, either side of each threshold', async () => {
  const cases = extractions(), credit = cases.map(c => partialCredit(c.s));
  for (const kind of ['photographs', 'sunk', 'carrierFoundering', 'survivors', 'scanOrPhotographs', 'tracking']) {
    const of = cases.map((c, i) => [c.rule, credit[i]]).filter(([r]) => r === kind).map(([, v]) => v);
    assert.ok(of.some(Boolean) && of.some(v => !v), 'credit given and refused: ' + kind);
  }
  sameResults(await elm('earlyEnd.partialCredit', cases.map(c => [c.s])), credit);
});

test('ending the patrol early matches: outcome, status, log and debrief', async () => {
  const cases = extractions();
  const expected = cases.map(({s}) => { const c = structuredClone(s); const outcome = endPatrolEarly(c); return exact({outcome, state: {status: c.status, events: c.events, debrief: c.debrief}}); });
  const outcomes = new Set(expected.map(e => e.outcome));
  for (const o of ['partial', 'withdrawn', null]) assert.ok(outcomes.has(o), 'an outcome: ' + o);
  sameResults(await elm('earlyEnd.endPatrolEarly', cases.map(c => [c.s])), expected);
});

test('the partial summary matches, and only missions with partial credit have one', async () => {
  const cases = extractions();
  const expected = cases.map(({s}) => { try { return partialSummary(s); } catch { return null; } });
  cases.forEach((c, i) => assert.equal(expected[i] === null, c.rule === null || c.rule === 'none', c.s.mission));
  assert.ok(new Set(expected.filter(Boolean).map(t => t.replace(/\d+/g, '#'))).size >= 6, 'a summary for every rule');
  sameResults(await elm('earlyEnd.partialSummary', cases.map(c => [c.s])), expected);
});
