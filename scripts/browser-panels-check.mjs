// Works the interface panels that moved to Elm in a real browser and checks
// what a player would see: the deck gun and noisemaker, the contacts list,
// the header over the view and the line under it at every station, the time
// controls, and the phone layout's gun station. Prints each reading and
// exits nonzero on the first that is wrong or if the console was not quiet.
//   node scripts/browser-panels-check.mjs CDP_URL SITE_URL [QUERY]
// See scripts/cdp.mjs for starting the browser and serving the site.
import assert from 'node:assert/strict';
import {openPage, beginPatrol, pause, heardSince} from './cdp.mjs';

const [cdp, site, query = ''] = process.argv.slice(2);
if (!cdp || !site) { console.error('usage: node scripts/browser-panels-check.mjs CDP_URL SITE_URL [QUERY]'); process.exit(2); }
const url = site + query, page = await openPage(cdp), show = (what, value) => { console.log(what + ':', JSON.stringify(value)); return value; };
await page.clear(url);
await page.send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});

// The deck gun and noisemaker, surfaced in the convoy defense.
await beginPatrol(page, url, 'wolf-in-the-henhouse');
await pause(1500);
const gun = () => page.evaluate(`({ammo: document.getElementById('gun-ammo').textContent, decoys: document.getElementById('decoy-count').textContent,
  targets: [...document.querySelectorAll('#gun-target option')].map(o => o.textContent), station: document.body.dataset.station})`);
const armed = show('deck gun panel', await gun());
assert.deepEqual([armed.ammo, armed.decoys, armed.targets[0]], ['240', '3 LEFT', 'MANUAL AIM']);
await page.evaluate(`document.getElementById('decoy').click()`);
await pause(600);
assert.equal(show('after a noisemaker', await gun()).decoys, '2 LEFT');
assert.equal(await page.evaluate(`document.getElementById('toast').textContent`), 'Noisemaker deployed. Turn away and go quiet.');
await page.evaluate(`document.getElementById('open-gun').click()`);
await pause(600);
assert.equal(show('after opening the sight', await gun()).station, 'gun');

// The header and the line under the view at every station.
const header = () => page.evaluate(`(() => { const t = id => document.getElementById(id), shown = e => !!e && !e.hidden && !e.classList.contains('hidden');
  return {label: t('view-label').textContent, subtitle: t('view-subtitle').textContent, tag: t('view-tag').textContent, lamp: shown(t('lamp-copy')),
    bow: shown(t('bow-readout')), compass: shown(t('compass')) && shown(t('look-heading')), hint: t('view-hint').textContent, range: t('view-range').textContent}; })()`);
const seen = {};
for (const station of ['scope', 'sonar', 'chart', 'drone', 'tower', 'gun', 'photos']) {
  await page.evaluate(`document.querySelector('[data-view="${station}"]').click()`);
  await pause(400);
  seen[station] = show('header at ' + station, await header());
}
assert.equal(seen.scope.label, 'OPTICAL OBSERVATION');
assert.ok(seen.scope.bow && seen.scope.compass, 'the scope shows its bow readout and compass');
assert.ok(!seen.sonar.bow && !seen.sonar.compass && !seen.chart.compass, 'only optical views show the compass');
assert.match(seen.tower.subtitle, /^BINOCULARS · /);
assert.equal(seen.chart.range, 'ZOOM 1.0×');

// The time controls, then pausing.
const time = () => page.evaluate(`({active: [...document.querySelectorAll('.time-controls [data-time].active')].map(b => b.textContent),
  disabled: [...document.querySelectorAll('.time-controls [data-time]')].map(b => b.disabled), save: document.getElementById('save-status').textContent})`);
await page.evaluate(`document.querySelector('.time-controls [data-time="5"]').click()`);
await pause(300);
assert.deepEqual(show('after 5x', await time()).active, ['5×']);
await page.evaluate(`document.getElementById('pause').click()`);
await pause(300);
assert.deepEqual(show('paused', await time()).disabled, [true, true, true]);
await page.evaluate(`document.getElementById('pause').click()`);

// The contacts list: empty while nothing is heard, then rows to select.
await beginPatrol(page, url, 'survey');
const contacts = () => page.evaluate(`({count: document.getElementById('contacts-count').textContent, rows: document.querySelectorAll('#contacts .contact-row').length,
  empty: !!document.querySelector('#contacts .empty-contacts'), active: document.querySelectorAll('#contacts .contact-row.active').length, hint: document.getElementById('weapon-hint').textContent})`);
const quiet = show('contacts at the start', await contacts());
assert.deepEqual([quiet.count, quiet.rows, quiet.empty], ['00', 0, true]);
await page.evaluate(`document.querySelector('.time-controls [data-time="20"]').click()`);
await page.until(`document.querySelectorAll('#contacts .contact-row').length > 0`, 90000);
await page.evaluate(`document.querySelector('#contacts .contact-row').click()`);
await pause(400);
const chosen = show('after selecting a contact', await contacts());
assert.ok(!chosen.empty && chosen.active === 1 && chosen.hint !== 'Select a contact to set firing bearing.');

// The phone layout: the gun station's contacts drawer shows the deck gun, not torpedo control's heading and tubes.
await page.send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
await beginPatrol(page, url, 'wolf-in-the-henhouse');
const phone = show('phone gun station', await page.evaluate(`(() => {
  document.body.dataset.station = 'gun'; document.body.dataset.drawer = 'contacts';
  const display = q => { const e = document.querySelector(q); return e ? getComputedStyle(e).display : 'missing'; };
  return {heading: display('.torpedo-control>.section-heading'), tubes: display('.torpedo-control>.tubes'), gun: display('.gun-control')};
})()`));
assert.deepEqual(phone, {heading: 'none', tubes: 'none', gun: 'block'});

console.log('console:', heardSince(page.heard));
const noisy = page.heard.length > 0;
await page.close();
process.exit(noisy ? 1 : 0);
