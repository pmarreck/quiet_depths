// Real play, recorded in a browser by scripts/record-play.mjs or by the owner
// under ?record (see typescript/play-recording.ts), replayed through the
// page's own simulation module. The TypeScript simulation must give every
// result and reach every world digest of the recording's oracle for this
// engine's math. Then the Elm worker, on the page and through the shipped
// worker file, must give the TypeScript's results and reach the
// TypeScript's world after every call. The oracles stay once the TypeScript
// is gone.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as page from '../src/simulation.js';
import {elmSimulation} from '../src/elm-simulation.js';
import {replayCalls, checkReplay, mathFingerprint, worldDigest, fromExactJson, ORDER_FIELDS, RECORDING_FORMAT} from '../src/play-recording.js';
import {exact} from './sim-harness.mjs';
import {program, transport, SOURCES, strict, pageless} from './elm-simulation-harness.mjs';

const DIR = new URL('./recordings/', import.meta.url);
const read = name => fromExactJson(gunzipSync(readFileSync(new URL(name, DIR))).toString());
const recordings = readdirSync(DIR).filter(f => f.endsWith('.json.gz')).sort();
const what = (i, c) => `call ${i} (${c.call})`;
// A call's outcome to compare; a made patrol is compared by its world.
const outcome = (c, result, threw) => threw !== undefined ? {threw} : c.made !== undefined ? 'made' : exact(result ?? null);

test('the page records in the format the replay reads, with the worker\'s orders', async () => {
  assert.ok(recordings.length > 0, 'there are recordings');
  const reply = await new Promise(resolve => {
    const app = program.init();
    app.ports.replies.subscribe(resolve);
    app.ports.commands.send({kind: 'orderFields'});
  });
  assert.deepEqual({boat: reply.boat, gun: reply.gun, drone: reply.drone}, ORDER_FIELDS);
  for (const name of recordings) {
    const r = read(name);
    assert.equal(r.format, RECORDING_FORMAT, name);
    assert.deepEqual(r.orderFields, ORDER_FIELDS, name + ' was recorded with these orders');
    assert.ok(r.calls.every(c => c.call !== 'step' || c.args[0] >= 0), name + ': no step goes back in time');
  }
});

for (const name of recordings) test('real play replays alike in both simulations: ' + name, async () => {
  const recording = read(name), digests = [], outcomes = [];
  page.useElmSimulation(null);
  const parted = await checkReplay(recording, page);
  assert.notEqual(parted, undefined, `no oracle for this engine's math (${mathFingerprint()}); scripts/add-replay-oracle.mjs adds one`);
  assert.equal(parted, null, 'the TypeScript reaches the recording\'s oracle');
  await replayCalls(recording, page, (i, c, result, threw, world) => {
    digests.push(world ? worldDigest(world) : null);
    outcomes.push(outcome(c, result, threw));
  });
  for (const [how, via] of SOURCES) {
    page.useElmSimulation(await elmSimulation(transport(via), strict));
    let differs = null;
    try {
      await replayCalls(recording, page, (i, c, result, threw, world) => {
        if (differs) return;
        assert.deepEqual(outcome(c, result, threw), outcomes[i], what(i, c) + ' gives the TypeScript\'s result, ' + how);
        if ((world ? worldDigest(world) : null) !== digests[i]) differs = {i, c, world: pageless(world)};
      });
    } finally { page.useElmSimulation(null); }
    if (differs) {
      // Shows how the worlds differ: the TypeScript's, replayed to that call.
      const patrols = await replayCalls(recording, page, () => {}, differs.i + 1);
      assert.deepEqual(differs.world, pageless(patrols[differs.c.made ?? differs.c.patrol]), what(differs.i, differs.c) + ' leaves the TypeScript\'s world, ' + how);
      assert.fail(what(differs.i, differs.c) + ' differs in digest only, ' + how);
    }
  }
});
