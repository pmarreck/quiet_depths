import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,save,restore,step,contact,fire} from '../src/sim.js';
import {patrolKills} from '../src/service-record.js';

const carrier=s=>s.ships.find(v=>v.kind==='carrier');
function stage(damage=0,airSupport=false,seed=1){
 const s=createGame('big-kahuna',seed,{difficulty:{damage,airSupport},weather:'clear',timeOfDay:'day',changing:false});
 const v=carrier(s);assert.ok(v,'briefed carrier must exist');
 // A stationary, isolated encounter exercises the normal hit and ship update paths.
 Object.assign(s,{x:0,y:0,speed:0,targetSpeed:0,heading:0,targetHeading:0,depth:9,targetDepth:9,scope:false});
 Object.assign(v,{x:0,y:500,speed:0,heading:0});
 s.ships.filter(ship=>ship!==v).forEach((ship,i)=>Object.assign(ship,{x:8000+i*500,y:8000,speed:0}));
 return s;
}
function shoot(s,n=1){
 const v=carrier(s);contact(s,v,'active');
 for(let i=0;i<n;i++)assert.ok(fire(s,v.id));
}
function until(s,predicate,limit){
 for(let i=0;i<limit*4&&!predicate();i++)step(s,.25);
 assert.ok(predicate(),'expected patrol event within '+limit+' s');
}

test('Big Kahuna seeds a reproducible unsuspecting fleet, with no automatic air launch',()=>{
 const counts=new Set(),wings=new Set();
 for(let seed=0;seed<32;seed++){
  const s=createGame('big-kahuna',seed);assert.equal(s.mission,'big-kahuna');assert.equal(s.phase,'objective');
  assert.deepEqual(restore(save(s)),s);assert.deepEqual(createGame('big-kahuna',seed),s);
  assert.equal(s.ships.filter(v=>v.kind==='carrier').length,1);
  counts.add(s.ships.filter(v=>v.kind==='escort').length);wings.add(carrier(s).fighterCount);
  assert.ok(s.ships.every(v=>v.military&&v.alert===0&&!v.report));assert.equal(s.contacts.length,0);
  Object.assign(s,{depth:30,targetDepth:30,speed:0,targetSpeed:0,scope:false});
  step(s,10);assert.equal(s.airSupport.status,'idle');assert.equal(s.aircraft.length,0);
 }
 assert.deepEqual([...counts].sort(),[2,3]);assert.deepEqual([...wings].sort(),[1,2,3]);
});

test('one direct hit never sinks Solstice, even with flooding, on every damage setting',()=>{
 for(const difficulty of [-1,0,1]){
  const s=stage(difficulty),v=carrier(s);shoot(s);until(s,()=>v.directHits===1,40);
  v.flood=99;for(let i=0;i<3;i++)step(s,60);
  assert.ok(v.hull>0);assert.equal(s.phase,'objective');assert.equal(s.airSupport.status,'idle');
  const forged=structuredClone(s);carrier(forged).hull=0;assert.equal(restore(save(forged)),null);
  assert.equal(restore(save({...s,phase:'extract'})),null);
  const bad=structuredClone(s);carrier(bad).directHits=-1;assert.equal(restore(save(bad)),null);
 }
});

test('two hits sink the carrier over time, a third speeds it up, and pickup requires a live surfaced boat',()=>{
 const original=stage();shoot(original);until(original,()=>carrier(original).directHits===1&&original.time>=20,40);
 const two=restore(save(original)),three=restore(save(original));
 shoot(two);shoot(three,2);
 until(two,()=>carrier(two).directHits===2,40);until(three,()=>carrier(three).directHits===3,40);
 for(const state of [two,three]){assert.equal(state.phase,'objective');assert.ok(carrier(state).hull>0);assert.deepEqual(restore(save(state)),state);}
 until(three,()=>carrier(three).hull===0,45);until(two,()=>carrier(two).hull===0,60);
 assert.ok(three.time+10<two.time);assert.equal(two.phase,'extract');assert.equal(two.status,'patrol');
 assert.deepEqual(patrolKills(two),{ships:1,submarines:0});
 const s=restore(save(two));Object.assign(s,{x:s.home.x,y:s.home.y});step(s,.25);assert.equal(s.status,'patrol');
 s.depth=s.targetDepth=0;step(s,.25);assert.equal(s.status,'won');
 assert.ok(s.debrief.some(entry=>entry.text.includes('Solstice began sinking')));
});

