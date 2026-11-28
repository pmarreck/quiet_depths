// Adds to each recording the oracle for this engine's math, replaying it
// through the TypeScript simulation: needed when Node's transcendental
// functions change, while the TypeScript simulation exists (see
// typescript/play-recording.ts). Refuses a recording whose replay throws
// where the page's did not.
//   nix develop -c node --experimental-transform-types --no-warnings scripts/add-replay-oracle.mjs tests/recordings/NAME.json.gz...
import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import * as sim from '../src/simulation.js';
import {addOracle, exactJson, fromExactJson, mathFingerprint} from '../src/play-recording.js';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: scripts/add-replay-oracle.mjs RECORDING.json.gz...'); process.exit(2); }
let refused = false;
for (const file of files) {
  const recording = fromExactJson(gunzipSync(readFileSync(file)).toString()), fingerprint = mathFingerprint();
  if (recording.oracles[fingerprint]) { console.log(file + ': already has this engine\'s oracle'); continue; }
  const others = Object.values(recording.oracles), oracle = await addOracle(recording, sim, 'Node ' + process.versions.node);
  const strange = Object.keys(oracle.threw).filter(i => !others.some(o => i in o.threw));
  if (strange.length) { refused = true; console.error(`${file}: calls ${strange.join(', ')} threw here and not where it was recorded: ${oracle.threw[strange[0]]}`); continue; }
  writeFileSync(file, gzipSync(exactJson(recording), {level: 9}));
  console.log(`${file}: added the oracle for ${oracle.engine} (${fingerprint}), ${Object.keys(oracle.digests).length} digests`);
}
process.exit(refused ? 1 : 0);
