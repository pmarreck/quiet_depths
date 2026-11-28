import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore} from '../src/sim.js';
import {freshRecon, requestRecon, updateRecon, reconStatus, reconLink, reconAreaForDisplay, validateReconState} from '../src/recon.js';
import {environmentAt} from '../src/environment.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

const pick = (random, list) => list[Math.floor(random() * list.length)];
const settings = [['recon', 'clear', 'day'], ['intercept', 'cloudy', 'day'], ['recon', 'rain', 'dusk'], ['big-kahuna', 'clear', 'night'], ['seek-and-destroy-sub', 'storm', 'day'], ['tiebreaker', 'cloudy', 'dawn']];

// Recon tasks played out on restored patrols in each weather and light: the
// boat rises and dives through the radio's reach, ships move, some are lit,
// blacked out, submerged or outside the square, and the satellite is
// sometimes switched off. Every request, moment and panel is recorded.
let corpus = null;
function tasks() {
  if (corpus) return corpus;
  corpus = {requests: [], updates: [], panels: [], states: []};
  const random = seeded(161);
  for (const [mission, weather, timeOfDay] of settings) for (let round = 0; round < 3; round++) {
    const w = restore(save(createGame(mission, 9 + round, {weather, timeOfDay, changing: false})));
    Object.assign(w, {depth: 0, scope: false});
    if (round === 2) w.difficulty = {...w.difficulty, satellite: random() < .5 ? false : true};
    const center = {x: Math.round(w.x / 100) * 100, y: Math.round(w.y / 100) * 100};
    w.ships.forEach((v, i) => {
      if (v.kind === 'sub') return;
      Object.assign(v, {x: center.x + (random() - .5) * 12000, y: center.y + (random() - .5) * 12000});
      if (i % 4 === 1) v.lights = false;
      if (i % 5 === 2) v.blackout = true;
      if (i % 7 === 3) v.depth = pick(random, [2, 3, 4]);
    });
    const areas = [{x: center.x, y: center.y, size: 10000}, {x: center.x, y: center.y, size: 5000}, {x: 30000, y: 0, size: 10000}, {x: NaN, y: 0, size: 10000}, null];
    const record = (fn, call) => { const input = exact(w), out = call(w); fn.push({input, out}); return out; };
    for (const area of [pick(random, areas), areas[0]]) {
      const before = exact(w), ok = requestRecon(w, area);
      corpus.requests.push({input: before, area, expected: [ok, exact(w.recon)]});
    }
    for (let step = 0; step < 400 && w.recon.phase !== 'complete'; step++) {
      const dt = pick(random, [.25, .5, 1, 2]);
      w.time += dt;
      if (step % 9 === 0) w.depth = pick(random, [0, 0, 1, 10, 15, 20, 40]);
      for (const v of w.ships) if (v.kind !== 'sub') { v.x += Math.sin(v.heading * Math.PI / 180) * v.speed * dt; v.y += Math.cos(v.heading * Math.PI / 180) * v.speed * dt; }
      const input = exact(w), packet = updateRecon(w, dt);
      corpus.updates.push({input, dt, expected: [packet ? exact(packet) : null, exact(w.recon)]});
      if (step % 5 === 0) record(corpus.panels, s => exact(reconStatus(s)));
      corpus.states.push(exact(w.recon));
    }
    record(corpus.panels, s => exact(reconStatus(s)));
    // A second request, refused while the satellite cools down.
    const before = exact(w), ok = requestRecon(w, areas[0]);
    corpus.requests.push({input: before, area: areas[0], expected: [ok, exact(w.recon)]});
  }
  return corpus;
}

test('recon requests, each moment of a task, and the panel match across weather, light and depth', async () => {
  const {requests, updates, panels} = tasks();
  const packets = updates.map(u => u.expected[0]).filter(Boolean);
  assert.ok(packets.some(p => p.night) && packets.some(p => !p.night && p.tracks.some(t => t.identified)) && packets.some(p => p.coverage < 1), 'night, clear and clouded packets');
  assert.ok(packets.some(p => p.tracks.length) && packets.some(p => p.tracks.length === 0) || packets.length > 3, 'packets with and without tracks');
  assert.ok(requests.some(r => r.expected[0]) && requests.some(r => !r.expected[0]), 'requests queued and refused');
  const phases = new Set(updates.map(u => u.expected[1].phase));
  for (const phase of ['uplinking', 'tasking', 'imaging', 'processing', 'receiving', 'complete']) assert.ok(phases.has(phase), phase);
  assert.ok(updates.some(u => u.input.recon.phase === 'receiving' && u.input.depth > 30), 'reception held deep');
  sameResults(await elm('recon.requestRecon', requests.map(r => [r.input, r.area])), requests.map(r => r.expected));
  sameResults(await elm('recon.updateRecon', updates.map(u => [u.input, u.dt])), updates.map(u => u.expected));
  sameResults(await elm('recon.reconStatus', panels.map(p => [p.input])), panels.map(p => p.out));
});

