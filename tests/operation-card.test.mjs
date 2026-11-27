import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/OperationCard.elm')]);

test('the operation card is drawn only by its Elm view',()=>{
 assert.match(page,/<div id="operation-card-root"><\/div>/);
 for(const id of ['operation-card','operation-range','operation-advice','start-rescue','approach-site','hold-position']){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
  assert.doesNotMatch(app,new RegExp(`(\\$|bindCommand)\\('${id}'`),'app.js must not bind or write #'+id+' directly');
 }
});

test('every order the card sends has a guarded handler, and the buttons follow the same rules',()=>{
 const sent=new Set([...elm.matchAll(/Give "([\w-]+)"/g)].map(m=>m[1]));
 assert.deepEqual([...sent].sort(),['approach','hold','start-rescue']);
 const table=app.match(/const operationOrders=\{([\s\S]*?)\n\};/);
 assert.ok(table,'app.js keeps an operation order table');
 const handled=new Set([...table[1].matchAll(/^ '?([\w-]+)'?:\{enabled:/gm)].map(m=>m[1]));
 assert.deepEqual([...handled].sort(),[...sent].sort());
 assert.ok(app.includes(`operationCard.ports.operationOrder.subscribe(kind=>{
 const command=operationOrders[kind];
 if(!command||view==='orbit'||!canIssue(state,context())||!command.enabled())return;
 command.run();updateUI();
});`));
 for(const [flag,kind] of [['startEnabled',"operationOrders['start-rescue']"],['approachEnabled','operationOrders.approach'],['holdEnabled','operationOrders.hold']])
  assert.ok(app.includes(`${flag}:able(${kind}.enabled)`),flag);
});

test('the card shows the rescue start only while a rescue can still begin or is under way',()=>{
 assert.match(elm,/hidden \(not r\.operation \|\| r\.survey \|\| r\.completed\)/);
 assert.match(elm,/if r\.underway then\s+"RESCUE UNDERWAY"\s+else\s+"START RESCUE HERE"/);
 assert.match(elm,/if r\.survey then\s+"PLOT SURVEY APPROACH"\s+else\s+"PLOT RESCUE APPROACH"/);
 assert.match(elm,/classList \[ \( "operation-card", True \), \( "hidden", not r\.operation \) \]/);
});

test('each operation order keeps the enabling rule its button had',()=>{
 const table=app.match(/const operationOrders=\{([\s\S]*?)\n\};/)[1];
 const rules=Object.fromEntries([...table.matchAll(/^ '?([\w-]+)'?:\{enabled:(.*?),run:/gm)].map(m=>[m[1],m[2]]));
 assert.deepEqual(rules,{
  'start-rescue':"()=>!!state.operation&&!state.operation.completed&&state.mission!=='survey'&&operationConditions(state).onStation",
  approach:'()=>!!operationApproach(state)',
  hold:'()=>true',
 });
});
