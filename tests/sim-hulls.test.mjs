import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveTraffic, hullContact, keelLimit, pushOffShoal} from '../src/hull-contacts.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {bottom} from '../src/mechanics.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const kinds = ['merchant', 'escort', 'fishing', 'carrier', 'sub'];
// A point over water between `low` and `high` meters deep on this chart.
function shoal(random, seed, low, high) {
  for (let i = 0; i < 4000; i++) {
    const x = (random() - .5) * 30000, y = (random() - .5) * 34000, d = bottom(x, y, seed);
    if (d >= low && d <= high) return {x, y};
  }
  return {x: 0, y: 0};
}
function scenario(random, i) {
  const seed = Math.floor(random() * 2 ** 32), at = i % 3 === 0 ? shoal(random, seed, -15, 30) : {x: (random() - .5) * 6000, y: (random() - .5) * 6000};
  const s = {...at, depth: [5, 12, 40, 90][i % 4] + random() * 5, heading: random() * 360, pitch: (random() - .5) * .2, speed: random() * 14 - 2, verticalSpeed: random() - .5,
    time: 100 + random() * 500, site: null, ships: [], environment: {chartSeed: seed}, collisionHits: {}, systems: {periscope: [100, 30, 0][i % 3]}, repairLimits: {periscope: 100},
    scope: i % 2 === 0, events: [], hull: 100};
  if (i % 5 === 0) s.scopeTravel = random();
  if (i % 3 === 1) s.debrief = [];
  if (i % 4 === 2) s.site = {x: s.x + (random() - .5) * 80, y: s.y + (random() - .5) * 80, hull: 100, depth: s.depth + (random() - .5) * 20, heading: random() * 360, kind: ['surface', 'wreck', 'sub'][i % 3], name: 'Site', speed: i % 8 === 6 ? 2 : 0};
  for (let j = 0; j < 1 + i % 5; j++) {
    const kind = kinds[(i + j) % 5], near = random() < .8, sunk = random() < .15;
    const v = {id: 'v' + j, name: 'Vessel ' + j, kind, x: s.x + (random() - .5) * (near ? 120 : 2000), y: s.y + (random() - .5) * (near ? 120 : 2000), heading: random() * 360,
      speed: random() * 14, hull: sunk ? 0 : 50 + random() * 50, alert: 0, attack: 0, sinkDepth: random() * 20, flood: 0, disabled: false};
    if (kind === 'sub') v.depth = s.depth + (random() - .5) * 30;
    else if (random() < .3) v.depth = random() * 3;
    if (kind === 'carrier') Object.assign(v, {directHits: Math.floor(random() * 4), fighterCount: 2});
    if (random() < .7) v.military = kind === 'escort' || kind === 'carrier' || kind === 'sub' || random() < .3;
    if (sunk) v.sunkAt = s.time - random() * 60;
    if (random() < .2) v.verticalSpeed = (random() - .5) * 2;
    if (random() < .2) v.groundedAt = s.time - random() * 10;
    if (random() < .2) v.pitch = (random() - .5) * .1;
    s.ships.push(v);
  }
  // A neutral ship on her last hull points, right under the boat.
  if (i % 25 === 11) s.ships.push({id: 'neutral', name: 'Mairi', kind: 'fishing', x: s.x + 3, y: s.y + 2, depth: s.depth, heading: s.heading + 180, speed: 9,
    hull: 1, alert: 0, attack: 0, sinkDepth: 0, military: false, flood: 0, disabled: false});
  // A neutral sunk by another ship, far from the boat: no one blames the captain.
  if (i % 25 === 13) s.ships.push({id: 'tanker', name: 'Tanker', kind: 'merchant', x: s.x + 900, y: s.y, heading: 0, speed: 12, hull: 90, alert: 0, attack: 0, sinkDepth: 0, military: false},
    {id: 'drifter', name: 'Drifter', kind: 'fishing', x: s.x + 903, y: s.y + 2, heading: 180, speed: 9, hull: 1, alert: 0, attack: 0, sinkDepth: 0, military: false});
  if (i % 7 === 3) for (const v of s.ships.slice(0, 2)) s.collisionHits[['boat', v.id].sort().join('/')] = s.time - [1, 3.99, 4][i % 3];
  return s;
}
function body(random) {
  const b = {x: (random() - .5) * 300, y: (random() - .5) * 300, heading: random() * 360, speed: random() * 10};
  const kind = [undefined, 'sub', 'wreck', 'surface', ...kinds][Math.floor(random() * 9)];
  if (kind) b.kind = kind;
  if (random() < .8) b.depth = random() * 60;
  if (random() < .5) b.pitch = (random() - .5) * .3;
  if (random() < .3) b.roll = (random() - .5) * .3;
  return b;
}

