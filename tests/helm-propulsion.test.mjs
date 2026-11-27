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
