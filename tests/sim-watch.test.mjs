import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as foundering from '../src/foundering.js';
import * as watch from '../src/torpedo-watch.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';

const surface = ['merchant', 'escort', 'fishing', 'carrier'];

test('Elm sinking poses, depths and descent match the TypeScript for every surface ship', async () => {
  const random = seeded(41), poses = [];
  for (const kind of surface) {
    for (const drop of [-1, 0, 0.76, 2, 5, 16, 30, 39.86, 42.86, 60, 120, 400]) poses.push([kind, drop]);
    for (let i = 0; i < 300; i++) poses.push([kind, random() * 140]);
  }
  sameResults(await elm('foundering.founderingPose', poses), poses.map(([k, d]) => foundering.founderingPose(k, d)));
  sameResults(await elm('foundering.submergedDepth', surface.map(k => [k])), surface.map(foundering.submergedDepth));
  const ages = [-1, 0, 13, 26, 40, ...Array.from({length: 200}, () => random() * 40)].map(a => [a]);
  sameResults(await elm('foundering.descentSpeed', ages), ages.map(([a]) => foundering.descentSpeed(a)));
});

test('Elm wreck visibility matches the TypeScript for charted, settled, collapsed and sinking vessels', async () => {
  const random = seeded(42), cases = [];
  for (const kind of [...surface, 'sub']) for (const hull of [0, 10]) for (const settled of [undefined, false, true]) for (const collapsed of [undefined, true])
    for (const sunkAt of [undefined, 0, 30, NaN]) for (const observed of [undefined, true]) for (const sinkDepth of [undefined, 10, 60, NaN]) for (const now of [40, 110, 200]) {
      const v = {kind, hull};
      if (settled !== undefined) v.settled = settled;
      if (collapsed !== undefined) v.collapsed = collapsed;
      if (sunkAt !== undefined) v.sunkAt = sunkAt;
      if (observed !== undefined) v.wreckMark = {observed};
      if (sinkDepth !== undefined) v.sinkDepth = sinkDepth;
      cases.push([v, now]);
    }
  for (let i = 0; i < 300; i++) cases.push([{kind: [...surface, 'sub'][i % 5], hull: 0, settled: random() < .5, sunkAt: random() * 100, sinkDepth: random() * 80}, random() * 300]);
  sameResults(await elm('foundering.wreckVisible', cases), cases.map(([v, now]) => foundering.wreckVisible(v, now)));
});

test('Elm torpedo echoes and tracks follow the TypeScript fix by fix', async () => {
  const random = seeded(43), echoes = [], steps = [];
  for (let run = 0; run < 160; run++) {
    const boat = {x: (random() - .5) * 400, y: (random() - .5) * 400, depth: 20 + random() * 200};
    const heading = random() * Math.PI * 2, inbound = random() < .6, start = {x: boat.x + Math.sin(heading) * 3000, y: boat.y + Math.cos(heading) * 3000};
    const aim = inbound ? {x: boat.x + (random() - .5) * 150, y: boat.y + (random() - .5) * 150} : {x: start.x + 400, y: start.y - 900};
    const shot = {id: 1 + (run % 7), owner: random() < .8 ? 'enemy' : 'player', aim: random() < .1 ? null : aim, orderedDepth: boat.depth + (random() - .5) * 100,
      diverted: random() < .1, x: start.x, y: start.y, depth: boat.depth + (random() - .5) * 40};
    const s = {...boat, time: 0, torpedoTracks: []};
    for (let tick = 0; tick < 24; tick++) {
      s.time += random() < .1 ? 0 : 0.5 + random() * 3;
      const toward = Math.atan2(aim.x - shot.x, aim.y - shot.y);
      shot.x += Math.sin(toward) * 25 * random(); shot.y += Math.cos(toward) * 25 * random();
      const speed = 18 + random() * 30, echo = watch.gameEcho(s, shot, s.time - (random() < .1 ? 5 : 0), speed);
      echoes.push([{x: s.x, y: s.y, depth: s.depth}, {...shot}, echo.time, speed]);
      const active = random() < .45;
      steps.push([structuredClone(s), echo, active]);
      watch.observeTorpedo(s, echo, active);
    }
  }
  // Boundaries the runs above never land on exactly.
  const still = {x: 0, y: 0, depth: 50};
  for (const [ax, ordered] of [[105, 50], [109.999, 50], [110, 50], [110.001, 50], [0, 94.99], [0, 95], [0, 5.01], [0, 5]])
    echoes.push([still, {id: 9, owner: 'enemy', aim: {x: ax, y: 0}, orderedDepth: ordered, diverted: false, x: -0.3, y: -0.4, depth: -0.2}, 3, 20]);
  echoes.push([still, {id: 9, owner: 'enemy', aim: null, orderedDepth: 50, diverted: false, x: NaN, y: 2.5, depth: 7.5}, 3, 20]);
  const closing = {...still, time: 0, torpedoTracks: []}, step = (time, x, y, active) => {
    const echo = {id: 99, time, x, y, depth: 50, speed: 40, inboundRun: true};
    steps.push([structuredClone({...closing, time}), echo, active]);
    watch.observeTorpedo(closing, echo, active);
  };
  step(0, 0, 100, true); step(1, 0, 99, true); step(2, 0, 97, false); step(3, 0, 96, true);
  steps.push([{...still, time: 10, torpedoTracks: [{id: 5, time: 2, x: 0, y: 30, depth: 50, speed: 30, inboundRun: true, fixes: 2, activeAt: 2, activeX: 0, activeY: 30, course: 180, arrival: 10}]},
    {id: 6, time: 10, x: 1, y: 1, depth: 1, speed: 1, inboundRun: false}, false]);
  sameResults(await elm('torpedoWatch.gameEcho', echoes), echoes.map(([boat, shot, time, speed]) => watch.gameEcho(boat, shot, time, speed)));
  const expected = steps.map(([s, echo, active]) => {const copy = structuredClone(s); watch.observeTorpedo(copy, echo, active); return copy.torpedoTracks;});
  assert.ok(expected.some(t => t.some(track => track.arrival !== null)), 'some runs earn an arrival estimate');
  assert.ok(expected.some(t => t.some(track => track.fixes === 2 && track.course !== null)), 'some runs earn a course');
  sameResults(await elm('torpedoWatch.observe', steps), expected);
  const threatCases = steps.map(([s]) => [s.time, s.torpedoTracks]);
  sameResults(await elm('torpedoWatch.threats', threatCases), steps.map(([s]) => watch.threats(s)));
});

