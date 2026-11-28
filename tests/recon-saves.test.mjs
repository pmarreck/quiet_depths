import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {freshRecon, requestRecon, updateRecon, validateReconState} from '../src/recon.js';

// A recon task run to completion, keeping a copy of its saved state at every
// phase, with ships the satellite photographs in both frames.
function stages(timeOfDay) {
  const s = createGame('recon', 81, {timeOfDay, weather: 'clear', changing: false});
  Object.assign(s, {time: 0, x: 0, y: 0, depth: 0, recon: freshRecon(), contacts: [], nextId: 1});
  s.ships = ['one', 'two'].map((id, i) => ({id, name: 'Vessel ' + id, kind: 'merchant', military: i === 0, ...(i === 0 ? {side: 'hostile'} : {}), x: i * 400, y: 500, depth: 0, speed: 5, heading: 90, hull: 100, alert: 0, attack: 0}));
  assert.equal(requestRecon(s, {x: 0, y: 0, size: 10000}), true);
  const saved = {};
  for (let i = 0; i < 4000 && s.recon.phase !== 'complete'; i++) { s.time += .25; updateRecon(s, .25); saved[s.recon.phase] ??= JSON.parse(JSON.stringify(s.recon)); }
  assert.equal(s.recon.phase, 'complete');
  for (const [phase, state] of Object.entries(saved)) assert.equal(validateReconState(state), true, phase);
  return saved;
}

const refused = (state, change, label) => { const bad = structuredClone(state); change(bad); assert.equal(validateReconState(bad), false, label); };
const kept = (state, change, label) => { const ok = structuredClone(state); change(ok); assert.equal(validateReconState(ok), true, label); };

// Every field the photographs carry has a type the game reads it as, so a
// damaged save cannot hand a number to code expecting a name.
test('saved recon frames and packets keep each ship and weather field the type the game reads', () => {
  const day = stages('day'), night = stages('night');
  const imaging = day.imaging, complete = day.complete;
  kept(imaging, r => { delete r.firstFrame.ships[1].military; }, 'a frame ship without a military flag');
  kept(imaging, r => { delete r.firstFrame.ships[0].side; }, 'a frame ship without a side');
  for (const [label, change] of [
    ['frame ship kind', r => { r.firstFrame.ships[0].kind = 5; }], ['frame ship kind sub', r => { r.firstFrame.ships[0].kind = 'sub'; }],
    ['frame ship name', r => { r.firstFrame.ships[0].name = null; }], ['frame ship military', r => { r.firstFrame.ships[0].military = 'yes'; }],
    ['frame ship side', r => { r.firstFrame.ships[0].side = 'pirate'; }], ['frame weather name', r => { r.firstFrame.weather.name = 3; }],
  ]) refused(imaging, change, label);
  assert.ok(complete.packet.tracks[0].identified && complete.packet.tracks[0].name, 'a clear day identifies the ships');
  for (const [label, change] of [
    ['track name', r => { r.packet.tracks[0].name = 5; }], ['track kind', r => { r.packet.tracks[0].kind = 'raft'; }],
    ['track military', r => { r.packet.tracks[0].military = 'no'; }], ['track side', r => { r.packet.tracks[0].side = 1; }],
    ['scene ship kind by day', r => { r.packet.sceneShips[0].kind = 7; }], ['scene ship light by day', r => { r.packet.sceneShips[0].kind = 'light'; }],
    ['packet weather name', r => { r.packet.weather.name = {}; }],
  ]) refused(complete, change, label);
  kept(night.complete, () => {}, 'a night packet of lights');
  assert.ok(night.complete.packet.tracks.every(t => !t.identified && t.name === undefined), 'night identifies nobody');
});

// A phase that times itself from when it started cannot be restored without
// that time: the update would read null as zero.
test('a saved recon phase keeps the times the update reads', () => {
  const day = stages('day');
  refused(day.tasking, r => { r.startedAt = null; }, 'tasking without a start');
  refused(day.tasking, r => { r.readyAt = null; }, 'tasking without a ready time');
  refused(day.tasking, r => { r.readyAt = r.startedAt; }, 'tasking ready when it started');
  refused(day.imaging, r => { r.startedAt = null; }, 'imaging without a start');
  refused(day.processing, r => { r.startedAt = null; }, 'processing without a start');
  kept(day.receiving, r => { r.startedAt = null; }, 'receiving times itself by its transfer rate');
});
