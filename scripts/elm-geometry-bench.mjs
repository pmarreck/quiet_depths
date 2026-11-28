// What the number-type pilot costs: Sim.CombatGeometry's ship-box and sphere
// tests written with Sim.Finite, against the same functions as Floats before
// the pilot (see elm/Bench/Geometry.elm). Run through `nix develop`, which
// provides Elm: node scripts/elm-geometry-bench.mjs
// A measurement, not a test: it prints timings, and fails only when the two
// versions' results differ.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), dir = mkdtempSync(join(tmpdir(), 'quiet-depths-bench-'));
const optimize = !process.argv.includes('--debug');
let source;
try {
  execFileSync('elm', ['make', 'elm/Bench/Geometry.elm', ...(optimize ? ['--optimize'] : []), '--output=' + join(dir, 'geometry.js')], {cwd: root, stdio: 'pipe'});
  source = readFileSync(join(dir, 'geometry.js'), 'utf8');
} finally { rmSync(dir, {recursive: true, force: true}); }
const scope = {}; new Function(source).call(scope);
const app = scope.Elm.Bench.Geometry.init(); let resolve; app.ports.reply.subscribe(v => resolve(v));
const run = (variant, rounds) => new Promise(r => { resolve = r; app.ports.request.send({variant, rounds}); });

const corpus = 5000, rounds = 200, rows = {};
for (const variant of ['box-float', 'box-finite', 'sphere-float', 'sphere-finite']) {
  await run(variant, rounds / 10);
  let best = Infinity, checksum;
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); checksum = await run(variant, rounds); best = Math.min(best, performance.now() - t0); }
  rows[variant] = {ns: 1e6 * best / (corpus * rounds), checksum};
}
console.log(`${optimize ? '--optimize' : 'debug build'}; ${corpus} calls a round, ${rounds} rounds, best of 5`);
console.log('function    Float ns/call   Finite ns/call   times Float   checksums equal');
let same = true;
for (const name of ['box', 'sphere']) {
  const f = rows[name + '-float'], p = rows[name + '-finite'], equal = f.checksum === p.checksum;
  same &&= equal;
  console.log(`${(name === 'box' ? 'shipHit' : 'sphereHit').padEnd(10)} ${f.ns.toFixed(1).padStart(14)} ${p.ns.toFixed(1).padStart(16)} ${(p.ns / f.ns).toFixed(2).padStart(13)}   ${equal ? 'yes' : `NO (${f.checksum} vs ${p.checksum})`}`);
}
if (!same) process.exit(1);
