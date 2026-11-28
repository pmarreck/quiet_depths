// Records real play for the replay tests (tests/play-replay.test.mjs):
// plays each mission in a browser under ?record, working the controls a
// player uses (the helm keys, every station, the periscope, sonar pings,
// photographs, the drone, a contact and a torpedo, the deck gun and a
// noisemaker, the time rates and pausing). Each recording is then replayed
// in the same browser, through the TypeScript simulation, which shows the
// recording missed nothing the page put in, and through the Elm worker;
// both must reach the page's oracle. Node's oracle is added, and the
// recording written, gzipped, to OUTDIR/<mission>.json.gz. Exits nonzero
// if the console was not quiet or a replay parted from the page.
//   nix develop -c node --experimental-transform-types --no-warnings scripts/record-play.mjs CDP_URL SITE_URL OUTDIR [MISSIONS]
// See scripts/cdp.mjs for starting the browser and serving the site.
import {gzipSync} from 'node:zlib';
import {mkdirSync, writeFileSync} from 'node:fs';
import {openPage, beginPatrol, pause, heardSince} from './cdp.mjs';
import * as sim from '../src/simulation.js';
import {addOracle, exactJson, fromExactJson} from '../src/play-recording.js';

const [cdp, site, out, only = ''] = process.argv.slice(2);
if (!cdp || !site || !out) { console.error('usage: node scripts/record-play.mjs CDP_URL SITE_URL OUTDIR [MISSIONS]'); process.exit(2); }
const url = site + '?record', page = await openPage(cdp), checker = await openPage(cdp);
// The replays run on a page of the site that is not the game.
await checker.load(site + 'build-provenance.json');
mkdirSync(out, {recursive: true});
await page.clear(url);
await page.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 800, deviceScaleFactor: 1, mobile: false});
// The page pauses a patrol when it loses focus; a headless page must keep it.
await page.send('Emulation.setFocusEmulationEnabled', {enabled: true});
await page.load(url);
await page.until('document.querySelectorAll("[data-mission]").length > 0');
const missions = (await page.evaluate('[...document.querySelectorAll("[data-mission]")].map(b => b.dataset.mission)')).filter(m => !only || only.split(',').includes(m));

// Presses a key by its code, holding it `ms` milliseconds, as a player would.
const press = async (code, ms = 60) => {
  const letter = /^Key([A-Z])$/.exec(code)?.[1], digit = /^Digit([0-9])$/.exec(code)?.[1];
  const key = letter ? letter.toLowerCase() : digit ?? (code === 'Space' ? ' ' : code);
  const windowsVirtualKeyCode = letter ? letter.charCodeAt(0) : digit ? digit.charCodeAt(0) : code === 'Space' ? 32 : code === 'Escape' ? 27 : 0;
  await page.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', code, key, windowsVirtualKeyCode});
  await pause(ms);
  await page.send('Input.dispatchKeyEvent', {type: 'keyUp', code, key, windowsVirtualKeyCode});
  await pause(150);
};
// Clicks a control if the page shows it enabled; a mission without it skips it.
const click = selector => page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
const rate = async (r, seconds) => { await click(`.time-controls [data-time="${r}"]`); await pause(seconds * 1000); };

// Replays a recording in the browser, through the TypeScript and through
// the Elm worker: where each first parts from the page's oracle, or null.
const replayInBrowser = text => checker.evaluate(`(async () => {
  const sim = await import('/simulation.js'), rec = await import('/play-recording.js'), {elmSimulation, workerTransport} = await import('/elm-simulation.js');
  const recording = rec.fromExactJson(${JSON.stringify(text)});
  const typed = await rec.checkReplay(recording, sim), worker = new Worker('/sim-worker.js');
  sim.useElmSimulation(await elmSimulation(workerTransport(worker)));
  try { return {typed, elm: await rec.checkReplay(recording, sim)}; } finally { sim.useElmSimulation(null); worker.terminate(); }
})()`);

let noisy = false, parted = false;
for (const mission of missions) {
  const from = page.heard.length;
  // A tab behind another gets few animation frames.
  await page.send('Page.bringToFront');
  await beginPatrol(page, url, mission);
  await pause(1000);
  // The helm and the stations.
  await press('KeyA', 1200); await press('KeyW', 800); await press('KeyC', 400);
  await press('Digit2'); await press('KeyG'); await pause(1500);
  await press('Digit3'); await click('#plot-home'); await pause(800); await click('#clear-route');
  await press('Digit1'); await press('KeyP'); await pause(600); await press('KeyF'); await press('KeyP');
  await press('KeyD', 1000); await press('KeyS', 600); await press('Space', 300); await press('KeyR'); await pause(800); await press('KeyR');
  await press('Digit5'); await pause(800); await press('Digit6'); await press('KeyJ', 400); await click('#decoy');
  await press('Digit4'); await click('#deploy-drone'); await pause(2000); await click('#drone-photo'); await click('#recall-drone');
  await press('Digit7'); await pause(500); await press('Digit1');
  // Time passing, then a contact and a torpedo if one is heard.
  await rate(5, 4); await rate(20, 10);
  await press('Escape'); await pause(800); await press('Escape');
  if (await click('#contacts .contact-row')) { await pause(400); await click('#fire'); }
  await rate(20, 8); await rate(1, 2);
  const text = await page.evaluate('quietDepthsRecording.text()');
  const summary = await page.evaluate(`(() => { const r = quietDepthsRecording.recording(), c = r.calls;
    return {calls: c.length, steps: c.filter(x => x.call === 'step').length, actions: [...new Set(c.filter(x => x.call !== 'step').map(x => x.call))].join(' '),
      digests: Object.keys(Object.values(r.oracles)[0].digests).length, status: JSON.parse(localStorage.getItem('quiet-depths-v1') ?? '{}').status}; })()`);
  const replayed = await replayInBrowser(text), recording = fromExactJson(text), [recorded] = Object.values(recording.oracles);
  const node = await addOracle(recording, sim, 'Node ' + process.versions.node), strange = Object.keys(node.threw).filter(i => !(i in recorded.threw));
  const gz = gzipSync(exactJson(recording), {level: 9});
  writeFileSync(`${out}/${mission}.json.gz`, gz);
  noisy ||= page.heard.length > from;
  parted ||= replayed.typed !== null || replayed.elm !== null || strange.length > 0;
  console.log(mission.padEnd(22), JSON.stringify(summary), `| gzipped ${(gz.length / 1024).toFixed(0)} KB | replayed in the browser:`, JSON.stringify(replayed),
    strange.length ? `| THREW IN NODE at ${strange.join(', ')}: ${node.threw[strange[0]]}` : '', '| console:', heardSince(page.heard, from));
}
await page.close();
await checker.close();
process.exit(noisy || parted ? 1 : 0);