test('deck fighters respond to a carrier alarm within seconds and search the reported incident',()=>{
 let s;
 for(let seed=0;seed<30;seed++){s=stage(0,true,seed);if(carrier(s).fighterCount===3)break;}
 const v=carrier(s);shoot(s);until(s,()=>v.directHits===1,40);
 assert.equal(s.airSupport.status,'arming');assert.deepEqual([s.airSupport.lastKnown.x,s.airSupport.lastKnown.y],[v.x,v.y]);
 const alarmAt=s.time;const resumed=restore(save(s)),deck=carrier(resumed);assert.equal(resumed.airSupport.status,'arming');
 resumed.depth=resumed.targetDepth=45;resumed.scope=false;
 until(resumed,()=>resumed.aircraft.length>0,4);
 assert.ok(resumed.time-alarmAt<=3);assert.equal(resumed.aircraft.length,3);
 assert.ok(resumed.aircraft.every(p=>p.name.includes('Carrier fighter')&&Math.hypot(p.x-deck.x,p.y-deck.y)<100));
 assert.deepEqual(restore(save(resumed)),resumed);
 step(resumed,8);assert.ok(resumed.aircraft.every(p=>!p.bombDropped),'an impact alone does not identify a submarine position');
 const detected=stage(0,true);const escort=detected.ships[1];
 Object.assign(escort,{alert:90,report:{x:321,y:432,depth:45,speed:0,heading:0,time:0}});
 until(detected,()=>detected.aircraft.length>0,4);assert.equal(carrier(detected).directHits,0);
});

test('a hull collision and a near miss cannot bypass the direct-hit requirement',()=>{
 const s=stage(1),v=carrier(s);
 Object.assign(v,{x:s.x,y:s.y+55,hull:2});
 step(s,.25);assert.ok(v.hull>0&&v.hull<2);assert.equal(v.directHits,0);assert.equal(s.phase,'objective');
 const miss=stage(),ship=carrier(miss);contact(miss,ship,'active');assert.ok(fire(miss,ship.id));
 ship.x+=3000;miss.projectiles[0].runLimit=120;
 until(miss,()=>!miss.projectiles.length,15);assert.equal(ship.directHits,0);assert.equal(ship.hull,100);
});

test('the carrier has a long overhanging deck, an offset bridge, and visible fighters',async()=>{
 const T=await import('../vendor/three.module.js');
 const {makeCarrier}=await import('../src/carrier-model.js');
 const model=makeCarrier(T);model.updateMatrixWorld(true);
 const deck=model.getObjectByName('flight deck');
 assert.ok(deck);
 const deckBox=new T.Box3().setFromObject(deck),hullBox=new T.Box3().setFromObject(model.userData.hull);
 assert.ok(deckBox.max.z-deckBox.min.z>200&&deckBox.min.x<hullBox.min.x-10);
 const bridge=model.userData.body.children.filter(m=>m.position.y>29);
 assert.ok(bridge.length>=3&&bridge.every(m=>m.position.x>0));
 assert.equal(model.userData.parked.children.length,3);
 for(const jet of model.userData.parked.children){
  const size=new T.Box3().setFromObject(jet).getSize(new T.Vector3());
  assert.ok(size.x>9&&size.z>10);assert.ok(jet.position.y>deckBox.max.y);
 }
});
