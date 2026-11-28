import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, restore} from '../src/sim.js';
import {isVisible, contact, recordLampContact, ping, photograph, decoy, dropDepthCharge} from '../src/patrol-contacts.js';
import {putTorpedoInWater} from '../src/torpedo-run.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The boat's fields the shared harness encodes, as tests/sim-combat.test.mjs picks them.
const FIELDS = ['time', 'x', 'y', 'depth', 'heading', 'pitch', 'speed', 'targetSpeed', 'targetHeading', 'targetDepth', 'verticalSpeed', 'hull', 'outerHull', 'flood', 'shock', 'fuel',
  'fuelLeak', 'fuelFire', 'battery', 'oxygen', 'water', 'ballast', 'planes', 'rudder', 'propAngle', 'noise', 'repair', 'collisionCooldown', 'criticalExposure', 'status', 'rng', 'silent',
  'floodAlarm', 'bottomed', 'torps', 'cookoff', 'engine', 'dieselMode', 'pressureAlarm', 'imploded', 'scope', 'collisionHits', 'systems', 'repairLimits', 'drone', 'impacts',
  'weaponSequence', 'events', 'debrief', 'acoustics', 'soundSequence', 'roll', 'cavitation', 'propRpm', 'gunLoudUntil', 'unpoweredSince', 'scopeTravel'];
const MORE = ['contacts', 'nextId', 'pingAge', 'pingCooldown', 'torpedoTracks', 'ships', 'photos', 'photoCooldown', 'decoys', 'alert', 'blasts'];
const pick = (random, list) => list[Math.floor(random() * list.length)];
const bearingTo = (a, b) => (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
const shipOut = ship => { const c = exact(ship); if (c.tracking === null) delete c.tracking; return c; };

// A call in the TypeScript on a copy of the input, with the replay events it
// announced and the invalid numbers it refused, encoded as the harness encodes it.
function run(input, call) {
  const w = structuredClone(input), replay = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {result, reports: invalid} = collectInvalidNumbers(() => call(w));
  const picked = Object.fromEntries(FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));
  if (picked.debrief === undefined) picked.debrief = [];
  const extra = Object.fromEntries(['search', 'noisemaker'].filter(k => w[k]).map(k => [k, w[k]]));
  return {result, output: exact({...picked, ...Object.fromEntries(MORE.map(k => [k, w[k]])), ...extra, ships: w.ships.map(shipOut), replay, invalid})};
}

// Patrols played long enough to hold contacts and torpedo tracks: a convoy's
// passive bearings, the fleet action's echoes, a long patrol's search site,
// and the reconnaissance patrol's merchants.
let played = null;
function worlds() {
  if (played) return played;
  played = [['recon', {}], ['tiebreaker', {}], ['seek-and-destroy-sub', {}], ['survey', {longPatrol: true}], ['intercept', {}]].map(([m, difficulty]) => {
    const s = createGame(m, 13, {weather: 'clear', timeOfDay: 'day', changing: false, difficulty});
    Object.assign(s, {targetDepth: 12, scope: true, targetSpeed: 3});
    for (let t = 0; t < 400; t++) step(s, .25, {timeRate: 1, observation: 'scope'});
    const w = restore(save(s));
    if (m === 'intercept') w.convoy = {message: null, pin: null, number: 0, round: 0, next: 100, shot: null};
    return w;
  });
  return played;
}

test('contact reports match by every method, refixing as fixes age and the periscope holds a ship', async () => {
  const random = seeded(171), calls = [];
  for (const base of worlds()) {
    const w = structuredClone(base);
    for (let n = 0; n < 120; n++) {
      w.time += pick(random, [.5, 2, 6]);
      const v = pick(random, w.ships), method = pick(random, ['passive', 'active', 'visual', 'lights']);
      // Some ships close aboard, where a sighting's uncertainty reaches its floor,
      // and submarines deeper than an estimate may report.
      if (random() < .15) Object.assign(v, {x: w.x + (random() - .5) * 700, y: w.y + (random() - .5) * 700});
      if (v.kind === 'sub' && random() < .3) v.depth = pick(random, [40, 315, 340]);
      const ship = random() < .2 ? {id: v.id, x: v.x + 30, y: v.y - 40} : random() < .1 ? {...v, id: 'stranger-' + n} : v;
      const sightedIn = s => s.ships.find(x => x === ship || x.id === ship.id && ship === v) ?? structuredClone(ship);
      const input = exact(w), {result, output} = run(input, s => contact(s, sightedIn(s), method));
      calls.push({input, ship: exact(ship), method, expected: [exact(result), output]});
      contact(w, sightedIn(w), method);
    }
  }
  const outs = calls.map(c => c.expected[1]);
  assert.ok(calls.some(c => c.expected[0].fix && c.input.contacts.find(k => k.id === c.ship.id)?.fix && c.expected[0].fix.time !== c.input.contacts.find(k => k.id === c.ship.id).fix.time), 'refixed contacts');
  assert.ok(outs.some(o => o.events.some(e => e.text.startsWith('New contact.'))), 'new contacts');
  sameResults(await elm('patrolContacts.contact', calls.map(c => [c.input, c.ship, c.method])), calls.map(c => c.expected));
});

