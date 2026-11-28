import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pointerHeading} from '../src/compass-steering.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('a point on the heading-up rim names the bearing at that angle from the actual heading',()=>{
 // A 160 px compass: the card's top always shows the actual heading.
 const at=(x,y,actual)=>pointerHeading(x,y,160,160,actual);
 assert.equal(at(80,2,49),49,'top');
 assert.equal(at(158,80,49),139,'right is 90 degrees clockwise');
 assert.equal(at(80,158,49),229,'bottom is the reciprocal');
 assert.equal(at(2,80,49),319,'left is 90 degrees counterclockwise');
 assert.equal(at(158,80,350),80,'bearings wrap past north');
 assert.equal(at(80,2,359.6),0,'requested bearings are whole degrees from 0 to 359');
 const diagonal=at(80+50,80-50,0);assert.equal(diagonal,45);
 // The hub around the readout does not steer, so a tap there cannot turn the boat.
 assert.equal(at(80,80,49),null);
 assert.equal(at(80+30,80,49),null);
 assert.equal(at(80+40,80,49),139,'the steering ring starts at half the radius');
 // A wider box steers around its own center using the smaller dimension.
 assert.equal(pointerHeading(150,10,300,160,0),0);
 assert.equal(pointerHeading(150,80,300,160,0),null);
});

test('every Elm program that the page starts is compiled into the browser bundle',async()=>{
 const [app,flake]=await Promise.all([read('src/app.js'),read('flake.nix')]);
 const started=[...app.matchAll(/globalThis\.Elm\.(\w+)\.init/g)].map(m=>m[1]);
 assert.ok(started.includes('HelmCompass'));
 const bundle=flake.match(/elm make ((?:elm\/\w+\.elm )+)--optimize --output=mission-picker\.js/)[1];
 // The simulation worker has its own file, the stock program and the lines
 // that run it in a Web Worker, which the page starts only when asked to run
 // the Elm simulation.
 const script=await read('scripts/build-sim-worker.mjs');
 assert.ok(!started.includes('SimWorker')&&script.includes("'elm/SimWorker.elm'")&&script.includes('workerScript(')&&flake.includes('node scripts/build-sim-worker.mjs sim-worker.js')&&
  flake.includes('cp sim-worker.js "$out/sim-worker.js"')&&app.includes("new Worker('sim-worker.js')"),'the simulation worker is built into its own file, installed and started');
 for(const program of new Set([...started,'MissionPicker']))assert.ok(bundle.includes('elm/'+program+'.elm'),program+' must be in the bundle');
});

test('the compass replaces the widescreen heading slider without removing the accessible control',async()=>{
 const [page,css]=await Promise.all([read('src/index.html'),read('src/helm.css')]);
 assert.match(page,/<div id="helm-compass" class="helm-compass-frame" aria-hidden="true"><div id="helm-compass-root"><\/div><\/div>/);
 assert.ok(css.startsWith('.wide-label,.helm-status,.helm-compass-frame{display:none}'),'compact layouts keep the existing heading controls');
 const band=css.slice(css.indexOf('@media (min-width:1101px)'));
 assert.ok(band.includes('.helm>.course-control>.axis-controls>.dual-range{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}'),
  'keyboard and screen-reader users keep the native heading slider');
 assert.ok(band.includes('.helm>.course-control .helm-compass-frame{display:block;grid-area:compass;justify-self:center;align-self:center;position:relative;width:146px;height:146px;overflow:hidden;'));
});
