// Cutover spike: what moving a patrol's ships and contacts across the Elm
// boundary costs per frame, on busy patrols, beside JavaScript's own
// serialization of the whole save. Run through `nix develop`, which provides
// Elm: node --experimental-transform-types --no-warnings scripts/elm-boundary-bench.mjs
// A measurement, not a test: it prints timings and checks nothing.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGame, step, save} from '../src/sim.js';

const root = fileURLToPath(new URL('..', import.meta.url)), dir = mkdtempSync(join(tmpdir(), 'quiet-depths-bench-'));
let source;
try {
  execFileSync('elm', ['make', 'elm/Bench/Boundary.elm', '--optimize', '--output=' + join(dir, 'boundary.js')], {cwd: root, stdio: 'pipe'});
  source = readFileSync(join(dir, 'boundary.js'), 'utf8');
} finally { rmSync(dir, {recursive: true, force: true}); }
const scope = {}; new Function(source).call(scope);
const app = scope.Elm.Bench.Boundary.init(); let resolve; app.ports.reply.subscribe(v => resolve(v));
const roundTrip = batch => new Promise(r => { resolve = r; app.ports.request.send(batch); });
const time = (f, n) => { for (let i = 0; i < 50; i++) f(); const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };

console.log('patrol (10 min in)      ships contacts  save KB  ships+contacts KB | JS stringify  JS clone | Elm round trip  share of a 60 Hz frame');
for (const mission of ['tiebreaker', 'big-kahuna', 'wolf-in-the-henhouse', 'seek-and-destroy', 'recon']) {
  const s = createGame(mission, 4242, {}); s.scope = true; s.targetDepth = 12;
  for (let t = 0; t < 2400; t++) step(s, .25, {timeRate: 1, observation: 'scope'});
  const saved = JSON.parse(save(s)), part = {time: saved.time, ships: saved.ships, contacts: saved.contacts};
  const check = (await roundTrip([part]))[0];
  if (typeof check === 'string') throw new Error(mission + ': the Elm decoders refused a live save: ' + check);
  // Batches amortize the port's scheduling, so the figure is decoding and encoding.
  const copies = Array.from({length: 200}, () => part);
  await roundTrip(copies);
  const t0 = performance.now(); for (let i = 0; i < 5; i++) await roundTrip(copies);
  const elm = (performance.now() - t0) / (5 * copies.length);
  const kb = v => (JSON.stringify(v).length / 1024).toFixed(1);
  console.log(`${mission.padEnd(22)} ${String(saved.ships.length).padStart(5)} ${String(saved.contacts.length).padStart(8)} ${kb(saved).padStart(8)} ${kb(part).padStart(18)} | ${time(() => JSON.stringify(saved), 400).toFixed(3).padStart(9)} ms ${time(() => structuredClone(saved), 400).toFixed(3).padStart(6)} ms | ${elm.toFixed(3).padStart(11)} ms ${(100 * elm / 16.67).toFixed(1).padStart(10)}%`);
}