test('Elm carrier hits, flooding, incidental damage and save checks match the TypeScript', async () => {
  const carrier = await import('../src/carrier.js'), random = seeded(44);
  const [constants] = await elm('carrier.constants');
  assert.deepEqual(constants, {carrierId: carrier.carrierId, carrierSize: {...carrier.carrierSize}});
  // A carrier taking hit after hit, from fresh through doomed and beyond.
  const hits = [];
  for (const start of [{directHits: 0, hull: 100, flood: 0, disabled: false, speed: 12}, {directHits: 0, hull: 25, flood: 3, disabled: false, speed: 4}, {directHits: 1, hull: 5, flood: 0, disabled: false, speed: 9}]) {
    let ship = {...start};
    for (let i = 0; i < 5; i++) {hits.push([{...ship}]); carrier.registerCarrierHit(ship);}
  }
  sameResults(await elm('carrier.registerCarrierHit', hits), hits.map(([s]) => {const c = {...s}; carrier.registerCarrierHit(c); return c;}));
  const floods = hits.flatMap(([s]) => [0, .5, 7, 300].map(dt => [s, dt]));
  sameResults(await elm('carrier.advanceCarrierFlood', floods), floods.map(([s, dt]) => {const c = {...s}; carrier.advanceCarrierFlood(c, dt); return c;}));
  const counts = [0, 1, 2, 3, 6].map(n => [{directHits: n}]);
  sameResults(await elm('carrier.carrierDoomed', counts), counts.map(([s]) => carrier.carrierDoomed(s)));
  sameResults(await elm('carrier.carrierDescentFactor', counts), counts.map(([s]) => carrier.carrierDescentFactor(s)));
  const struck = [];
  for (const kind of ['carrier', 'escort', 'merchant', 'fishing', 'sub']) for (const hull of [undefined, 100, 12, 1, 0]) for (const directHits of [undefined, 0, 1, 2])
    for (const damage of [0, 11, 12, 13, 150]) {
      const ship = {kind};
      if (hull !== undefined) ship.hull = hull;
      if (directHits !== undefined) ship.directHits = directHits;
      struck.push([ship, damage]);
    }
  sameResults(await elm('carrier.incidentalHull', struck), struck.map(([s, d]) => carrier.incidentalHull(s, d)));
  const saves = [];
  for (const fighterCount of [0, 1, 3, 4, 1.5, NaN]) for (const flood of [0, 4, -1, Infinity, NaN]) for (const directHits of [0, 1, 2, 3, -1, 1.5, 2 ** 53])
    for (const hull of [-1, 0, 0.5, 100, 100.5, NaN]) saves.push([{fighterCount, flood, directHits, hull}]);
  for (let i = 0; i < 300; i++) saves.push([{fighterCount: 1 + Math.floor(random() * 3), flood: random() * 10, directHits: Math.floor(random() * 4), hull: random() * 100}]);
  const valid = saves.map(([s]) => carrier.validCarrier(s));
  assert.ok(valid.filter(Boolean).length > 50, 'the corpus includes valid carriers');
  sameResults(await elm('carrier.validCarrier', saves), valid);
});

