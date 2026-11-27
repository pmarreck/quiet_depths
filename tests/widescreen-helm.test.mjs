import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {helmStatusText} from '../src/helm-status.js';

const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');
const [page,app,helmCss]=await Promise.all([read('index.html'),read('app.js'),read('helm.css')]);

test('the one-line helm status reports actual and ordered heading, depth and speed',()=>{
 assert.equal(helmStatusText({heading:49.4,targetHeading:359.7,depth:38.4,targetDepth:90,speed:2.84},18.2),
  'HDG 049° → 000° · DEPTH 38 → 90 m · SPEED 2.8 kn · THR 18%');
 assert.equal(helmStatusText({heading:-0.4,targetHeading:7,depth:0,targetDepth:0,speed:-1.25},-30),
  'HDG 000° → 007° · DEPTH 0 → 0 m · SPEED -1.3 kn · THR -30%');
});

test('widescreen keeps the helm on Periscope & Controls and the ROV, with a status line elsewhere',()=>{
 assert.match(page,/<link rel="stylesheet" href="mobile\.css">\n<link rel="stylesheet" href="helm\.css">/,'helm.css loads last so its widescreen rules apply');
 assert.match(page,/<button data-view="scope" data-short="Scope" class="active"><span>01<\/span> PERISCOPE<span class="wide-label"> &amp; CONTROLS<\/span><\/button>/);
 assert.match(page,/<div id="helm-status" class="helm-status"><\/div>/);
 assert.ok(app.includes("$('helm-status').textContent=helmStatusText(s,throttlePercent(s.targetSpeed));"));
 const wide=helmCss.slice(helmCss.indexOf('@media (min-width:1101px)'));
 assert.ok(wide.length<helmCss.length,'widescreen rules sit in a min-width query above the compact layout');
 const hidden='body:not(.orbiting):is([data-station=sonar],[data-station=chart],[data-station=tower],[data-station=gun],[data-station=photos])';
 assert.ok(wide.includes(hidden+' :is(.soundings-strip,.helm-caption,.helm){display:none}'));
 assert.ok(wide.includes(hidden+' .helm-status{display:flex}'));
 assert.ok(helmCss.startsWith('.wide-label,.helm-status{display:none}'),'compact layouts keep the short tab label and the full helm');
});
