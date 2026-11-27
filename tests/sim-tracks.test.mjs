import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save} from '../src/sim.js';
import {fixContact, applyReconPacket, chartContacts} from '../src/track-estimates.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';

const plain = v => JSON.parse(JSON.stringify(v));
function patrols() {
  const states = [];
  for (const [mission, seed] of [['recon', 11], ['seek-and-destroy', 12], ['big-kahuna', 13], ['tiebreaker', 14], ['seek-and-destroy-sub', 15], ['wolf-in-the-henhouse', 16]]) {
    const s = createGame(mission, seed * 7919, {longPatrol: seed % 2 === 0});
    s.scope = true; s.targetDepth = 12;
    for (let t = 1; t <= 900; t++) { step(s, .25, {timeRate: 1, observation: 'scope'}); if (t % 150 === 0) states.push(JSON.parse(save(s))); }
  }
  return states;
}
const states = patrols();

test('Elm fixes contacts from observations as the TypeScript does', async () => {
  const random = seeded(131), calls = [];
  const held = states.flatMap(s => s.contacts).slice(0, 200);
  for (let i = 0; i < 3000; i++) {
    const c = i % 4 ? structuredClone(held[i % held.length]) : {};
    const t = c.fix ? c.fix.time + [-1, 0, 1e-9, 5][i % 4] : random() * 600;
    const o = {x: (random() - .5) * 9000, y: (random() - .5) * 9000, time: t};
    if (i % 3) Object.assign(o, {vx: random() * 4, vy: -random() * 4});
    if (i % 5 === 1) o.positionSigma = [0, 300, -1, null][i % 4];
    if (i % 7 === 2) o.velocitySigma = [0, .25, -0.01, 'slow'][i % 4];
    if (i % 11 === 3) o.maneuverSigma = [0, .008, null][i % 3];
    if (i % 13 === 4) o.source = ['', 'satellite', 'lamp'][i % 3];
    if (i % 17 === 5) [o.x, o.time, o.vx] = [[NaN, o.time, o.vx], [o.x, -1, o.vx], [o.x, o.time, 'fast']][i % 3];
    if (i % 19 === 6) delete o.y;
    calls.push([c, o]);
  }
  const expected = calls.map(([c, o]) => { const d = structuredClone(c), accepted = fixContact(d, o); return plain({accepted, fix: d.fix ?? null}); });
  assert.ok(expected.filter(r => r.accepted).length > 1000 && expected.filter(r => !r.accepted).length > 200, 'observations accepted and refused');
  sameResults(await elm('trackEstimates.fixContact', calls), expected);
});

test('Elm folds reconnaissance packets into the contacts as the TypeScript does', async () => {
  const random = seeded(132), calls = [];
  for (const s of states.filter(s => s.ships.length)) for (let k = 0; k < 40; k++) {
    const capturedAt = s.time - random() * 60, receivedAt = capturedAt + random() * (s.time - capturedAt);
    const tracks = s.ships.slice(0, 1 + (k % s.ships.length)).map((v, j) => {
      const t = {id: j % 3 === 2 ? 'new-' + j : v.id, x: v.x + (random() - .5) * 200, y: v.y + (random() - .5) * 200};
      if (j % 2) Object.assign(t, {vx: random() * 3, vy: random() * 3, time: capturedAt - random() * 30});
      if (j % 4 === 1) t.positionSigma = [0, 10, 300, 2000][k % 4];
      if (j % 3 === 0) Object.assign(t, {identified: true, name: v.name, side: ['friendly', 'hostile', 'neutral', undefined][k % 4], kind: v.kind, military: [true, false, 'yes'][k % 3]});
      if (j % 5 === 4) Object.assign(t, {identified: true, name: 5});
      // A name the track does not vouch for is ignored.
      if (j % 7 === 6) Object.assign(t, {identified: false, name: 'Unvouched', side: 'hostile'});
      return t;
    });
    const packet = {tracks, capturedAt, receivedAt};
    const chosen = [{}, {receivedAt: s.time + 1}, {capturedAt: receivedAt + 1}, {tracks: [...tracks, tracks[0]]}, {tracks: [...tracks, {...tracks[0], id: 'later', time: capturedAt + 5}]},
      {tracks: [...tracks, {id: 7, x: 1, y: 1}]}, {tracks: [...tracks, null]}, {tracks: Array.from({length: 257}, (_, j) => ({id: 'm' + j, x: j, y: j}))}, {}, {}][k % 10] ?? {};
    const variant = {...chosen};
    const state = {time: s.time, x: s.x, y: s.y, contacts: structuredClone(s.contacts), nextId: [s.nextId, undefined, 0, 1.5, 7][k % 5]};
    // Two contacts sharing an id: the packet updates the first, as find does.
    if (k % 10 === 9 && state.contacts.length) {
      state.contacts.push({...state.contacts[0], label: 'Z9'});
      variant.tracks = [...tracks, {id: state.contacts[0].id, x: 5, y: 6, identified: true, name: 'Twin'}];
    }
    calls.push([state, {...packet, ...variant}]);
  }
  const expected = calls.map(([s, p]) => { const c = structuredClone(s), applied = applyReconPacket(c, structuredClone(p)); return plain(applied ? {applied, contacts: c.contacts, nextId: c.nextId} : {applied}); });
  assert.ok(expected.filter(r => r.applied).length > 100 && expected.filter(r => !r.applied).length > 100, 'packets applied and refused');
  assert.ok(expected.some(r => r.applied && r.contacts.some(c => c.method === 'satellite' && c.label)), 'packets add satellite contacts');
  sameResults(await elm('trackEstimates.applyReconPacket', calls), expected);
});

test('the Elm omniscient chart matches the TypeScript', async () => {
  const calls = [];
  for (const s of states) for (const [omniscientChart, search] of [[false, false], [true, false], [true, true]]) {
    const c = structuredClone(s); c.difficulty = {...c.difficulty, omniscientChart};
    if (search) c.search ??= {}; else delete c.search;
    calls.push([c]);
  }
  const expected = calls.map(([s]) => plain(chartContacts(structuredClone(s))));
  assert.ok(expected.some(list => list.some(c => c.exact)) && expected.some(list => list.some(c => c.exact && c.depthEstimate !== undefined)), 'exact marks, for submarines too');
  sameResults(await elm('trackEstimates.chartContacts', calls), expected);
});
