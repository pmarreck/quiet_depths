import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, step, MISSIONS, ping, deployDrone, recallDrone, photograph, fire, decoy, contact} from '../src/sim.js';
import {fireDeckGun} from '../src/combat.js';
import {requestRecon} from '../src/recon.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {elm, sameResults, seeded, exact} from './sim-harness.mjs';

// The patrol as the simulation holds it, every number exactly as a save
// would hold it if JSON kept -0, NaN and the infinities. The page keeps the
// photo archive and the captain's name apart from the simulation, and a
// ship's lost track is null or absent alike.
const pageless = s => {
  const w = exact(s);
  for (const key of ['photoArchive', 'photoSequence', 'captain']) delete w[key];
  for (const ship of w.ships) if (ship.tracking === null) delete ship.tracking;
  return exact(w);
};
const pick = (random, list) => list[Math.floor(random() * list.length)];

// A frame of play from a patrol as its save holds it, with the replay marks
// and invalid numbers the frame produced.
function frame(w, dt, input) {
  const replay = [];
  listenForReplayEvents(w, {mark: (time, event) => replay.push({time, event})});
  const {reports: invalid} = collectInvalidNumbers(() => step(w, dt, input));
  return exact({world: pageless(w), replay, invalid});
}

// The helmsman's orders and the crew's actions between frames, so the
// frames meet dives, sprints, pings, torpedoes, the gun, the drone, decoys,
// photographs and reconnaissance requests as well as quiet watches.
function act(random, w) {
  const roll = random();
  if (roll < .12) w.targetSpeed = pick(random, [-4, 0, 3, 6, 9, 14, 18]);
  else if (roll < .22) w.targetDepth = pick(random, [0, 0, 12, 18, 45, 90, 160]);
  else if (roll < .32) w.targetHeading = Math.floor(random() * 360);
  else if (roll < .36) w.silent = !w.silent;
  else if (roll < .40) w.engine = w.depth <= 1 && w.engine === 'electric' ? 'diesel' : 'electric';
  else if (roll < .44) w.route = {x: w.x + (random() - .5) * 3000, y: w.y + (random() - .5) * 3000};
  else if (roll < .47) w.scopeSteerBearing = Math.floor(random() * 360);
  else if (roll < .50) w.imagers.scribbler = pick(random, [null, 'survey', 'detail']);
  else if (roll < .55) ping(w);
  else if (roll < .59) deployDrone(w);
  else if (roll < .61) recallDrone(w);
  else if (roll < .65) photograph(w, (w.heading + w.scopeAngle) % 360);
  else if (roll < .70 && w.contacts.length) fire(w, pick(random, w.contacts).id);
  else if (roll < .73) fireDeckGun(w, {bearing: Math.floor(random() * 360), elevation: random() * 20});
  else if (roll < .76) decoy(w);
  else if (roll < .79) requestRecon(w, {x: w.x + (random() - .5) * 4000, y: w.y + 2500, size: 10000});
  if (w.drone.mode === 'remote' && random() < .5) Object.assign(w.drone, {targetSpeed: pick(random, [0, 1, 3]), targetDepth: pick(random, [10, 30, 60]), targetHeading: Math.floor(random() * 360)});
}

function input(random, w) {
  return exact({
    timeRate: pick(random, [undefined, 1, 1, 4, 16, 0]),
    look: pick(random, [undefined, undefined, Math.floor(random() * 360), random() * 360]),
    observation: pick(random, [undefined, 'scope', 'scope', 'tower', 'gun', 'drone', 'chart', '']),
    imaging: pick(random, [undefined, undefined, undefined, {mode: 'scribbler', profile: 'survey'}, {mode: 'painter', profile: 'detail'}]),
    lampInView: pick(random, [undefined, null, ...w.ships.slice(0, 3).map(v => v.id)]),
  });
}

