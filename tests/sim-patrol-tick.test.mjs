import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, save, restore, step, MISSIONS, ping, deployDrone, recallDrone, photograph, fire, decoy, contact} from '../src/sim.js';
import {fireDeckGun} from '../src/combat.js';
import {requestRecon} from '../src/recon.js';
import {listenForReplayEvents} from '../src/replay-events.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';
import {emitSound} from '../src/acoustics.js';
import {environmentAt} from '../src/environment.js';
import {rand} from '../src/mechanics.js';
import {hash01} from '../src/surface-motion.js';
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
// Plays constructed situations frame by frame from a patrol set up for each,
// every frame starting from the patrol as a save restores it. A frame is a
// time step and input, or a function of the patrol choosing them.
function player() {
  const calls = [], seen = new Set();
  const play = (name, mission, options, setup, frames) => {
    let w = restore(save(createGame(mission, 41, exact(options))));
    setup(w);
    for (const [k, chosen] of frames.entries()) {
      const before = restore(save(w));
      assert.ok(before, name + ': frame ' + k + ' restores');
      const [dt, frameInput] = typeof chosen === 'function' ? chosen(before) : chosen;
      if (frameInput.olderSave) delete before.wavePhase;
      const args = [JSON.parse(save(before)), dt, exact({...frameInput, olderSave: undefined})];
      const prior = structuredClone(before);
      const expected = frame(before, dt, args[2]);
      calls.push({name, args, expected, prior});
      for (const e of expected.world.events) seen.add(e.text);
      for (const e of expected.world.debrief) seen.add(e.text);
      seen.add(name + ': ' + expected.world.status + '/' + expected.world.phase);
      w = before;
      if (w.status !== 'patrol') break;
    }
  };
  return {calls, seen, play};
}
const near = (w, p, dx = 40) => Object.assign(w, {x: p.x + dx, y: p.y, speed: 0, targetSpeed: 0});
const surfaced = w => Object.assign(w, {depth: 0, targetDepth: 0});
const once = [[1, {}]];
const at = (w, range, bearing) => ({x: w.x + Math.sin(bearing * Math.PI / 180) * range, y: w.y + Math.cos(bearing * Math.PI / 180) * range});

