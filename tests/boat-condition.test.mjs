import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/BoatCondition.elm')]);
const ids=['hull-value','hull-limits','hull-bar','system-status','repair','subsystems','buoyancy-readout'];

test('the boat panel’s condition readouts are drawn only by their Elm view',()=>{
 assert.match(page,/<section class="boat-panel">[\s\S]*?<\/svg><div id="boat-condition-root"><\/div><\/section>/);
 for(const id of ids){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
  assert.doesNotMatch(app,new RegExp(`\\$\\('${id}'\\)`),'app.js must not write #'+id+' directly');
 }
 assert.doesNotMatch(app,/bindCommand\('repair'/);
});

test('damage control from the Elm view is the only order and keeps its guard',()=>{
 assert.deepEqual([...elm.matchAll(/boatOrder "(\w+)"/g)].map(m=>m[1]),['repair']);
 assert.ok(app.includes(`boatCondition.ports.boatOrder.subscribe(kind=>{
 if(kind!=='repair'||view==='orbit'||!canIssue(state,context()))return;
 assignDamageControl();updateUI();
});`));
 assert.ok(app.includes(' boatCondition.ports.boatReading.send(boatReading(s,limit,canIssue(s,context())));'),'the repair button follows the same command guard');
});

test('the status line names faults in their established order and colors',()=>{
 const chain=elm.match(/status r =\n([\s\S]*?)\n\n\nstatusText/)[1].replace(/\s+/g,' ').trim();
 assert.equal(chain,'if r.fuelFire then FuelFire else if r.fuelLeak then FuelLeak else if r.repair > 0 then Repairing else if r.flood > 0 then Flooding else if r.hull < 99.9 then PressureHullDamaged else if r.outerHull < 99.9 then OuterHullDamaged else if List.any (\\v -> v < 100) r.systemConditions then SubsystemDamage else Nominal');
 const words=Object.fromEntries([...elm.match(/\nstatusText r s =\n([\s\S]*?)\n\n\n/)[1].matchAll(/^ {8}(\w+) ->\n {12}("[^"\n]+"(?: \+\+ [^\n]+)?)$/gm)].map(m=>[m[1],m[2]]));
 assert.deepEqual(words,{FuelFire:'"FUEL FIRE"',FuelLeak:'"FUEL TANK LEAK"',Repairing:'"DAMAGE CONTROL WORKING"',
  Flooding:'"FLOODING · " ++ r.floodText ++ " T/MIN · " ++ r.waterText ++ " T ABOARD"',PressureHullDamaged:'"PRESSURE HULL DAMAGED"',
  OuterHullDamaged:'"OUTER HULL DAMAGED"',SubsystemDamage:'"SUBSYSTEM DAMAGE"',Nominal:'"ALL SYSTEMS NOMINAL"'});
 assert.match(elm,/statusColor r =\n {4}severityColor \(severity r \(status r\)\)\n/);
 assert.match(elm,/if r\.hull < 45 then\s+"var\(--red\)"\s+else\s+"var\(--green\)"/);
 assert.match(elm,/if sub\.condition < 60 then\s+"damaged"/);
 assert.match(elm,/if r\.cavitation > 0\.05 then\s+" · CAVITATING"/);
});

test('the status line and its dot are red for bad news, gold for lesser damage and green when clear',()=>{
 const body=elm.match(/\nseverity r s =\n {4}case s of\n([\s\S]*?)\n\n\nseverityColor/)[1];
 const arms=Object.fromEntries([...body.matchAll(/^ {8}(\w+) ->\n {12}(Alarm|Caution|Clear)$/gm)].map(m=>[m[1],m[2]]));
 assert.deepEqual(arms,{FuelFire:'Alarm',FuelLeak:'Alarm',Flooding:'Alarm',PressureHullDamaged:'Alarm',OuterHullDamaged:'Caution',SubsystemDamage:'Caution',Nominal:'Clear'});
 assert.match(body,/ {8}Repairing ->\n {12}let\n {16}underlying : Reading\n {16}underlying =\n {20}\{ r \| repair = 0 \}\n {12}in\n {12}case severity underlying \(status underlying\) of\n {16}Clear ->\n {20}Caution\n\n {16}worst ->\n {20}worst$/,
  'damage control takes the color of the worst fault it is working on, and gold once only the work remains');
 const colors=Object.fromEntries([...elm.matchAll(/^ {8}(Alarm|Caution|Clear) ->\n {12}"(var\(--\w+\))"$/gm)].map(m=>[m[1],m[2]]));
 assert.deepEqual(colors,{Alarm:'var(--red)',Caution:'var(--gold)',Clear:'var(--green)'});
});

test('the status line keeps its dot, drawn in the status color, in every state',async()=>{
 const css=await read('src/style.css');
 assert.match(elm,/span \[ id "system-status", style "color" \(statusColor r\) \] \[ i \[\] \[\], text \(" " \+\+ statusText r \(status r\)\) \]/);
 assert.match(elm,/span \[ id "system-status" \] \[ i \[\] \[\], text " ALL SYSTEMS NOMINAL" \]/);
 const dot=css.match(/\.systems i\{([^}]*)\}/)[1];
 assert.match(dot,/width:4px;height:4px;background:currentColor;border-radius:50%/);
});
