import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,save,restore,bearing} from '../src/sim.js';
import {convoyLosses} from '../src/convoy-watch.js';
import {copyLamp,copyPercent,dotSeconds,lampLit,lampRange,makeTransmission,matchingBearing,morseScript} from '../src/signal-lamp.js';
import {patrolNotices} from '../src/ui.js';
import {objectiveState} from '../src/mission-panel.js';

const patrol=()=>createGame('wolf-in-the-henhouse',47,{timeOfDay:'day',weather:'clear',changing:false,difficulty:{airSupport:false,instantReplay:false}});
test('lamp flashes the International Morse timing for SOS and leaves a seven-dot repeat gap',()=>{
 const m={estimate:{text:'SOS'},elapsed:0};
 const expected='1010100011101110111000101010000000';
 for(let i=0;i<expected.length*2;i++){
  m.elapsed=(i+.5)*dotSeconds;assert.equal(lampLit(m),expected[i%expected.length]==='1','dot '+i);
 }
 assert.equal(morseScript('E E').letters[1].start,8);
 assert.equal(morseScript('2').marks.map(v=>v.end-v.start).join(''),'11333');
});

test('a look during a dash earns no letter, while complete letters on different repeats accumulate',()=>{
 const message=makeTransmission({id:'wren',name:'Wren',x:0,y:0},{x:1000,y:0},47,1,0);
 message.estimate.text='ET';// E at 0–1, T at 4–7; the next repeat starts at 14.
 const watch=(units,seen)=>copyLamp(message,units*dotSeconds,seen);
 watch(4.5,false);watch(2.5,true);assert.equal(copyPercent(message),0);
 watch(7,false);watch(1,true);assert.equal(copyPercent(message),50);
 watch(3,false);assert.equal(watch(3,true),true);assert.equal(copyPercent(message),100);
 assert.equal(watch(30,true),false);
});

test('hail requires surfacing, a partial copy survives interruption and restore, and only the finished report is plotted',()=>{
 let s=patrol();const wreck=s.ships.find(v=>v.id==='plover');assert.ok(wreck.settled&&wreck.sinkDepth>0&&wreck.wreckMark.observed);assert.equal(convoyLosses(s),0);
 s.depth=s.targetDepth=5;step(s,1,{observation:'scope',lampInView:'wren'});assert.equal(s.convoy.message,null);
 s.depth=s.targetDepth=0;step(s,.25);const id=s.convoy.message.estimate.sender,ship=s.ships.find(v=>v.id===id);
 const see=view=>({observation:view,lampInView:id,look:bearing(s,ship)});
 assert.match(s.reports.find(r=>r.id==='convoy-hail').text,/within 2\.3 km/);
 for(const view of ['gun','chart','drone','orbit'])step(s,.5,see(view));
 step(s,2,{...see('tower'),lampInView:'some-other-ship'});assert.equal(copyPercent(s.convoy.message),0);
 step(s,5,see('tower'));const copied=copyPercent(s.convoy.message);assert.ok(copied>0&&copied<100);assert.equal(s.convoy.pin,null);
 s=restore(save(s));assert.ok(s);step(s,5);assert.equal(copyPercent(s.convoy.message),copied);
 s.scope=false;step(s,2,see('scope'));assert.equal(copyPercent(s.convoy.message),copied);
 s.scope=true;s.depth=s.targetDepth=5;step(s,32,see('scope'));assert.equal(copyPercent(s.convoy.message),100);
 const p=s.convoy.pin;assert.ok(p.radius>=800);assert.equal(p.sender,id);assert.ok(s.pingAge>999);
 assert.ok(s.events.some(e=>e.text.includes('TELEGRAM')));assert.deepEqual(restore(save(s)).convoy,s.convoy);
 assert.ok(patrolNotices(s,true,false,'scope').some(v=>v.text.includes('TELEGRAM')));
 step(s,60);step(s,10);assert.equal(s.convoy.number,2);assert.equal(s.convoy.message.copied,0);assert.deepEqual(s.convoy.pin,p);
 s.convoy.message.copied=-1;assert.equal(restore(save(s)),null);
});
test('a coded area associates only one fresh plausible observed contact, and never changes its fix',()=>{
 const p={x:4000,y:0,time:20,radius:850},origin={x:0,y:0};
 const obs={id:'alpha',identified:false,passiveX:0,passiveY:0,passiveBearing:83,passiveAt:19};
 assert.equal(matchingBearing(p,origin,22,[obs]),'alpha');
 assert.equal(matchingBearing(p,{x:4000,y:4000},22,[obs]),'alpha');
 assert.equal(matchingBearing(p,origin,22,[obs,{...obs,id:'bravo',passiveBearing:100}]),undefined);
 assert.equal(matchingBearing(p,origin,22,[obs,{...obs,id:'bravo',identified:true,kind:'merchant'}]),'alpha');
 assert.equal(matchingBearing(p,origin,22,[{...obs,side:'friendly'}]),undefined);
 assert.equal(matchingBearing(p,origin,22,[{...obs,passiveBearing:270}]),undefined);
 assert.equal(matchingBearing(p,origin,40,[obs]),undefined);
 assert.equal(obs.fix,undefined);
});
test('fog and storm reduce optical range, while twilight and darkness help',()=>{
 const clear={daylight:1,twilight:0,fog:0,rain:0,storm:0},day=lampRange(clear);
 const fog=lampRange({...clear,fog:.85}),storm=lampRange({...clear,rain:1,storm:1});
 assert.ok(fog<storm&&storm<day);
 const dusk=lampRange({...clear,twilight:1,daylight:.5}),night=lampRange({...clear,daylight:0});
 assert.ok(day<dusk&&dusk<night);assert.ok(lampRange({...clear,daylight:0,fog:.85})<night);
});
test('an optional signal ship can be replaced, the convoy keeps fighting, and the patrol ends without extraction',()=>{
 let s=patrol();step(s,.25);const sender=s.convoy.message.estimate.sender;
 s.ships.find(v=>v.id===sender).hull=0;step(s,.25);assert.equal(s.status,'patrol');assert.notEqual(s.convoy.message.estimate.sender,sender);
 s.convoy.next=s.time;step(s,.25);assert.ok(s.convoy.shot);assert.ok(s.blasts.some(b=>b.convoyCharge));assert.deepEqual(restore(save(s)).convoy.shot,s.convoy.shot);
 s.ships.find(v=>v.id===s.convoy.message.estimate.sender).hull=0;step(s,.25);
 assert.equal(s.status,'convoy-lost');assert.equal(restore(save(s)).status,'convoy-lost');
 s=patrol();s.ships.find(v=>v.id==='wolf').hull=0;step(s,.25);assert.equal(s.status,'won');assert.equal(s.phase,'objective');assert.ok(restore(save(s)));
});
test('a lost survey ROV leaves the automatic scan instructions and its cumulative counter available',()=>{
 const s=createGame('survey');s.drone.mode='lost';s.operation.scan=13;
 const o=objectiveState(s);assert.equal(o.progress,'13/45');assert.match(o.advice,/ROV lost.*automatically.*0\.5–3 kn.*32 m/);
 assert.doesNotMatch(o.text,/camera/);
});
