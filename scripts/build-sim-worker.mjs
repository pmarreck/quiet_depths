// Compiles the simulation worker for the page (elm/SimWorker.elm),
// optimized, and writes it with the lines that run it in a Web Worker; see
// sim-worker-script.mjs. The page starts it only when asked to run the Elm
// simulation.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {workerScript} from './sim-worker-script.mjs';

const output = process.argv[2];
if (!output) throw new Error('usage: node scripts/build-sim-worker.mjs OUTPUT.js');
const raw = output.replace(/\.js$/, '') + '.stock.js';
execFileSync('elm', ['make', 'elm/SimWorker.elm', '--optimize', '--output=' + raw], {stdio: 'inherit'});
writeFileSync(output, workerScript(readFileSync(raw, 'utf8')));
