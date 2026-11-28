// The play recorder (typescript/play-recording.ts) through the page's own
// simulation module: a session recorded in Node replays to the recorded
// worlds through the TypeScript and through the Elm worker, both ways,
// orders removed and set included; a restore's save is kept without the
// page's own fields; a call that fails is recorded failing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as page from '../src/simulation.js';
import {save} from '../src/sim.js';
import {elmSimulation} from '../src/elm-simulation.js';
import {playRecorder, checkReplay, fromExactJson, mathFingerprint} from '../src/play-recording.js';
import {transport, SOURCES, strict} from './elm-simulation-harness.mjs';

// Plays a short session through the page's module while `recorder` records it.
async function session(recorder) {
  page.recordPlay(recorder);
  try {
    const s = await page.createGame('wolf-in-the-henhouse', 31);
    Object.assign(s, {targetSpeed: 6, targetHeading: 80, newYearWatch: 2});
    s.gun.angle = 40;
    for (let i = 0; i < 40; i++) await page.step(s, .3, {timeRate: 4, observation: 'scope', look: s.heading});
    await page.ping(s);
    delete s.newYearWatch;
    s.targetDepth = 30;
    await page.step(s, 2, {timeRate: 4, observation: null});
    await page.decoy(s);
    await page.log(s, 'Logged by the captain.');
    await page.fire(s, 'no-such-contact');
    const resumed = await page.restore(JSON.stringify({...JSON.parse(save(s)), captain: 'Mabel Haddock', photoArchive: [], photoSequence: 3}));
    resumed.targetSpeed = 2;
    for (let i = 0; i < 31; i++) await page.step(resumed, .5, {timeRate: 1});
    assert.equal(await page.restore('not a save'), null);
    return {s, resumed};
  } finally { page.recordPlay(null); }
}

test('a session recorded through the page\'s module replays to its worlds in both simulations', async () => {
  const recorder = playRecorder('Node');
  await session(recorder);
  const recording = fromExactJson(recorder.text());
  assert.deepEqual(Object.keys(recording.oracles), [mathFingerprint()]);
  const calls = recording.calls, oracle = recording.oracles[mathFingerprint()];
  assert.deepEqual(calls.find(c => c.call === 'step' && c.orders?.targetSpeed === 6).orders, {targetSpeed: 6, targetHeading: 80, newYearWatch: 2, 'gun.angle': 40});
  const removing = calls.find(c => c.unset);
  assert.deepEqual([removing.unset, removing.orders], [['newYearWatch'], {targetDepth: 30}]);
  assert.deepEqual(calls.filter(c => c.made !== undefined).map(c => c.made), [0, 1]);
  assert.ok(calls.filter(c => c.call === 'step').every(c => c.patrol !== undefined && c.args.length === 2 && !('afterTick' in c.args[1])));
  assert.equal(oracle.results[calls.findIndex(c => c.call === 'fire')], false);
  assert.equal(oracle.results[calls.length - 1], null, 'the refused restore');
  // A digest after every action and every 30th step.
  const stepsDigested = calls.map((c, i) => [c, i]).filter(([c, i]) => c.call === 'step' && i in oracle.digests).length;
  assert.equal(stepsDigested, 2);
  assert.ok(calls.every((c, i) => c.call === 'step' || i in oracle.digests || oracle.results[i] === null));
  page.useElmSimulation(null);
  assert.equal(await checkReplay(recording, page), null, 'the TypeScript');
  for (const [how, via] of SOURCES) {
    page.useElmSimulation(await elmSimulation(transport(via), strict));
    try { assert.equal(await checkReplay(recording, page), null, 'the Elm, ' + how); } finally { page.useElmSimulation(null); }
  }
});

test('a replay that parts from the oracle says where', async () => {
  const recorder = playRecorder('Node');
  await session(recorder);
  const recording = fromExactJson(recorder.text()), i = recording.calls.findIndex(c => c.unset);
  delete recording.calls[i].unset;
  // The step that lost its removal keeps no digest; the next call that does shows it.
  const shown = recording.calls.findIndex((c, k) => k > i && k in recording.oracles[mathFingerprint()].digests);
  const parted = await checkReplay(recording, page);
  assert.deepEqual([parted.i, parted.call], [shown, recording.calls[shown].call + ' digests']);
  recording.oracles = {};
  assert.equal(await checkReplay(recording, page), undefined, 'no oracle for this engine');
});

test('a restore\'s save is recorded without the page\'s own fields', async () => {
  const recorder = playRecorder('Node');
  await session(recorder);
  const restored = recorder.recording().calls.filter(c => c.call === 'restore');
  const kept = JSON.parse(restored[0].args[0]);
  assert.ok(!('captain' in kept) && !('photoArchive' in kept) && !('photoSequence' in kept) && 'ships' in kept);
  assert.equal(restored[1].args[0], 'not a save', 'what is not a save is kept as it was');
});

test('a call that fails is recorded failing, and the page cannot record the Elm', async () => {
  const recorder = playRecorder('Node');
  page.recordPlay(recorder);
  try {
    const s = await page.createGame('recon', 32);
    assert.throws(() => recorder.call('ping', s, [], () => { throw new Error('the sonar caught fire'); }), /caught fire/);
    assert.equal(recorder.recording().oracles[mathFingerprint()].threw[1], 'the sonar caught fire');
    assert.throws(() => recorder.call('ping', {...s}, [], () => true), /did not see made/);
    assert.throws(() => page.useElmSimulation({}), /only with the TypeScript/);
  } finally { page.recordPlay(null); }
  page.useElmSimulation(await elmSimulation(transport(), strict));
  try { assert.throws(() => page.recordPlay(playRecorder('Node')), /only with the TypeScript/); } finally { page.useElmSimulation(null); }
});