test('each way a patrol ends, and other rare moments, match the TypeScript', async () => {
  const {calls, seen, play} = player();
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

// Branches the mutation check found no frame reaching: each scenario sets up
// the one condition a branch of the tick turns on, between the threshold and
// a nearby wrong one, and checks that the TypeScript took the branch.
test('the tick\'s thresholds and rarer branches match the TypeScript', async () => {
  const {calls, seen, play} = player();
  const named = name => calls.filter(c => c.name === name);
  const last = name => named(name).at(-1).expected.world;
  const heard = start => [...seen].some(t => t.startsWith(start));
  const quiet = w => Object.assign(w, {speed: 0, targetSpeed: 0});
  const deep = w => Object.assign(quiet(w), {depth: 60, targetDepth: 60});
  const merchants = w => w.ships.filter(v => v.kind === 'merchant' && !v.incidental);
  // Ships other than these leave the boat's waters.
  const clear = (w, keep) => { for (const v of w.ships) if (!keep.includes(v)) Object.assign(v, {x: w.x + 40000, y: w.y + 40000}); };
  // Advances a sound's id until its hash falls in [low, high).
  const soundIdIn = (w, n, low, high) => { while (!(low <= hash01(w.patrol.seed, n + w.soundSequence) && hash01(w.patrol.seed, n + w.soundSequence) < high)) w.soundSequence++; };

  play('repeated line', 'recon', {}, w => { w.events.unshift({...w.events[0]}); }, [[.25, {}]]);
  assert.notEqual(last('repeated line').events[0].text, last('repeated line').events[1]?.text, 'the repeated line is dropped');

  let fixed = [];
  play('satellite fixes', 'recon', {}, w => {
    w.time = 1000;
    clear(w, []);
    fixed = [[w.ships[0], 150], [w.ships[1], 50]].map(([v, time]) => {
      const c = contact(w, v, 'passive');
      Object.assign(c, {age: 300, method: 'satellite', fix: {x: v.x, y: v.y, time, vx: 0, vy: 0, positionSigma: 0, velocitySigma: .25, maneuverSigma: .008, source: 'satellite'}});
      return c.id;
    });
  }, [[1, {}]]);
  assert.deepEqual(fixed.map(id => last('satellite fixes').contacts.some(c => c.id === id)), [true, false], 'a satellite fix lasts fifteen minutes');

  play('photo cooldown', 'recon', {}, w => { w.photoCooldown = 3; }, [[1, {}]]);
  assert.equal(last('photo cooldown').photoCooldown, 2);

  play('silent at speed', 'recon', {}, w => {
    const [v] = merchants(w);
    clear(w, [v]);
    Object.assign(v, at(w, 2000, 90), {speed: 0});
    Object.assign(w, {depth: 60, targetDepth: 60, speed: 12, targetSpeed: 12, silent: true, time: 2.9});
  }, [[.25, {}]]);
  assert.ok(last('silent at speed').contacts.some(c => c.method === 'passive'), 'heard while running silent at speed');

  // Morning fog, thin enough that lights are the only sign of a ship beyond
  // optical range.
  let lit = [];
  play('lights in fog', 'recon', {weather: 'clear'}, w => {
    w.environment.startHour = 4.95;
    const {fog} = environmentAt(w);
    assert.ok(.16 < fog && fog < .3, 'thin fog: ' + fog);
    const [a, b] = merchants(w);
    clear(w, [a, b]);
    Object.assign(a, at(w, 4000, 10), {speed: 0, lights: true});
    Object.assign(b, at(w, 4000, 21), {speed: 0, lights: true});
    for (const v of [a, b]) delete v.blackout;
    lit = [a.id, b.id];
    Object.assign(quiet(w), {depth: 0, targetDepth: 0});
  }, [[3, {observation: 'tower', look: 0}]]);
  assert.deepEqual(lit.map(id => last('lights in fog').contacts.find(c => c.id === id)?.method), ['lights', 'passive'], 'lights seen ahead, not off the arc');

  play('clue and report together', 'intercept', {}, w => {
    w.time = 100;
    const v = w.ships.find(v => v.kind === 'escort');
    Object.assign(v, at(w, 9000, 0), {speed: 0, alert: 30, clue: {x: 300, y: 300, time: 99}, report: {x: 1500, y: 1500, depth: 60, heading: 0, speed: 0, time: 99}});
    deep(w).silent = true;
  }, [[.25, {}]]);
  assert.ok(last('clue and report together').ships.some(v => v.clue?.x === 300), 'a report no newer than the clue leaves it');

  play('disabled ship', 'recon', {}, w => { Object.assign(merchants(w)[0], {disabled: true, speed: 5}); }, [[1, {}]]);
  assert.equal(last('disabled ship').ships.find(v => v.disabled).speed, 0);

  play('depth charges', 'intercept', {}, w => {
    w.time = 200;
    const v = w.ships.find(v => v.kind === 'escort');
    Object.assign(v, at(w, 150, 0), {alert: 100, speed: 10, heading: 180, report: {x: w.x, y: w.y, depth: 40, heading: 0, speed: 6, time: 199}});
    Object.assign(w, {depth: 40, targetDepth: 40, speed: 6, targetSpeed: 6, silent: false});
  }, Array.from({length: 6}, () => [5, {}]));
  assert.ok(named('depth charges').some(c => c.expected.world.blasts.some(b => b.kind === 'charge')), 'an escort dropped depth charges');

  // A launch heard close by, and a splash at range, each with odds the
  // right threshold passes and a nearby wrong one would not.
  play('launch heard', 'recon', {}, w => {
    deep(w);
    soundIdIn(w, 42000, .91, .96);
    emitSound(w, {type: 'launch', ...at(w, 60, 45), depth: w.depth, power: .75});
  }, [[.5, {}]]);
  assert.ok(heard('Possible torpedo launch heard'), 'a close launch heard');
  play('splash at range', 'recon', {}, w => {
    deep(w);
    const distance = Math.hypot(2150, w.depth), odds = range => .85 / (1 + (distance / range) ** 2);
    soundIdIn(w, 42000, odds(2000) + .003, odds(2200) - .003);
    emitSound(w, {type: 'splashdown', ...at(w, 2150, 45), depth: 0, power: .65});
  }, [[2, {}]]);
  assert.ok(heard('Possible depth-charge splash heard'), 'a distant splash heard');

  play('seeker at range', 'recon', {}, w => {
    w.time = 100;
    deep(w);
    const p = at(w, 5500, 90), echo = {id: 7, ...p, depth: 30, speed: 40, time: w.time, inboundRun: false};
    w.torpedoTracks = [{...echo, x: p.x + 60, time: w.time - 3, fixes: 1, activeAt: w.time - 3, activeX: p.x + 60, activeY: p.y, course: null, arrival: null}];
    emitSound(w, {type: 'seeker', ...p, depth: 30, power: 1, echo});
  }, [[4, {}]]);
  assert.ok(last('seeker at range').torpedoTracks.some(t => t.id === 7 && t.time === 100), 'a distant seeker updates its torpedo track');

  play('second sweep', 'recon', {}, w => {
    w.time = 200;
    deep(w);
    const [v] = merchants(w);
    clear(w, [v]);
    Object.assign(v, at(w, 1000, 90), {speed: 0});
    contact(w, v, 'passive').lastSweep = w.time - 110;
    emitSound(w, {type: 'sweep', x: v.x, y: v.y, depth: 0, power: .85, vessel: v.id});
  }, [[1, {}]]);
  assert.ok(last('second sweep').contacts.some(c => c.sweepArea), 'a second sweep within two minutes marks its square');

  // A passing sub and escort square off within the boat's hearing, on an
  // ordinary day and on Christmas.
  const passing = (w, day) => {
    if (day !== undefined) w.environment.startDay = day;
    const [a, b] = merchants(w);
    clear(w, [a, b]);
    deep(w);
    Object.assign(a, at(w, 5300, 90), {id: 'passage-1-0-0', incidental: true, side: 'hostile', kind: 'sub', military: true, depth: 20, speed: 3});
    Object.assign(b, {x: a.x, y: a.y + 1500, id: 'passage-1-0-1', incidental: true, side: 'friendly', kind: 'escort', military: true, speed: 3});
  };
  play('challenge ping', 'recon', {}, w => passing(w), Array.from({length: 10}, () => [30, {}]));
  assert.ok(heard('Challenge ping heard'), 'a passing sub challenged within hearing');
  play('holiday traffic', 'recon', {}, w => passing(w, 359), Array.from({length: 10}, () => [30, {}]));
  assert.ok(named('holiday traffic').every(c => environmentAt(c.prior).holiday === 'christmas') && named('holiday traffic').some(c => c.expected.world.ships.some(v => v.parley)), 'traffic squares off on Christmas');

  // A convoy lamp in view while an allied lamp is signaling.
  play('two lamps', 'wolf-in-the-henhouse', {timeOfDay: 'night', weather: 'clear'}, w => {
    const wolf = w.ships.find(v => v.id === 'wolf'), ally = w.ships.find(v => v.side === 'friendly' && v.kind !== 'sub' && v.id !== 'wolf');
    Object.assign(quiet(w), at(ally, 1200, 180), {depth: 0, targetDepth: 0});
    Object.assign(wolf, at(ally, 1200, 90), {speed: 0});
  }, [...Array.from({length: 8}, () => [5, {observation: 'tower'}]),
    ...Array.from({length: 8}, () => w => [5, {observation: 'tower', lampInView: w.convoy.message?.estimate.sender ?? null}])]);
  assert.ok(named('two lamps').some(c => c.prior.alliedLamp?.message && c.prior.convoy.message && c.args[2].lampInView === c.prior.convoy.message.estimate.sender),
    'a convoy lamp in view while an allied lamp signals');

  play('time rate not a number', 'recon', {difficulty: {longPatrol: true}}, () => {}, [[1, {timeRate: NaN}]]);
  assert.ok(Number.isFinite(last('time rate not a number').search.activeSeconds), 'the approach clock keeps counting');

  play('blast at the edge', 'recon', {}, w => { deep(w); emitSound(w, {type: 'blast', ...at(w, 205, 90), depth: w.depth, power: 1.2}); }, [[.5, {}]]);
  assert.ok(seen.has('An underwater explosion was close enough to damage your sub.'), 'a blast 205 m away damages the sub');

  play('early lightning', 'recon', {weather: 'storm'}, w => { w.time = 22; w.nextLightningAt = 22.1; }, [[.25, {look: 90}]]);
  assert.ok(last('early lightning').lightning.some(e => e.time === 22.25), 'lightning in the first half minute');

  // Lightning that strikes, with one surfaced ship 5.5 km off.
  let struck;
  play('lightning at range', 'recon', {weather: 'storm'}, w => {
    w.time = 100;
    w.nextLightningAt = 100.1;
    deep(w);
    const [v] = merchants(w);
    clear(w, [v]);
    Object.assign(v, at(w, 5500, 0), {speed: 0});
    struck = v.name;
    const strikeSeed = r => { const g = {rng: r}; rand(g); rand(g); rand(g); return Math.floor(rand(g) * 1000000); };
    while (hash01(strikeSeed(w.rng), 910) >= .09) rand(w);
  }, [[.25, {}]]);
  assert.ok(seen.has('Lightning struck ' + struck + '.'), 'lightning found the distant ship');

  play('convoy charge', 'wolf-in-the-henhouse', {}, w => {
    const wolf = w.ships.find(v => v.id === 'wolf');
    soundIdIn(w, 14600, 0, .32);
    w.blasts.push({id: w.soundSequence++, x: wolf.x + 100, y: wolf.y, depth: wolf.depth, delay: .1, totalDelay: 3, age: 0, exploded: false, kind: 'charge', convoyCharge: true});
  }, [[.5, {}]]);
  assert.ok(seen.has('An escort depth charge damaged the hunter.'), 'an escort charge damaged the hunter');

  let watched;
  play('drone over the fleet', 'tiebreaker', {}, w => {
    const v = w.ships.find(v => v.side === 'friendly' && !v.incidental && v.hull > 0);
    watched = v.id;
    Object.assign(w, {x: v.x + 90, y: v.y, depth: 20, targetDepth: 20, speed: 0, targetSpeed: 0});
    assert.ok(deployDrone(w), 'drone deployed');
    Object.assign(w.drone, {x: v.x + 40, y: v.y, depth: 5, targetDepth: 5, heading: 270, targetHeading: 270});
  }, [[.25, {observation: 'drone'}]]);
  assert.equal(last('drone over the fleet').contacts.find(c => c.id === watched)?.method, 'visual', 'the drone sighted a fleet ship');

  play('wreck at range', 'recon', {timeOfDay: 'day', weather: 'clear'}, w => {
    Object.assign(quiet(w), {depth: 0, targetDepth: 0});
    const [v] = merchants(w);
    clear(w, [v]);
    Object.assign(v, at(w, 1100, 0), {hull: 0, speed: 0, sinkDepth: 2});
  }, [[.25, {observation: 'tower', look: 0}]]);
  assert.ok(seen.has('Wreck sighted. Position marked on chart.'), 'a wreck sighted 1.1 km off');

  sameResults(await elm('patrolTick.step', calls.map(c => c.args)), calls.map(c => c.expected));
});
