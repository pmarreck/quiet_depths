import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,getSoundings,restore,save,step} from '../src/sim.js';
import {patrolNotices} from '../src/ui.js';
import {batteryWarning,bottomCall,batteryCall} from '../src/watch-warnings.js';

const ids=s=>patrolNotices(s,false,false,'drone').map(n=>n.id);
const entries=(s,text)=>s.events.filter(e=>e.text===text).length;
function patrol(){
 const s=createGame('survey',3);
 Object.assign(s,{x:0,y:0,ships:[],depth:5,targetDepth:5,speed:0,targetSpeed:0,verticalSpeed:0,pitch:0});
 return s;
}
function setClearance(s,clearance){s.depth=s.targetDepth=getSoundings(s).waterDepth-5-clearance;}

test('the bottom watch measures space under the sub, follows station changes and reports each descent once',()=>{
 const s=patrol();s.drone.depth=0;
 setClearance(s,20);step(s,.25);assert.equal(getSoundings(s).belowKeel,20);assert.ok(!ids(s).includes('bottom-clearance'));
 setClearance(s,19);step(s,3);assert.ok(ids(s).includes('bottom-clearance'));assert.equal(entries(s,bottomCall),1);
 const resumed=restore(save(s));step(resumed,2);assert.equal(entries(resumed,bottomCall),1);
 setClearance(resumed,21);step(resumed,.25);assert.ok(!ids(resumed).includes('bottom-clearance'));
 setClearance(resumed,19);step(resumed,.25);assert.equal(entries(resumed,bottomCall),2);
});

test('battery warnings escalate once, survive restore and rearm on recharge, independently of bottom clearance',()=>{
 assert.equal(batteryWarning(20),0);assert.equal(batteryWarning(10),1);assert.equal(batteryWarning(10,2),2);assert.equal(batteryWarning(10.001,2),1);
 const s=patrol();s.battery=20.0005;
 step(s,.25);assert.equal(s.watchWarnings.battery,1);assert.equal(entries(s,batteryCall(1)),1);assert.ok(ids(s).includes('battery-reserve'));
 s.battery=10.0005;setClearance(s,16);step(s,.25);assert.equal(s.watchWarnings.battery,2);assert.equal(entries(s,batteryCall(2)),1);
 const notes=patrolNotices(s,false,false,'chart');assert.ok(notes.find(n=>n.id==='battery-reserve').critical);assert.ok(notes.some(n=>n.id==='bottom-clearance'));
 s.battery=10;const r=restore(save(s));assert.equal(r.watchWarnings.battery,2);
 step(r,2);assert.equal(entries(r,batteryCall(2)),1);assert.equal(entries(r,batteryCall(1)),1);
 r.depth=r.targetDepth=0;r.engine='diesel';step(r,2);assert.equal(r.watchWarnings.battery,1);assert.equal(entries(r,batteryCall(1)),1);
 r.battery=19.99;step(r,1);assert.equal(r.watchWarnings.battery,0);assert.ok(!ids(r).includes('battery-reserve'));
 r.engine='electric';r.battery=19.8;step(r,1);assert.equal(entries(r,batteryCall(1)),2);
});

test('older saves show existing hazards immediately, while malformed watch state is rejected',()=>{
 const s=patrol();s.battery=7;setClearance(s,10);delete s.watchWarnings;
 const r=restore(save(s));assert.deepEqual(r.watchWarnings,{battery:2,bottom:true});
 assert.ok(ids(r).includes('bottom-clearance'));assert.ok(ids(r).includes('battery-reserve'));
 r.watchWarnings.battery=7;assert.equal(restore(save(r)),null);
});
