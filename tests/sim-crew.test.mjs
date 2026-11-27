import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as reports from '../src/patrol-reports.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';

test('Elm crew reports replace, expire and log as the TypeScript does', async () => {
  const random = seeded(121), calls = [];
  for (let run = 0; run < 60; run++) {
    const s = {time: random() * 100, reports: [], events: []};
    for (let i = 0; i < 80; i++) {
      s.time += [0, 1, 5, 17.99, 18, 30][Math.floor(random() * 6)];
      const id = 'r' + Math.floor(random() * 4), text = random() < .3 && s.events.length ? s.events[0].text : 'Report ' + Math.floor(random() * 9);
      calls.push([structuredClone(s), id, text]);
      reports.report(s, id, text);
    }
  }
  sameResults(await elm('patrolReports.report', calls), calls.map(([s, id, text]) => {const c = structuredClone(s); reports.report(c, id, text); return {reports: c.reports, events: c.events};}));
});

test('Elm records civilian hits once and finds the captain at fault as the TypeScript does', async () => {
  const random = seeded(122), hits = [];
  for (let run = 0; run < 40; run++) {
    const s = {time: 0};
    if (run % 2) s.debrief = [];
    const ships = Array.from({length: 4}, (_, i) => ({id: 'v' + i, name: 'V' + i}));
    for (let i = 0; i < 240; i++) {
      s.time += [0, 1, 3.99, 4, 10][i % 5];
      const ship = ships[Math.floor(random() * ships.length)], cause = 'Struck ' + ['a trawler', 'a liner'][Math.floor(random() * 2)];
      if (random() < .5) delete ship.neutralHitAt;
      hits.push([structuredClone(s), structuredClone(ship), cause]);
      reports.recordCivilianHit(s, ship, cause);
    }
  }
  const expected = hits.map(([s, ship, cause]) => {const c = structuredClone(s), v = structuredClone(ship); reports.recordCivilianHit(c, v, cause); return {debrief: c.debrief ?? [], neutralHitAt: v.neutralHitAt ?? null};});
  assert.ok(expected.some(r => r.debrief.length === 48), 'the debrief keeps its last 48 entries');
  sameResults(await elm('patrolReports.recordCivilianHit', hits), expected);
  const findings = [];
  for (let i = 0; i < 1500; i++) {
    const ships = Array.from({length: i % 6}, (_, j) => {
      const v = {id: 'v' + j, name: 'Vessel ' + j};
      if (random() < .5) v.military = random() < .5;
      if (random() < .4) v.side = random() < .5 ? 'friendly' : 'hostile';
      if (random() < .3) v.playerDamaged = random() < .7;
      if (random() < .2) v.neutralHitAt = random() * 600;
      return v;
    });
    findings.push([{ships, patrol: {seed: Math.floor(random() * 2 ** 32)}}]);
  }
  const verdicts = findings.map(([s]) => reports.disciplinaryFinding(s));
  assert.ok(verdicts.some(f => f === null) && verdicts.some(f => f?.reason.includes('Civilian') && f.reason.includes('Friendly')) && new Set(verdicts.map(f => f?.title)).size === 3, 'findings of each kind');
  sameResults(await elm('patrolReports.disciplinaryFinding', findings), verdicts);
});

test('Elm plots heard wrecks as the TypeScript does', async () => {
  const random = seeded(123), calls = [];
  for (let i = 0; i < 2000; i++) {
    const ships = Array.from({length: 1 + i % 4}, (_, j) => {const v = {id: 'v' + (j % 3), name: 'V'}; if (random() < .25) v.wreckMark = {x: 1, y: 2, observed: random() < .5}; return v;});
    const source = {id: Math.floor(random() * 5000), x: (random() - .5) * 8000, y: (random() - .5) * 8000};
    if (random() < .9) source.vessel = 'v' + Math.floor(random() * 4);
    calls.push([{x: (random() - .5) * 8000, y: (random() - .5) * 8000, ships}, source]);
  }
  const expected = calls.map(([s, source]) => {const c = structuredClone(s); reports.hearWreck(c, source); return c.ships.map(v => v.wreckMark ?? null);});
  assert.ok(expected.some((marks, i) => marks.some((m, j) => m && !calls[i][0].ships[j].wreckMark)), 'wrecks are plotted');
  sameResults(await elm('patrolReports.hearWreck', calls), expected);
});
