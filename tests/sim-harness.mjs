// Runs the Elm simulation's functions from Node so a ported module can be
// compared with the TypeScript it replaces. The harness is compiled with the
// project's Elm on first use; the Nix build provides Elm and its packages, and
// `nix develop` provides them locally. Test files run in parallel processes
// and Elm keeps its build state in the project's elm-stuff, so compilations
// take turns behind an atomic lock directory, and each writes its output to a
// private temporary directory.
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
let harness = null, nextId = 0;
const pending = new Map();

function exclusively(work) {
  const lock = join(root, 'elm-stuff', 'sim-harness.lock'), deadline = Date.now() + 120_000;
  mkdirSync(join(root, 'elm-stuff'), {recursive: true});
  for (;;) {
    try { mkdirSync(lock); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() > deadline) throw new Error('Another process has held ' + lock + ' for two minutes; remove it if no test is running.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return work(); } finally { rmSync(lock, {recursive: true, force: true}); }
}

function load() {
  if (harness) return harness;
  const dir = mkdtempSync(join(tmpdir(), 'quiet-depths-sim-'));
  try {
    const output = join(dir, 'sim-harness.js');
    try {
      exclusively(() => execFileSync('elm', ['make', 'elm/SimHarness.elm', '--optimize', '--output=' + output], {cwd: root, stdio: 'pipe'}));
    } catch (error) {
      throw new Error('Could not compile elm/SimHarness.elm. Run the tests through ./test or nix develop, which provide Elm.\n' + (error.stderr ?? error.message));
    }
    const scope = {};
    new Function('scope', readFileSync(output, 'utf8').replace(/\}\(this\)\);\s*$/, '}(scope));'))(scope);
    if (!scope.Elm?.SimHarness) throw new Error('The compiled harness did not define Elm.SimHarness');
    harness = scope.Elm.SimHarness.init();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
  harness.ports.results.subscribe(({id, results, error}) => {
    const request = pending.get(id);
    pending.delete(id);
    if (error) request.reject(new Error(error)); else request.resolve(results);
  });
  return harness;
}

// Runs `fn` on each argument list in `batch` and resolves with the results in order.
export function elm(fn, batch = [[]]) {
  const app = load(), id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject});
    app.ports.calls.send({id, fn, batch});
  });
}

// A seeded generator, so every run compares the same inputs.
// The same check as assert.deepStrictEqual on the whole batch (same length,
// each call's result strictly equal), reporting only the first differing
// call. A full diff of thousands of differing results can take minutes and
// gigabytes, long enough for a mutation run's timeout to cancel the test.
export function sameResults(actual, expected) {
  assert.ok(Array.isArray(actual) && Array.isArray(expected), 'both are batches');
  for (let i = 0; i < Math.max(actual.length, expected.length); i++)
    if (!isDeepStrictEqual(actual[i], expected[i])) assert.deepStrictEqual(actual[i], expected[i], `call ${i} of ${expected.length} differs`);
  assert.equal(actual.length, expected.length);
}

// A copy of a result that keeps every number exactly, for sameResults to
// compare. JSON would turn NaN and both infinities into null and -0 into 0,
// hiding a port that produced one where the TypeScript produced another.
// Only object keys whose value is undefined are dropped, since Elm leaves an
// absent Maybe out of what it encodes.
export function exact(value) {
  if (Array.isArray(value)) return value.map(exact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, exact(v)]));
  return value;
}

export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
