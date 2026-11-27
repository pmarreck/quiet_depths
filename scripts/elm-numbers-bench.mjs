// What a software number type would cost the Elm simulation: the same kernel
// as Float, as an opaque wrapper around Float, and as a mantissa and exponent
// (see elm/Bench/Numbers.elm). Run through `nix develop`, which provides Elm:
// node scripts/elm-numbers-bench.mjs
// A measurement, not a test: it prints timings and checks nothing.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), dir = mkdtempSync(join(tmpdir(), 'quiet-depths-bench-'));
let source;
try {
  execFileSync('elm', ['make', 'elm/Bench/Numbers.elm', '--optimize', '--output=' + join(dir, 'numbers.js')], {cwd: root, stdio: 'pipe'});
  source = readFileSync(join(dir, 'numbers.js'), 'utf8');
} finally { rmSync(dir, {recursive: true, force: true}); }
const scope = {}; new Function(source).call(scope);
const app = scope.Elm.Bench.Numbers.init(); let resolve; app.ports.reply.subscribe(v => resolve(v));
const run = (variant, n) => new Promise(r => { resolve = r; app.ports.request.send({variant, n}); });

const n = 2_000_000, rows = [];
for (const variant of ['float', 'real', 'num']) {
  await run(variant, n / 10);
  let best = Infinity, result;
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); result = await run(variant, n); best = Math.min(best, performance.now() - t0); }
  rows.push({variant, ns: 1e6 * best / n, result});
}
const base = rows[0].ns;
console.log('variant   ns per step   times Float   kernel result');
for (const r of rows) console.log(`${r.variant.padEnd(8)} ${r.ns.toFixed(1).padStart(11)} ${(r.ns / base).toFixed(1).padStart(12)}   ${r.result}`);
