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
 assert.match(elm,/axisOrder \{axis = model\.flags\.axis, value = amount, detent = detent, seq = seq\}/);
 // The app counts every order as handled, including one it refuses, before any
 // guard can return, and reports the count in each reading.
 const handler=app.match(/depthAxis\.ports\.axisOrder\.subscribe\(\(\{value,seq\}\)=>\{\n([^\n]*)\n([^\n]*)\n/);
 assert.ok(handler,'the depth axis order handler is present');
 assert.equal(handler[1],' depthOrderSeq=Math.max(depthOrderSeq,seq);');
 assert.match(handler[2],/^ if\(view==='orbit'\|\|!canIssue\(state,context\(\)\)\|\|!pilotEnabled\(\)\)\{updateUI\(\);return;\}$/);
 assert.match(app,/presets:depthPresets,handled:depthOrderSeq\}\);/);
});
