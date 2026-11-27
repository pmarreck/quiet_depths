import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as suspicion from '../src/suspicion.js';
import {elm, seeded} from './sim-harness.mjs';

const kinds = ['merchant', 'escort', 'fishing', 'carrier', 'sub'];
const ids = ['kestrel', 'gull-2', 'A', '', 'ship 🚢', '\ud800lone', 'lone\udc00', '🚢🚢x'];
const touched = v => {const out = {alert: v.alert, heading: v.heading}; if (v.clue) out.clue = v.clue; if (v.nextInquiry !== undefined) out.nextInquiry = v.nextInquiry; return out;};

function world(random) {
  return {x: (random() - .5) * 4000, y: (random() - .5) * 4000, time: random() * 900, heading: random() * 360, depth: random() * 200,
    patrol: {seed: Math.floor(random() * 2 ** 32)}, difficulty: {pingDetection: random() * 1.2, detection: .4 + random() * 1.4, pursuit: .4 + random() * 1.6}};
}
function watcher(random, s, i) {
  const v = {x: s.x + (random() - .5) * 5000, y: s.y + (random() - .5) * 5000, alert: random() < .1 ? 0 : random() * 100, heading: random() * 360,
    id: ids[i % ids.length] + (i % 3 ? i : ''), kind: kinds[i % 5]};
  if (random() < .7) v.depth = random() * 150;
  if (random() < .5) v.clue = {x: (random() - .5) * 6000, y: (random() - .5) * 6000, time: s.time - random() * 300};
  if (random() < .4) v.nextInquiry = s.time + (random() - .5) * 80;
  return v;
}

test('Elm reads each code point as JavaScript for..of does', async () => {
  const texts = [...ids, '􏿿\ud800', '\udc00𐀀', ...Array.from({length: 2000}, (_, i) => String.fromCharCode(...Array.from({length: i % 9}, (_, j) => (i * 7919 + j * 104729) % 3 ? 0x61 + j : 0xd7f0 + ((i + j) * 37) % 0x830)))];
  assert.deepEqual(await elm('text.codePointUnits', texts.map(t => [t])), texts.map(t => Array.from(t, c => c.charCodeAt(0))));
});

test('Elm suspicion labels, clues and imaging risk match the TypeScript', async () => {
  const random = seeded(91);
  const pursuits = [.4, 1, 2, NaN].map(p => [p]);
  assert.deepEqual(await elm('suspicion.searchSeconds', pursuits), pursuits.map(([p]) => suspicion.searchSeconds(p)));
  const labels = [];
  for (const level of [0, 11.999, 12, 29.99, 30, 59.99, 60, 100, NaN]) for (const ships of [[], [{tracking: 'tracking'}], [{tracking: null}, {}], [{tracking: 'lost'}]]) labels.push([level, ships]);
  assert.deepEqual(await elm('suspicion.suspicionLabel', labels), labels.map(([l, ships]) => suspicion.suspicionLabel(l, ships)));
  const leaves = Array.from({length: 600}, (_, i) => {const s = world(random); return [s, watcher(random, s, i), [0, 12, 24, 65, 120][i % 5], {x: (random() - .5) * 7000, y: (random() - .5) * 7000, time: random() * 900}];});
  leaves.push([world(random), {x: 0, y: 0, alert: 99, heading: 0, id: 'a', kind: 'sub'}, 12, {x: -600, y: 599.999, time: 3}]);
  assert.deepEqual(await elm('suspicion.leaveClue', leaves), leaves.map(([s, v, amount, observed]) => {const c = structuredClone(v); suspicion.leaveClue(s, c, amount, observed); return touched(c);}));
  // Transmissions at every range and beat, each instrument and profile, many watchers.
  const images = [];
  for (let i = 0; i < 6000; i++) {
    const s = world(random), v = watcher(random, s, i);
    if (i % 4 === 0) {v.x = s.x + Math.sin(s.heading * Math.PI / 180) * 300; v.y = s.y + Math.cos(s.heading * Math.PI / 180) * 300; v.depth = s.depth + 20;}
    images.push([s, v, i % 2 ? 'painter' : 'scribbler', i % 3 ? 'survey' : 'detail', Math.floor(random() * 4000) + (i % 7 === 0 ? .5 : 0)]);
  }
  const imaged = images.map(([s, v, mode, profile, beat]) => {const c = structuredClone(v); suspicion.imagerClue(s, c, mode, profile, beat); return touched(c);});
  assert.ok(imaged.filter((c, i) => c.clue && c.clue !== images[i][1].clue && JSON.stringify(c.clue) !== JSON.stringify(images[i][1].clue)).length > 100, 'transmissions leave clues');
  assert.deepEqual(await elm('suspicion.imagerClue', images), imaged);
});

test('Elm watchers forget stale clues, steer toward fresh ones and inquire as the TypeScript does', async () => {
  const random = seeded(92), actives = [], searches = [];
  for (let run = 0; run < 150; run++) {
    const s = world(random), v = watcher(random, s, run);
    v.clue ??= {x: s.x + (random() - .5) * 3000, y: s.y + (random() - .5) * 3000, time: s.time};
    for (let i = 0; i < 80; i++) {
      const dt = [.25, 1, 1 / 60][i % 3];
      s.time += dt;
      actives.push([structuredClone(s), structuredClone(v)]);
      const clue = suspicion.activeClue(s, v);
      searches.push([structuredClone(s), structuredClone(v), dt, clue ?? null]);
      suspicion.searchClue(s, v, dt, clue);
      if (i === 40) v.alert = random() < .5 ? .9 : v.alert;
    }
  }
  // Exactly at the staleness limit and at the inquiry time.
  const edge = {...world(random), time: 200}, limit = suspicion.searchSeconds(edge.difficulty.pursuit);
  actives.push([edge, {x: 0, y: 0, alert: 5, heading: 0, id: 'e', kind: 'escort', clue: {x: 1, y: 1, time: 200 - limit}}], [edge, {x: 0, y: 0, alert: 1, heading: 0, id: 'e', kind: 'escort', clue: {x: 1, y: 1, time: 199}}]);
  searches.push([edge, {x: 0, y: 0, alert: 5, heading: 90, id: 'e', kind: 'sub', nextInquiry: 200}, .25, {x: 0, y: 140, time: 199}], [edge, {x: 0, y: 0, alert: 5, heading: 90, id: 'e', kind: 'escort', nextInquiry: 200.001}, .25, {x: 0, y: 140.001, time: 199}]);
  const activeExpected = actives.map(([s, v]) => {const c = structuredClone(v), clue = suspicion.activeClue(s, c); return {clue: clue ?? null, watcher: touched(c)};});
  assert.ok(activeExpected.some(a => a.clue === null) && activeExpected.some(a => a.clue), 'clues are kept and forgotten');
  assert.deepEqual(await elm('suspicion.activeClue', actives), activeExpected);
  const searchExpected = searches.map(([s, v, dt, clue]) => {const c = structuredClone(v), due = suspicion.searchClue(s, c, dt, clue ?? undefined); return {due, watcher: touched(c)};});
  assert.ok(searchExpected.some(r => r.due) && searchExpected.some(r => !r.due), 'inquiries come due');
  assert.deepEqual(await elm('suspicion.searchClue', searches), searchExpected);
});
