// Compiles the simulation worker for the page (elm/SimWorker.elm),
// optimized, with its ports answering within each command; see
// elm-sync-ports.mjs. The page loads it only when asked to run the Elm
// simulation.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {synchronousPorts} from './elm-sync-ports.mjs';

const output = process.argv[2];
if (!output) throw new Error('usage: node scripts/build-sim-worker.mjs OUTPUT.js');
const raw = output.replace(/\.js$/, '') + '.stock.js';
execFileSync('elm', ['make', 'elm/SimWorker.elm', '--optimize', '--output=' + raw], {stdio: 'inherit'});
writeFileSync(output, synchronousPorts(readFileSync(raw, 'utf8')));