test('Elm hull shapes meet, ground and slide off shoals as the TypeScript does', async () => {
  const random = seeded(141), pairs = [];
  for (let i = 0; i < 6000; i++) { const a = body(random), b = body(random); if (i % 3 === 0) Object.assign(b, {x: a.x + (random() - .5) * 40, y: a.y + (random() - .5) * 40, depth: a.depth}); pairs.push([a, b]); }
  pairs.push([{x: 0, y: 0, depth: 10, heading: 30, speed: 1}, {x: 0, y: 0, depth: 10, heading: 30, speed: 1}]);
  // Hulls a hair off parallel, between the two determinant thresholds.
  // Side by side, and overlapping only partly, so the closest point is interior.
  const ahead = (d, side) => ({x: d * Math.sin(40 * Math.PI / 180) + side * Math.cos(40 * Math.PI / 180), y: d * Math.cos(40 * Math.PI / 180) - side * Math.sin(40 * Math.PI / 180)});
  for (const off of [1e-6, 3e-6, 1e-5, 1e-4]) for (const along of [0, 20, 60, 95])
    pairs.push([{x: 0, y: 0, depth: 10, heading: 40, speed: 1, kind: 'merchant'}, {...ahead(along, 6), depth: 10, heading: 40 + off, speed: 1, kind: 'merchant'}]);
  // A pitched carrier's stern reaches a submarine 35 m below its center, past the 32 m early exit.
  pairs.push([{x: 0, y: 0, depth: 0, heading: 0, pitch: .3, speed: 0, kind: 'carrier'}, {x: 0, y: -87.9, depth: 35, heading: 0, speed: 0, kind: 'sub'}]);
  const contacts = pairs.map(([a, b]) => hullContact(a, b));
  assert.ok(contacts.filter(Boolean).length > 1000, 'hulls touch');
  sameResults(await elm('hullContacts.hullContact', pairs), contacts);
  const keels = Array.from({length: 1500}, (_, i) => { const seed = Math.floor(random() * 2 ** 32), b = {...body(random), ...(i % 2 ? shoal(random, seed, -30, 40) : {})}; return [b, seed]; });
  sameResults(await elm('hullContacts.keelLimit', keels), keels.map(([b, seed]) => keelLimit(b, seed)));
  const shoves = keels.map(([b, seed], i) => [{x: b.x, y: b.y}, [0, 3, 40][i % 3], seed]);
  sameResults(await elm('hullContacts.pushOffShoal', shoves), shoves.map(([p, overlap, seed]) => { const q = {...p}; pushOffShoal(q, overlap, seed); return q; }));
});

test('Elm resolves traffic, pair by pair, as the TypeScript does', async () => {
  const random = seeded(142), scenes = Array.from({length: 1200}, (_, i) => scenario(random, i));
  const expected = scenes.map(s => {
    const c = structuredClone(s), collisions = [];
    listenForReplayEvents(c, {mark: (time, e) => collisions.push(e)});
    c.hurts = [];
    resolveTraffic(c, (st, severity, text, part) => { st.hurts.push({severity, text, part}); st.hull -= severity * .1; });
    return exact({x: c.x, y: c.y, depth: c.depth, speed: c.speed, verticalSpeed: c.verticalSpeed, site: c.site, ships: c.ships, collisionHits: c.collisionHits, systems: c.systems,
      repairLimits: c.repairLimits, scope: c.scope, scopeTravel: c.scopeTravel ?? null, events: c.events, debrief: c.debrief ?? [], collisions, hurts: c.hurts, hull: c.hull});
  });
  const count = f => expected.filter(f).length;
  assert.ok(count(r => r.hurts.length) > 100, 'the boat collides');
  assert.ok(count(r => r.ships.some((v, j) => v.groundedAt !== scenes[expected.indexOf(r)].ships[j].groundedAt)) > 20, 'ships ground');
  assert.ok(count(r => r.events.some(e => e.text.startsWith('Periscope sheared'))) > 5, 'periscopes shear');
  assert.ok(count(r => r.debrief.some(d => d.text.includes('collided with the neutral'))) > 5, 'civilian losses are recorded');
  assert.ok(count(r => r.ships.some(v => v.id === 'drifter' && v.hull === 0 && v.neutralHitAt === undefined)) > 5, 'ships sink neutrals without blame');
  sameResults(await elm('hullContacts.resolveTraffic', scenes.map(s => [s])), expected);
});
