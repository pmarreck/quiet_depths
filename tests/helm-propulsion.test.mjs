import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('the Elm propulsion view is the only source of the propulsion controls',async()=>{
 const [page,elm]=await Promise.all([read('src/index.html'),read('elm/HelmPropulsion.elm')]);
 assert.match(page,/<div class="helm-group propulsion"><div id="propulsion-root"><\/div><\/div>/);
 for(const id of ['electric','diesel','silent','diesel-mode','engine-hint']){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"|engineButton reading "${id}"`),'the Elm view renders #'+id);
 }
});

test('every order the Elm propulsion view sends has a guarded handler in the app',async()=>{
 const [app,elm]=await Promise.all([read('src/app.js'),read('elm/HelmPropulsion.elm')]);
 const sent=new Set([...elm.matchAll(/kind = "(\w+)"/g)].map(m=>m[1]));
 assert.deepEqual([...sent].sort(),['dieselMode','engine','silent']);
 const table=app.match(/const propulsionOrders=\{([\s\S]*?)\n\};/);
 assert.ok(table,'app.js keeps a propulsion order table');
 const handled=new Set([...table[1].matchAll(/^ (\w+):\{enabled:/gm)].map(m=>m[1]));
 assert.deepEqual([...handled].sort(),[...sent].sort(),'each sent kind is handled, and nothing else');
 // Orders are refused outside a live patrol and in the orbit view, as clicks were before.
 assert.match(app,/if\(!command\|\|view==='orbit'\|\|!canIssue\(state,context\(\)\)\|\|!command\.enabled\(\)\)return;/);
});

test('a helm axis holds the player’s slider value until the app reports that order handled',async()=>{
 const [app,elm]=await Promise.all([read('src/app.js'),read('elm/HelmAxis.elm')]);
 // Readings that predate an order must not snap the slider back a step: the
 // view keeps its value until a reading has handled >= the order's sequence.
 assert.match(elm,/if reading\.handled >= model\.seq then/);
 assert.match(elm,/axisOrder \{ axis = model\.flags\.axis, kind = "set", value = amount, detent = detent, seq = seq \}/);
 // A turn is relative to the app's requested value, so it holds nothing and
 // reuses the latest sequence number rather than claiming a new one.
 assert.match(elm,/axisOrder \{ axis = model\.flags\.axis, kind = "nudge", value = by, detent = False, seq = model\.seq \}/);
 // The app counts every order as handled, including one it refuses, before the
 // guard, and every reading the axis receives carries that count.
 const handler=app.match(/app\.ports\.axisOrder\.subscribe\(\(\{kind,value,detent,seq\}\)=>\{\n([^\n]*)\n([^\n]*)\n([^\n]*)\n \}\);/);
 assert.ok(handler,'the shared axis order handler is present');
 assert.equal(handler[1],'  handled=Math.max(handled,seq);');
 assert.equal(handler[2],"  if(view!=='orbit'&&canIssue(state,context())&&pilotEnabled())kind==='nudge'?nudgeHelm(state,context(),value):order(axis,axis==='speed'&&detent?throttleDetent(value):value);");
 assert.equal(handler[3],'  updateUI();');
 assert.match(app,/return \{send:reading=>app\.ports\.axisReading\.send\(\{\.\.\.reading,handled\}\)\};/);
 // Every helm axis goes through that helper; none talks to its ports directly.
 assert.equal([...app.matchAll(/ports\.axis(Reading|Order)/g)].length,2);
 for(const axis of ['heading','depth','speed'])assert.match(app,new RegExp(`const ${axis}Axis=mountAxis\\('${axis}',`));
});

test('the heading axis, with its turn buttons, comes only from the Elm helm view',async()=>{
 const [page,app]=await Promise.all([read('src/index.html'),read('src/app.js')]);
 // The compass stays its own Elm program beside the heading axis view.
 assert.match(page,/<div class="helm-group course-control"><div id="heading-axis-root"><\/div><div id="helm-compass" class="helm-compass-frame" aria-hidden="true"><div id="helm-compass-root"><\/div><\/div><\/div>/);
 for(const id of ['port','starboard','heading','heading-value','heading-order'])
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
 const mount=app.match(/const headingAxis=mountAxis\('heading',\{title:'HEADING',unit:'° TRUE',presetsClass:'',sublabelId:'',nudges:\[\n([^\n]*)\]\}\);/);
 assert.ok(mount,'the heading axis is mounted with its turn buttons');
 const turns=[...mount[1].matchAll(/\{id:'(\w+)',label:'(.)',aria:'Turn 15 degrees to (\w+)',by:(-?\d+),before:(true|false)\}/g)].map(m=>m.slice(1));
 assert.deepEqual(turns,[['port','−','port','-15','true'],['starboard','+','starboard','15','false']]);
 // Nothing else in the app binds the old turn buttons or heading slider.
 assert.doesNotMatch(app,/bindCommand\('(port|starboard)'|bindOrderRange\('heading'|\$\('heading(-value|-order)?'\)/);
});
