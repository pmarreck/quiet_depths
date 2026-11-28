import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, save, MISSIONS} from '../src/sim.js';
import {elm, sameResults, exact} from './sim-harness.mjs';

// The page keeps the photo archive and the captain's name apart from the
// simulation; everything else a save carries lives in the Elm world record.
const pageless = raw => {
  const w = JSON.parse(raw);
  for (const key of ['photoArchive', 'photoSequence', 'captain']) delete w[key];
  // A ship's lost track saves as null or not at all, alike to the game; the Elm ship writes neither.
  for (const ship of w.ships) if (ship.tracking === null) delete ship.tracking;
  return exact(w);
};

test('a save decoded into the Elm world record and encoded again is the save, apart from the page\'s fields', async () => {
  const saves = [];
  for (const [n, {id}] of MISSIONS.entries()) for (const longPatrol of [false, true]) {
    const s = createGame(id, 31 + n, {difficulty: {longPatrol}});
    saves.push(pageless(save(s)));
    for (let t = 1; t <= 2400; t++) {
      step(s, .25, {timeRate: 1, observation: t % 800 < 400 ? 'scope' : 'tower'});
      if (t % 600 === 0) saves.push(pageless(save(s)));
    }
  }
  assert.ok(saves.length >= 100, 'saves from every mission');
  sameResults(await elm('world.roundTrip', saves.map(w => [w])), saves);
});
