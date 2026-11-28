// The switch: what a frame of play costs through the Elm worker and the
// page's mirror, beside the TypeScript simulation's own step, on busy
// patrols, at 1x (one tick a frame) and at 16x (about a quarter second, two
// ticks). Each Elm frame includes the step, encoding the world after each
// tick, and refreshing the page's patrol object, with the worker's program
// on the same thread. Run through `nix develop`,
// which provides Elm:
//   node --experimental-transform-types --no-warnings scripts/elm-frame-bench.mjs
// A measurement, not a test: it prints timings and checks nothing.
import {createGame, step, save} from '../src/sim.js';
import {elmSimulation, portTransport} from '../src/elm-simulation.js';
import {compiledElm} from '../tests/sim-harness.mjs';

const sim = await elmSimulation(portTransport(compiledElm('elm/SimWorker.elm').SimWorker.init()));
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
// Milliseconds per frame, the median of `n` frames after a warm-up.
async function perFrame(world, frame, n) {
  for (let i = 0; i < 30; i++) await frame(world);
  const times = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); await frame(world); times.push(performance.now() - t0); }
  return median(times);
}

console.log('patrol (10 min in)      save KB | 1x: TypeScript   Elm  | 16x: TypeScript   Elm  | Elm share of a 60 Hz frame at 1x, 16x');
for (const mission of ['tiebreaker', 'big-kahuna', 'wolf-in-the-henhouse', 'seek-and-destroy', 'recon']) {
  const s = createGame(mission, 4242, {});
  s.scope = true; s.targetDepth = 12;
  for (let t = 0; t < 2400; t++) step(s, .25, {timeRate: 1, observation: 'scope'});
  const kb = (save(s).length / 1024).toFixed(1);
  const typed = rate => w => step(w, rate / 60, {timeRate: rate, observation: 'scope'});
  const routed = rate => w => sim.step(w, rate / 60, {timeRate: rate, observation: 'scope'});
  const t1 = await perFrame(JSON.parse(save(s)), typed(1), 300), t16 = await perFrame(JSON.parse(save(s)), typed(16), 300);
  const m = await sim.restore(save(s));
  const e1 = await perFrame(m, routed(1), 300), e16 = await perFrame(m, routed(16), 300);
  const pct = ms => (100 * ms / (1000 / 60)).toFixed(1) + '%';
  console.log(`${mission.padEnd(22)} ${kb.padStart(8)} | ${t1.toFixed(3).padStart(14)} ${e1.toFixed(3).padStart(6)} | ${t16.toFixed(3).padStart(15)} ${e16.toFixed(3).padStart(6)} | ${pct(e1)}, ${pct(e16)}`);
}