test('saved recon tasks are accepted and refused exactly as the TypeScript does', async () => {
  const random = seeded(162), {states} = tasks(), values = [];
  const breakers = [
    r => { r.phase = 'instant'; }, r => { r.progress = 2; }, r => { r.progress = NaN; }, r => { r.cooldownUntil = -1; }, r => { r.sequence = 1.5; }, r => { delete r.startedAt; },
    r => { r.startedAt = null; }, r => { r.readyAt = r.startedAt; }, r => { r.area = null; }, r => { r.area = {x: 0, y: 0, size: 5000}; }, r => { r.area = {x: 25000, y: 0, size: 10000}; },
    r => { delete r.area; }, r => { r.firstFrame = null; }, r => { r.packet = null; }, r => { r.packet = 0; }, r => { r.packet = 5; }, r => { delete r.packet; },
    r => { if (r.firstFrame) r.firstFrame.ships[0] && (r.firstFrame.ships[0].kind = 'sub'); }, r => { if (r.firstFrame) r.firstFrame.weather.cloud = 2; }, r => { if (r.firstFrame) delete r.firstFrame.weather.waveScale; },
    r => { if (r.firstFrame) r.firstFrame.weather.id = 'fog'; }, r => { if (r.firstFrame?.ships[0]) delete r.firstFrame.ships[0].military; }, r => { if (r.firstFrame?.ships[0]) r.firstFrame.ships[0].side = 'neutral'; },
    r => { if (r.packet) r.packet.receivedAt = r.packet.capturedAt - 1; }, r => { if (r.packet) delete r.packet.receivedAt; }, r => { if (r.packet) r.packet.image.width = 320; }, r => { if (r.packet) r.packet.image.firstFrameAt = r.packet.capturedAt; },
    r => { if (r.packet?.tracks[0]) r.packet.tracks[0].time = r.packet.capturedAt + 1; }, r => { if (r.packet?.tracks[1]) r.packet.tracks[1].id = r.packet.tracks[0].id; }, r => { if (r.packet?.sceneShips[0]) r.packet.sceneShips[0].id = 'unseen'; },
    r => { if (r.packet?.sceneShips[0]) r.packet.sceneShips.pop(); }, r => { if (r.packet?.tracks[0]) r.packet.tracks[0].kind = 'raft'; }, r => { if (r.packet?.sceneShips[0]) r.packet.sceneShips[0].kind = r.packet.night ? 'merchant' : 'light'; },
    r => { if (r.packet) r.packet.coverage = 1.5; }, r => { if (r.packet) r.packet.weather.name = 4; },
    r => { if (r.firstFrame) r.firstFrame.weather.waveScale = -1; else if (r.packet) r.packet.weather.waveScale = -1; }, r => { if (r.packet) r.packet.receivedAt = null; },
  ];
  for (const state of states.filter((_, i) => i % 3 === 0)) {
    values.push(state);
    const bad = structuredClone(state);
    pick(random, breakers)(bad);
    values.push(bad);
  }
  values.push(freshRecon(), null, 5, 'recon', {});
  const expected = values.map(v => validateReconState(v));
  assert.ok(expected.filter(Boolean).length > 50 && expected.filter(v => !v).length > 50, 'states kept and refused');
  sameResults(await elm('recon.validateReconState', values.map(v => [v])), expected);
});

test('the radio link, the displayed square and a fresh task match', async () => {
  const depths = [undefined, null, NaN, Infinity, -Infinity, -5, 0, 1, 1.0001, 10, 15, 15.0001, 29.99, 30, 30.0001, 100];
  const links = depths.map(depth => depth === undefined ? [{}] : [{depth}]);
  sameResults(await elm('recon.reconLink', links), links.map(([s]) => exact(reconLink(s))));
  const area = {x: 1000, y: 2000, size: 10000}, next = {x: -3000, y: 100, size: 10000}, displays = [];
  for (const phase of ['idle', 'queued', 'uplinking', 'tasking', 'imaging', 'processing', 'receiving', 'complete', 'failed'])
    for (const [held, selected] of [[area, next], [area, null], [null, next], [null, null]]) displays.push([{phase, area: held}, selected]);
  sameResults(await elm('recon.reconAreaForDisplay', displays), displays.map(([r, s]) => reconAreaForDisplay(r, s) ?? null));
  assert.deepEqual((await elm('recon.freshRecon'))[0], freshRecon());
});

// The first time from `start` at which the patrol's conditions satisfy `test`.
function when(w, start, test) {
  for (let at = start; at < start + 200000; at += 5) if (test(environmentAt({...w, time: at}))) return at;
  return null;
}