test('the active ping matches: torpedoes, the fleet\'s volleys, the search site, contacts and who hears it', async () => {
  const random = seeded(172), calls = [];
  for (const base of worlds()) for (let n = 0; n < 40; n++) {
    const w = structuredClone(base);
    w.time += n * 3;
    Object.assign(w, {pingCooldown: pick(random, [0, 0, 0, 4]), status: pick(random, ['patrol', 'patrol', 'patrol', 'won']), rng: 1 + Math.floor(random() * 2 ** 30)});
    w.systems = {...w.systems, sonar: pick(random, [100, 100, 50, 0])};
    w.difficulty = {...w.difficulty, pingDetection: pick(random, [.9, 1, .3])};
    const near = pick(random, w.ships);
    if (random() < .5) putTorpedoInWater(w, 'enemy', {x: w.x + 800, y: w.y, depth: w.depth}, 270, w.depth, {heading: 270, launcher: near.id, aim: {x: w.x, y: w.y}});
    if (random() < .5) putTorpedoInWater(w, 'player', {x: w.x, y: w.y, depth: w.depth}, 90, 20, {intended: near.id});
    for (const v of w.ships) if (random() < .3) Object.assign(v, {x: w.x + (random() - .5) * 9000, y: w.y + (random() - .5) * 9000});
    if (random() < .5) putTorpedoInWater(w, 'player', {x: w.x + pick(random, [5500, 6500]), y: w.y, depth: w.depth}, 90, w.depth, {});
    if (w.search && random() < .5) w.search.located = false;
    if (w.site && random() < .5) Object.assign(w.site, {x: w.x + pick(random, [400, 1450, 1550, 2000]), y: w.y, depth: w.depth});
    // Volleys in flight on and under the water near the ping's reach.
    if (w.battle && random() < .7) w.battle.volleys = [0, 1, 2].map(k => {
      const d = pick(random, [3000, 5500, 6500]), from = {x: w.x + d, y: w.y + k * 40, altitude: -10}, to = {x: w.x - d, y: w.y + k * 40, altitude: -10};
      return {id: 9000 + n * 3 + k, underwater: random() < .6, from, to, source: w.ships[0].id, target: w.ships[1].id, launched: w.time - 2, arrives: w.time + 600, damage: 0};
    });
    for (const v of w.ships) if (random() < .25) v.disabled = true;
    // Contacts already holding a guess at their side.
    for (const c of w.contacts) if (random() < .5 && !c.identified) c.probableSide = pick(random, ['friendly', 'hostile']);
    for (const v of w.ships) if (v.kind === 'sub' && random() < .3) v.depth = pick(random, [315, 340]);
    const input = exact(w), {result, output} = run(input, s => ping(s));
    calls.push({input, expected: [result, output]});
  }
  const outs = calls.map(c => c.expected[1]);
  assert.ok(calls.some(c => c.expected[0]) && calls.some(c => !c.expected[0]), 'pings made and refused');
  assert.ok(outs.some(o => o.torpedoTracks.length) && outs.some(o => o.ships.some(v => v.clue)), 'torpedo tracks and clues left');
  sameResults(await elm('patrolContacts.ping', calls.map(c => [c.input])), calls.map(c => c.expected));
});

