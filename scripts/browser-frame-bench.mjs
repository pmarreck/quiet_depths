// What a tick of the Elm simulation costs the page in a real browser, with
// Chromium's CPU throttled 1x, 4x and 6x to stand in for slower devices:
// the page's own share (receiving the worker's changed fields and refreshing
// its patrol object, beside receiving whole worlds), how much of each world
// the worker sends, and a whole step's round trip at 1x and 20x. Throttling
// reaches the page's thread, not the worker's. A measurement, not a test.
//   node scripts/browser-frame-bench.mjs CDP_URL SITE_URL
// See scripts/cdp.mjs for starting the browser and serving the site.
import {openPage} from './cdp.mjs';

const [cdp, site] = process.argv.slice(2);
if (!cdp || !site) { console.error('usage: node scripts/browser-frame-bench.mjs CDP_URL SITE_URL'); process.exit(2); }
const page = await openPage(cdp);
await page.clear(site);
await page.load(site);
await page.until('document.querySelectorAll("[data-mission]").length > 0');
for (const rate of [1, 4, 6]) {
  await page.send('Emulation.setCPUThrottlingRate', {rate});
  const result = await page.evaluate(`(async () => {
    const ts = await import('/sim.js'), {elmSimulation, workerTransport} = await import('/elm-simulation.js'), {refreshMirror, refreshChanged} = await import('/world-mirror.js');
    const worker = new Worker('/sim-worker.js'), replies = [];
    // The worker as the adapter sees it, each reply also kept for timing.
    const seen = {postMessage: m => worker.postMessage(m), addEventListener: (type, l) => worker.addEventListener(type, e => { replies.push(e.data); l(e); })};
    const sim = await elmSimulation(workerTransport(seen));
    const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const time = async (f, n) => { for (let i = 0; i < 20; i++) await f(); const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); await f(); t.push(performance.now() - t0); } return +median(t).toFixed(2); };
    const out = {};
    for (const mission of ['recon', 'tiebreaker', 'wolf-in-the-henhouse']) {
      const s = ts.createGame(mission, 4242, {}); s.scope = true; s.targetDepth = 12;
      for (let t = 0; t < 1200; t++) ts.step(s, .25, {timeRate: 1, observation: 'scope'});
      const text = ts.save(s), m = await sim.restore(text), mirror = JSON.parse(text), world = JSON.parse(text);
      replies.length = 0;
      for (let i = 0; i < 60; i++) await sim.step(m, 1 / 60, {timeRate: 1, observation: 'scope'});
      const ticks = replies.flatMap(r => r.ticks ?? []);
      let k = 0;
      out[mission] = {status: s.status,
        whole: await time(() => refreshMirror(mirror, structuredClone(world)), 100),
        changes: await time(() => { const c = structuredClone(ticks[k++ % ticks.length]).changes; refreshChanged(mirror, c.set, c.unset); }, 100),
        kb: (JSON.stringify(ticks.map(t => t.changes.set)).length / ticks.length / 1024).toFixed(1) + ' of ' + (text.length / 1024).toFixed(1),
        step1: await time(() => sim.step(m, 1 / 60, {timeRate: 1, observation: 'scope'}), 100),
        step20: await time(() => sim.step(m, 20 / 60, {timeRate: 20, observation: 'scope'}), 100)};
    }
    worker.terminate();
    return out;
  })()`);
  console.log('CPU throttled ' + rate + 'x (ms, median of 100):');
  for (const [mission, r] of Object.entries(result))
    console.log('  ' + mission.padEnd(22), r.status, `| the page's share of a tick ${r.changes} (whole worlds ${r.whole}; ${r.kb} KB sent) | a step's round trip 1x ${r.step1}, 20x ${r.step20}`);
}
await page.close();
