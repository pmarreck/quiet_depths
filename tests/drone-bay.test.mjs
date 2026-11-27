import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/DroneBay.elm')]);

test('the drone bay panel is drawn only by its Elm view',()=>{
 assert.match(page,/<div id="drone-bay-root"><\/div><\/div><div id="captains-log-root"><\/div>/);
 for(const id of ['drone-bay-mode','drone-bay-metrics','drone-bay-advice']){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
  assert.doesNotMatch(app,new RegExp(`\\$\\('${id}'\\)`),'app.js must not write #'+id+' directly');
 }
 assert.match(elm,/section \[ class "drone-bay" \]/);
 assert.ok(app.includes(" droneBay.ports.droneBayReading.send(droneBayReading(s));\n"));
});

test('the bay advice follows the drone: lost, stowed, or out on its link',()=>{
 const bay=elm.match(/bay mode =\n([\s\S]*?)\n\n\nadvice/)[1].replace(/\s+/g,' ').trim();
 assert.equal(bay,'if mode == "lost" then Lost else if mode == "stowed" then Stowed else Outside');
 const advice=elm.match(/advice r =\n([\s\S]*?)\n\n\nmetric/)[1].replace(/\s+/g,' ').trim();
 assert.equal(advice,'case bay r.mode of Lost -> r.lostReason Stowed -> if r.deployReason == "" then "READY · 280 M MAX · DEPLOY ≤3 KN" else r.deployReason Outside -> r.link ++ " / 100 M LINK · BUOYANCY " ++ r.buoyancy ++ "%"');
 assert.match(elm,/classList \[ \( "damaged", bay r\.mode == Lost \) \]/);
 assert.match(elm,/metric "CHARGE" \(r\.charge \+\+ "%"\) :: List\.map/);
});