test('Elm contact estimates, sonar readings and observation bias match the TypeScript', async () => {
  const readings = await import('../src/contact-readings.js'), random = seeded(45);
  const ids = ['kestrel', 'freighter-2', 'A', '', 'a-very-long-contact-identifier-that-overflows-thirty-two-bits', 'ship 🚢', '\ud800lone', 'Ünïcode'];
  const biases = [];
  for (const id of ids) for (const method of ['visual', 'passive']) for (const seed of [0, 7, 2 ** 31 + 5]) biases.push([seed, id, method]);
  for (let i = 0; i < 1000; i++) biases.push([Math.floor(random() * 2 ** 32), 'c' + Math.floor(random() * 1e6), random() < .5 ? 'visual' : 'passive']);
  sameResults(await elm('contactReadings.observationBias', biases), biases.map(([s, id, m]) => readings.observationBias(s, id, m)));
  const fix = () => ({x: (random() - .5) * 9000, y: (random() - .5) * 9000, time: random() * 500, vx: random() < .2 ? 0 : (random() - .5) * 8,
    vy: random() < .2 ? 0 : (random() - .5) * 8, positionSigma: random() * 200, velocitySigma: random() * 3, maneuverSigma: random() * .05});
  const contact = () => {
    const c = {x: (random() - .5) * 9000, y: (random() - .5) * 9000, bearing: random() * 360};
    for (const [key, make] of [['range', () => random() < .3 ? 0 : random() * 5000], ['confidence', () => random() * 1.4 - .2], ['age', () => random() * 90 - 5]])
      if (random() < .85) c[key] = random() < .05 ? NaN : make();
    if (random() < .6) c.fix = fix();
    return c;
  };
  const estimates = [[null, 10], [contact(), NaN], [contact(), Infinity], [{x: NaN, y: 3, bearing: 4}, 10], [{x: 3, y: Infinity, bearing: 4}, 10]];
  // Fixes too slow for a heading, at each speed threshold, unusable, and from the future.
  for (const [vx, vy] of [[0, 0], [.006, .008], [.0061, .008], [.06, .08], [.0601, .08]]) estimates.push([{x: 0, y: 0, bearing: 77, range: 100, fix: {...fix(), vx, vy}}, 600]);
  estimates.push([{x: 1, y: 2, bearing: 5, range: 300, confidence: .7, fix: {...fix(), vx: NaN}}, 50], [{x: 1, y: 2, bearing: 5, fix: {...fix(), time: 900}}, 50]);
  // A NaN or negative-zero bearing reads as 0, as `bearing || 0` does.
  for (const bearing of [NaN, -0]) estimates.push([{x: 1, y: 2, bearing}, 9], [{x: 1, y: 2, bearing, range: 40}, 9], [{x: 0, y: 0, bearing, fix: {...fix(), vx: 0, vy: 0}}, 9]);
  for (let i = 0; i < 3000; i++) estimates.push([contact(), random() * 700]);
  const expected = estimates.map(([c, t]) => readings.estimateAt(c, t));
  assert.ok(expected.some(e => e?.hasFix) && expected.some(e => e && !e.hasFix) && expected.includes(null), 'fixed, unfixed and unknown estimates appear');
  sameResults(await elm('contactReadings.estimateAt', estimates), expected);
  const sonar = [[{x: 5, y: 6, time: 10}, {x: 5, y: 6, bearing: 42, range: 9}], [{x: 0, y: 0, time: 10}, {x: 5, y: 6, bearing: 42, range: 0}],
    [{x: 0, y: 0, time: 10}, {x: 5, y: 6, bearing: 42}], [{x: 0, y: 0, time: 10}, {x: 5, y: 6, bearing: 42, range: NaN}]];
  for (let i = 0; i < 3000; i++) sonar.push([{x: (random() - .5) * 2000, y: (random() - .5) * 2000, time: random() * 700}, contact()]);
  sameResults(await elm('contactReadings.sonarReading', sonar), sonar.map(([o, c]) => readings.sonarReading(o, c)));
});