// Single requests, moments and panels built on the edges the played tasks
// rarely reach: squares at the chart's edge, a finished patrol, a negative
// clock, a busy task whose cooldown has passed, conditions just either side
// of a storm, of night, of clear skies and of the clouds' floor, sunk ships in
// the square, exposures under a second apart, and a delivery after a long
// cooldown was already set.
test('single recon requests and moments match at the edges of weather, light, timing and cooldown', async () => {
  const random = seeded(163), {states} = tasks(), requests = [], updates = [], panels = [];
  const w0 = restore(save(createGame('recon', 21, {weather: 'clear', timeOfDay: 'dusk', changing: true})));
  Object.assign(w0, {depth: 0, scope: false});
  const windows = {
    storm: when(w0, w0.time + 200, e => e.storm > .5 && e.storm <= .6), dusk: when(w0, w0.time + 200, e => e.daylight >= .25 && e.daylight < .3),
    hazy: when(w0, w0.time + 200, e => Math.max(e.cloud, e.fog) >= .35 && Math.max(e.cloud, e.fog) < .4), drizzle: when(w0, w0.time + 200, e => Math.max(e.cloud, e.fog) < .35 && e.rain >= .1 && e.rain < .2),
    downpour: when(w0, w0.time + 200, e => e.cloud >= .99 && e.rain >= .9),
  };
  for (const [name, at] of Object.entries(windows)) assert.ok(at !== null, 'conditions found: ' + name);
  const center = {x: Math.round(w0.x / 100) * 100, y: Math.round(w0.y / 100) * 100}, area = {x: center.x, y: center.y, size: 10000};
  w0.ships = w0.ships.filter(v => v.kind !== 'sub');
  const crowd = Array.from({length: 30}, (_, i) => ({...structuredClone(w0.ships[i % w0.ships.length]), id: 'crowd-' + i, x: center.x + (random() - .5) * 9000, y: center.y + (random() - .5) * 9000, hull: i % 6 === 0 ? 0 : 100, depth: 0}));
  for (const v of crowd) { delete v.sunkAt; delete v.sinkDepth; delete v.lights; delete v.blackout; }
  const at = time => { const w = structuredClone(w0); w.time = time; w.ships = structuredClone(crowd); return w; };
  // Requests.
  for (const time of [windows.storm, windows.storm - 600, w0.time]) for (const x of [center.x, 19500, 20500]) requests.push([at(time), {x, y: center.y, size: 10000}]);
  requests.push([Object.assign(at(w0.time), {status: 'won'}), area]);
  requests.push([Object.assign(at(w0.time), {time: -5, ships: []}), area]);
  // A busy task past its cooldown, on a calm day, so only the task refuses.
  const calm = when(w0, w0.time + 2000, e => e.storm < .2);
  for (const state of states.filter(r => !['idle', 'complete', 'failed'].includes(r.phase)).slice(0, 12)) requests.push([Object.assign(at(calm), {recon: {...structuredClone(state), cooldownUntil: 0}}), area]);
  // Exposures and overpasses under each window's conditions.
  const imaging = states.find(r => r.phase === 'imaging'), tasking = states.find(r => r.phase === 'tasking'), receiving = states.find(r => r.phase === 'receiving');
  for (const time of Object.values(windows)) for (const gap of [10, .5]) {
    const w = at(time);
    w.recon = {...structuredClone(imaging), area: {...area}, startedAt: time - 10, firstFrame: {...structuredClone(imaging.firstFrame), time: time - gap, ships: crowd.filter(v => v.hull > 0).map(v => ({id: v.id, x: v.x - 30, y: v.y + 20, heading: v.heading, speed: v.speed, kind: v.kind, hull: v.hull, name: v.name, ...(v.military === undefined ? {} : {military: v.military}), ...(v.side ? {side: v.side} : {})}))}};
    updates.push([w, .25]);
    const t2 = at(time);
    t2.recon = {...structuredClone(tasking), area: {...area}, startedAt: time - 100, readyAt: time - .1};
    updates.push([t2, .25]);
    panels.push([at(time)]);
  }
  const late = at(windows.dusk);
  late.recon = {...structuredClone(receiving), cooldownUntil: windows.dusk + 1000, progress: .999};
  updates.push([late, 1]);
  const expectedRequests = requests.map(([w, a]) => { const c = structuredClone(w), ok = requestRecon(c, a); return [ok, exact(c.recon)]; });
  const expectedUpdates = updates.map(([w, dt]) => { const c = structuredClone(w), packet = updateRecon(c, dt); return [packet ? exact(packet) : null, exact(c.recon)]; });
  const packets = expectedUpdates.map(([, r]) => r.packet).filter(Boolean);
  assert.ok(packets.some(p => p.coverage === .12) && packets.some(p => p.quality < .15), 'the clouds\' floors');
  assert.ok(expectedRequests.some(([ok]) => ok) && expectedRequests.filter(([ok]) => !ok).length > 10, 'requests queued and refused');
  assert.ok(requests.some(([w], i) => !['idle', 'complete', 'failed'].includes(w.recon.phase) && w.recon.cooldownUntil === 0 && !expectedRequests[i][0]), 'busy tasks refused on a calm day');
  sameResults(await elm('recon.requestRecon', requests.map(([w, a]) => [exact(w), a])), expectedRequests);
  sameResults(await elm('recon.updateRecon', updates.map(([w, dt]) => [exact(w), dt])), expectedUpdates);
  sameResults(await elm('recon.reconStatus', panels.map(([w]) => [exact(w)])), panels.map(([w]) => exact(reconStatus(structuredClone(w)))));
});