// Each mission, short and long, in random and stormy weather, played frame
// by frame; every frame starts from the patrol as a save restores it, the
// same state the Elm tick decodes.
test('a frame of play matches the TypeScript on every mission, frame after frame', async () => {
  const random = seeded(221), calls = [];
  for (const [n, {id}] of MISSIONS.entries()) for (const longPatrol of [false, true]) {
    const options = {difficulty: {longPatrol}, weather: pick(random, [undefined, 'storm', 'storm', 'fog', 'rain']), timeOfDay: pick(random, [undefined, 'night', 'dusk', 'day'])};
    let w = restore(save(createGame(id, 300 + 2 * n + Number(longPatrol), exact(options))));
    for (let k = 0; k < 24 && w.status === 'patrol'; k++) {
      act(random, w);
      const before = restore(save(w));
      assert.ok(before, id + ': frame ' + k + ' restores');
      const dt = pick(random, [.25, .5, 1, 1 / 60, 2.5, 5, 15, 30, 60]), frameInput = input(random, before);
      const saved = JSON.parse(save(before));
      calls.push({mission: id, k, args: [saved, dt, frameInput], expected: frame(before, dt, frameInput)});
      w = before;
    }
  }
  const worlds = calls.map(c => c.expected.world);
  assert.ok(worlds.some(w => w.lightning.length) && worlds.some(w => w.blasts.length) && worlds.some(w => w.contacts.length > 2), 'lightning, blasts and contacts');
  assert.ok(calls.some(c => c.expected.replay.length), 'replay marks');
  sameResults(await elm('patrolTick.step', calls.map(c => c.args)), calls.map(c => c.expected));
});

