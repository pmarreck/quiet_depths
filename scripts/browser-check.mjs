// Plays every mission in a real browser: begins each patrol, plays it at 1x
// and then at 20x, and reports the patrol's saved time and status (or its
// patrol report, if it ended) and every console warning, error and uncaught
// exception. Under ?sim=elm it then times a step through the Web Worker on
// each patrol's save. Exits nonzero if the console was not quiet.
//   node scripts/browser-check.mjs CDP_URL SITE_URL [QUERY] [SECONDS_1X] [SECONDS_20X] [MISSIONS]
// for example: node scripts/browser-check.mjs http://127.0.0.1:9222 http://127.0.0.1:4173/ '?sim=elm'
// See scripts/cdp.mjs for starting the browser and serving the site.
import {openPage, beginPatrol, pause, heardSince} from './cdp.mjs';

const [cdp, site, query = '', oneX = '8', twentyX = '20', only = ''] = process.argv.slice(2);
if (!cdp || !site) { console.error('usage: node scripts/browser-check.mjs CDP_URL SITE_URL [QUERY] [SECONDS_1X] [SECONDS_20X] [MISSIONS]'); process.exit(2); }
const url = site + query, page = await openPage(cdp);
await page.clear(url);
await page.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 800, deviceScaleFactor: 1, mobile: false});
await page.load(url);
await page.until('document.querySelectorAll("[data-mission]").length > 0');
const missions = (await page.evaluate('[...document.querySelectorAll("[data-mission]")].map(b => b.dataset.mission)')).filter(m => !only || only.split(',').includes(m));
const elm = await page.evaluate(`(async () => (await import('/simulation.js')).elmSimulationActive())()`);
console.log('page', url, '| Elm simulation active:', elm, '| missions:', missions.join(', '));
const patrol = () => page.evaluate(`(() => { const s = JSON.parse(localStorage.getItem("quiet-depths-v1") ?? "null"), report = document.getElementById("result-dialog");
  return {saved: s && {time: Math.round(s.time), status: s.status, depth: Math.round(s.depth), speed: +s.speed.toFixed(1)},
    result: report?.open ? report.innerText.slice(0, 120).replace(/\\s+/g, " ") : null}; })()`);
const saves = {};
let noisy = false;
for (const mission of missions) {
  const from = page.heard.length;
  await beginPatrol(page, url, mission);
  await pause(+oneX * 1000);
  const at1 = await patrol();
  await page.evaluate(`document.querySelector('[data-time="20"]').click()`);
  await pause(+twentyX * 1000);
  const at20 = await patrol();
  saves[mission] = await page.evaluate('localStorage.getItem("quiet-depths-v1")');
  noisy ||= page.heard.length > from;
  console.log(mission.padEnd(22), '1x:', JSON.stringify(at1), '| 20x:', JSON.stringify(at20), '| console:', heardSince(page.heard, from));
}

if (elm) {
  await page.load(url);
  await page.until('document.querySelectorAll("[data-mission]").length > 0');
  const bench = await page.evaluate(`(async () => {
    const ts = await import('/sim.js'), {elmSimulation, workerTransport} = await import('/elm-simulation.js');
    const sim = await elmSimulation(workerTransport(new Worker('/sim-worker.js')));
    const saves = ${JSON.stringify(saves)}, out = {};
    const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const perFrame = async (w, frame, n) => { for (let i = 0; i < 30; i++) await frame(w); const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); await frame(w); t.push(performance.now() - t0); } return +median(t).toFixed(3); };
    for (const [mission, text] of Object.entries(saves)) {
      if (!text || JSON.parse(text).status !== 'patrol') { out[mission] = 'ended'; continue; }
      const frame = (rate, f) => w => f(w, rate / 60, {timeRate: rate, observation: 'scope'});
      out[mission] = {ts1: await perFrame(ts.restore(text), frame(1, ts.step), 200), elm1: await perFrame(await sim.restore(text), frame(1, sim.step), 200),
        ts20: await perFrame(ts.restore(text), frame(20, ts.step), 200), elm20: await perFrame(await sim.restore(text), frame(20, sim.step), 200)};
    }
    return out;
  })()`);
  console.log('a step from call to its effect on the page, ms (median of 200; the browser times to 0.1 ms):');
  for (const [mission, r] of Object.entries(bench)) console.log('  ' + mission.padEnd(22), typeof r === 'string' ? r : `TypeScript 1x ${r.ts1}, 20x ${r.ts20} | through the worker 1x ${r.elm1}, 20x ${r.elm20}`);
}
await page.close();
process.exit(noisy ? 1 : 0);