test('photographs, sightings, the noisemaker, depth charges and lamp fixes match', async () => {
  const random = seeded(173), photos = [], sights = [], decoys = [], charges = [], lamps = [];
  for (const base of worlds()) for (let n = 0; n < 40; n++) {
    const w = structuredClone(base);
    Object.assign(w, {depth: pick(random, [10, 12, 15.5, 18]), scope: random() < .85, photoCooldown: pick(random, [0, 0, 2]), decoys: pick(random, [0, 3]), status: pick(random, ['patrol', 'patrol', 'lost'])});
    for (const v of w.ships) if (random() < .3) v.incidental = true;
    w.systems = {...w.systems, periscope: pick(random, [100, 30, 0])};
    const v = pick(random, w.ships), look = (bearingTo(w, v) + pick(random, [0, 3, -4.5, 6, 20, 30]) + 360) % 360;
    if (random() < .4) Object.assign(v, {x: w.x + (random() - .5) * 3000, y: w.y + (random() - .5) * 3000, kind: pick(random, ['merchant', v.kind]), hull: pick(random, [100, 100, 0])});
    photos.push({input: exact(w), look, expected: (r => [r.result, r.output])(run(exact(w), s => photograph(s, look)))});
    for (const ship of w.ships) { const seen = random() < .3 ? null : look; sights.push({input: exact(w), ship: shipOut(ship), look: seen, expected: isVisible(w, ship, seen)}); }
    decoys.push({input: exact(w), expected: (r => [r.result, r.output])(run(exact(w), s => decoy(s)))});
    const order = {x: w.x + random() * 50, y: w.y, depth: pick(random, [20, 60]), ...(random() < .5 ? {delay: pick(random, [3, 9])} : {}), ...(random() < .5 ? {kind: pick(random, ['bomb', 'charge'])} : {})};
    charges.push({input: exact(w), order, expected: (r => [exact(r.result), r.output])(run(exact(w), s => dropDepthCharge(s, order)))});
    const target = random() < .5 && w.contacts.length ? pick(random, w.contacts).id : 'lamp-' + n;
    const fix = {text: 'Hunter', x: w.x + 500, y: w.y - 300, time: w.time - pick(random, [0, 5, 400]), radius: 200, sender: 'kestrel', number: n, target, depth: 80, course: random() * 360, speed: pick(random, [0, 4])};
    lamps.push({input: exact(w), fix, expected: run(exact(w), s => recordLampContact(s, fix)).output});
  }
  // A merchant framed dead ahead that is incidental traffic, with or without a
  // listed merchant a few degrees off: only the listed one may be photographed.
  for (const base of worlds()) for (const [offset, incidental] of [[0, true], [0, false], [3, true]]) {
    const w = structuredClone(base);
    Object.assign(w, {depth: 10, scope: true, photoCooldown: 0, status: 'patrol'});
    w.systems = {...w.systems, periscope: 100};
    const [first, second] = w.ships;
    Object.assign(first, {kind: 'merchant', hull: 100, incidental, x: w.x + Math.sin(w.heading * Math.PI / 180) * 800, y: w.y + Math.cos(w.heading * Math.PI / 180) * 800});
    if (second) Object.assign(second, {kind: 'merchant', hull: 100, incidental: false, x: w.x + Math.sin((w.heading + offset + 2) * Math.PI / 180) * 900, y: w.y + Math.cos((w.heading + offset + 2) * Math.PI / 180) * 900});
    photos.push({input: exact(w), look: w.heading, expected: (r => [r.result, r.output])(run(exact(w), s => photograph(s, w.heading)))});
  }
  assert.ok(photos.some(p => p.expected[0]) && photos.some(p => !p.expected[0]), 'photographs taken and missed');
  assert.ok(sights.some(s => s.expected) && sights.some(s => !s.expected), 'ships seen and unseen');
  sameResults(await elm('patrolContacts.photograph', photos.map(p => [p.input, p.look])), photos.map(p => p.expected));
  sameResults(await elm('patrolContacts.isVisible', sights.map(s => [s.input, s.ship, s.look])), sights.map(s => s.expected));
  sameResults(await elm('patrolContacts.decoy', decoys.map(d => [d.input])), decoys.map(d => d.expected));
  sameResults(await elm('patrolContacts.dropDepthCharge', charges.map(c => [c.input, c.order])), charges.map(c => c.expected));
  sameResults(await elm('patrolContacts.recordLampContact', lamps.map(l => [l.input, l.fix])), lamps.map(l => l.expected));
});