// Situations random play seldom or never reaches: each way a patrol ends,
// extraction opening, a search located three ways, escort shells, a
// waypoint, the boat colliding, a reconnaissance packet, an expiring
// noisemaker, an older save without a wave phase, and frames that move
// nothing at all.
test('each way a patrol ends, and other rare moments, match the TypeScript', async () => {
  const calls = [], seen = new Set();
  const play = (name, mission, options, setup, frames) => {
    let w = restore(save(createGame(mission, 41, exact(options))));
    setup(w);
    for (const [k, [dt, frameInput]] of frames.entries()) {
      const before = restore(save(w));
      assert.ok(before, name + ': frame ' + k + ' restores');
      if (frameInput.olderSave) delete before.wavePhase;
      const args = [JSON.parse(save(before)), dt, exact({...frameInput, olderSave: undefined})];
      const expected = frame(before, dt, args[2]);
      calls.push({name, args, expected});
      for (const e of expected.world.events) seen.add(e.text);
      for (const e of expected.world.debrief) seen.add(e.text);
      seen.add(name + ': ' + expected.world.status + '/' + expected.world.phase);
      w = before;
      if (w.status !== 'patrol') break;
    }
  };
  const near = (w, p, dx = 40) => Object.assign(w, {x: p.x + dx, y: p.y, speed: 0, targetSpeed: 0});
  const surfaced = w => Object.assign(w, {depth: 0, targetDepth: 0});
  const once = [[1, {}]];
  play('window', 'recon', {}, w => { w.time = 1799.5; }, once);
  play('long window', 'recon', {difficulty: {longPatrol: true}}, w => { w.time = 5400 + w.search.protectedTime - .5; }, once);
  play('fleet extraction window', 'tiebreaker', {}, w => { w.time = 1799.5; w.phase = 'extract'; w.battle.volleys = []; for (const v of w.ships) if (v.side === 'hostile' && !v.incidental) v.hull = 0; }, once);
  play('pickup', 'recon', {}, w => { w.phase = 'extract'; surfaced(near(w, w.home)); }, once);
  play('photographs', 'recon', {}, w => { w.photos = Array.from({length: w.patrol.photoGoal}, (_, k) => 'merchant-' + k); }, once);
  play('intercept', 'intercept', {}, w => { for (const v of w.ships) if (v.id === 'cobalt') v.hull = 0; }, once);
  play('gate', 'sneaky-seamen', {}, w => { near(w, w.home, 10); }, once);
  play('convoy lost', 'wolf-in-the-henhouse', {}, w => { for (const v of w.ships.filter(v => v.kind === 'merchant' && v.hull > 0).slice(0, 2)) v.hull = 0; }, once);
  play('hunter sunk', 'wolf-in-the-henhouse', {}, w => { for (const v of w.ships) if (v.id === 'wolf') v.hull = 0; }, once);
  play('fleet lead', 'tiebreaker', {}, w => { for (const v of w.ships) if (v.side === 'hostile' && !v.incidental) v.hull = 0; }, once);
  play('fleet broken', 'tiebreaker', {}, w => { for (const v of w.ships.filter(v => v.side === 'friendly' && !v.incidental).slice(1)) v.hull = 0; }, once);
  play('shadowing', 'shadow', {}, w => {
    const v = w.ships.find(v => v.kind === 'merchant' && !v.incidental);
    Object.assign(w, {x: v.x - 600, y: v.y, depth: 60, targetDepth: 60, speed: 2, targetSpeed: 2, silent: true, noise: 4});
  }, [[1, {}], [5, {}]]);
  play('site reached', 'undersea-rescue', {difficulty: {longPatrol: true}}, w => { near(w, w.site, 50); w.depth = w.targetDepth = w.site.depth - 12; }, once);
  play('casualty in sight', 'surface-rescue', {difficulty: {longPatrol: true}, timeOfDay: 'day', weather: 'clear'}, w => {
    Object.assign(w, {x: w.site.x - 1500, y: w.site.y, heading: 90, targetHeading: 90, speed: 0, targetSpeed: 0, depth: 0, targetDepth: 0});
  }, [[.25, {observation: 'tower', look: 90}], [.25, {observation: 'scope', look: 90}]]);
  play('targets recognized', 'recon', {difficulty: {longPatrol: true}}, w => {
    for (const v of w.ships.filter(v => w.search.targets.includes(v.id))) { v.x = w.x + 300; v.y = w.y; contact(w, v, 'visual'); }
  }, once);
  play('shells', 'intercept', {}, w => {
    Object.assign(w, {depth: 3, targetDepth: 3});
    w.shells.push({id: 900, x: w.x + 20, y: w.y, depth: 0, delay: .1, fromX: w.x + 2000, fromY: w.y, total: 5}, {id: 901, x: w.x + 300, y: w.y, depth: 0, delay: .2, fromX: w.x + 2000, fromY: w.y, total: 5});
  }, [[.5, {}], [4, {}]]);
  play('shell overhead', 'intercept', {}, w => {
    Object.assign(w, {depth: 20, targetDepth: 20});
    w.shells.push({id: 902, x: w.x + 10, y: w.y, depth: 0, delay: .1, fromX: w.x + 2000, fromY: w.y, total: 5});
  }, once);
  play('waypoint', 'recon', {}, w => { w.route = {x: w.x + 30, y: w.y + 30}; }, once);
  play('waypoint radius', 'recon', {}, w => { w.route = {x: w.x + 300, y: w.y, radius: 400}; }, once);
  play('ramming', 'recon', {}, w => {
    surfaced(w);
    const v = w.ships.find(v => v.kind === 'merchant');
    Object.assign(v, {x: w.x + 4, y: w.y, heading: 270, speed: 5});
  }, [[.25, {}], [.25, {}]]);
  play('reconnaissance', 'recon', {timeOfDay: 'day', weather: 'clear'}, w => {
    surfaced(w);
    assert.ok(requestRecon(w, {x: w.x + 1500, y: w.y + 2500, size: 10000}), 'reconnaissance requested');
  }, Array.from({length: 24}, () => [15, {}]));
  play('noisemaker', 'recon', {}, w => { w.time = 100; w.noisemaker = {x: w.x, y: w.y, depth: w.depth, heading: 0, speed: 2, time: w.time - 31.9}; }, once);
  play('older save', 'recon', {}, () => {}, [[.25, {olderSave: true}]]);
  play('still', 'recon', {}, () => {}, [[0, {}], [-1, {}], [NaN, {}], [5, {paused: true}], [5, {modal: true}]]);
  for (const text of ['Patrol window closed. Command orders withdrawal.', 'Patrol complete. Surfaced at pickup. Sub and crew home safely.', 'Objective complete. Return to extraction and surface for pickup.',
    'Gate B reached. Patrol corridor cleared.', 'Two more convoy vessels were lost after Plover.', 'The hunter sank. The surviving convoy is clear.',
    'Command confirms a two-vessel lead. Extraction open. Stay to assist or surface at pickup.', 'Too few friendly vessels remained to establish the lead. Command recalled the patrol.',
    'Mission site located. Position marked on chart.', 'Search contacts accounted for. Chart now shows their individual tracks.', 'An escort shell struck close enough to damage the hull.',
    'You were below the surface shell’s damage zone when it arrived.', 'An escort shell splashed wide of your sub.', 'Waypoint reached. All stop.', 'fleet extraction window: patrol/extract', 'intercept: patrol/extract'])
    assert.ok(seen.has(text), 'reached: ' + text);
  assert.ok([...seen].some(t => t.startsWith('Orbital reconnaissance received.')), 'a reconnaissance packet');
  assert.ok(calls.some(c => c.expected.replay.some(r => r.event.kind === 'collision')), 'a collision with the boat');
  assert.ok(calls.some(c => c.name === 'shadowing' && c.expected.world.trackTime > 0), 'tracking time');
  sameResults(await elm('patrolTick.step', calls.map(c => c.args)), calls.map(c => c.expected));
});
