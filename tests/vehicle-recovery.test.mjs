import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,deployDrone,recallDrone,save,restore} from '../src/sim.js';
import {feedActive} from '../src/controls.js';
import {fireDeckGun} from '../src/combat.js';

// Independent acceptance oracles: compass arithmetic, elapsed simulation time,
// Euclidean travel, and conservation of the healthy fixture's initial integrity.
// Do not derive expected results from the production recovery/collision helpers.
const DT=.25, KNOT=.514444, MAX_RETURN_TIME=180;
const rad=degrees=>degrees*Math.PI/180;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.depth-b.depth);
const position=body=>({x:body.x,y:body.y,depth:body.depth});
const integrity=s=>({hull:s.hull,systems:structuredClone(s.systems),drone:Object.fromEntries(['hull','mobility','buoyancy','camera'].map(k=>[k,s.drone[k]]))});
const frames=[{heading:0,x:0,y:0},{heading:91,x:80,y:-60},{heading:217,x:-70,y:90}];
const directions={ahead:[0,1],astern:[0,-1],port:[-1,0],starboard:[1,0]};

function ocean({depth=80,speed=0,heading=0,x=0,y=0,seed=31}={}){
 const s=createGame('recon',seed);
 Object.assign(s,{x,y,depth,targetDepth:depth,speed,targetSpeed:speed>0?speed*17/16:speed,heading,targetHeading:heading,verticalSpeed:0,pitch:0,scope:false,route:null,site:null,operation:null,ships:[],contacts:[],aircraft:[]});
 return s;
}
function launch(s,direction='port',range=60){
 assert.equal(deployDrone(s),true,'a healthy slow boat must allow deployment');
 const [right,forward]=directions[direction],a=rad(s.heading);
 Object.assign(s.drone,{
  x:s.x+range*(right*Math.cos(a)+forward*Math.sin(a)),
  y:s.y+range*(-right*Math.sin(a)+forward*Math.cos(a)),
  depth:s.depth,targetDepth:s.depth,heading:(s.heading+137)%360,
  targetHeading:(s.heading+137)%360,speed:0,targetSpeed:0,
 });
 assert.ok(distance(s,s.drone)<=65.000001,'fixture starts within the finite recovery contract');
 assert.ok(distance(s,s.drone)<100,'fixture starts inside the physical control link');
 return s;
}
function startReturn(s){
 const boat={x:s.x,y:s.y,depth:s.depth,heading:s.heading,speed:s.speed,targetDepth:s.targetDepth,targetHeading:s.targetHeading,targetSpeed:s.targetSpeed};
 recallDrone(s);
 assert.equal(s.drone.mode,'return','recall must engage return before motion');
 assert.deepEqual({x:s.x,y:s.y,depth:s.depth,heading:s.heading,speed:s.speed,targetDepth:s.targetDepth,targetHeading:s.targetHeading,targetSpeed:s.targetSpeed},boat,'recall must preserve the boat and your helm orders');
}
function advanceReturn(s,{limit=MAX_RETURN_TIME,expectedIntegrity=integrity(s),onStep=()=>{}}={}){
 let elapsed=0,travel=0;
 const battery=s.drone.battery,boatSpeed=s.speed,orders={targetSpeed:s.targetSpeed,targetDepth:s.targetDepth,targetHeading:s.targetHeading};
 while(s.drone.mode!=='stowed'&&elapsed<limit){
  assert.equal(s.status,'patrol','isolated healthy recovery must remain a live patrol');
  assert.notEqual(s.drone.mode,'lost','return must preserve the control link and battery');
  const previous=position(s.drone),boatBefore=position(s),lastRange=distance(s,s.drone);
  step(s,DT);elapsed+=DT;
  assert.deepEqual({targetSpeed:s.targetSpeed,targetDepth:s.targetDepth,targetHeading:s.targetHeading},orders,'recovery must preserve your live helm orders');
  assert.ok(Math.abs(s.speed-boatSpeed)<1e-8,'return must not slow or freeze a healthy boat to make pickup possible');
  if(Math.abs(boatSpeed)>0)assert.ok(Math.hypot(s.x-boatBefore.x,s.y-boatBefore.y)>=Math.abs(boatSpeed)*KNOT*DT*.8,'an underway boat must continue physically moving');
  assert.deepEqual(integrity(s),expectedIntegrity,'the approach must not damage either vehicle or its systems');
  assert.ok(Number.isFinite(s.drone.battery)&&s.drone.battery>=0&&s.drone.battery<=100,'battery stays finite and bounded');
  assert.ok(Number.isFinite(s.drone.speed)&&Math.abs(s.drone.speed)<=10+1e-9,'return obeys the physical 10 knot limit');
  for(const v of [s.x,s.y,s.depth,s.drone.x,s.drone.y,s.drone.depth])assert.ok(Number.isFinite(v),'motion must remain finite');
  const moved=distance(previous,s.drone);
  if(s.drone.mode==='stowed'){
   // Stowing may attach coordinates to the boat. The preceding sample must
   // already be close enough to be a physical pickup, never a long-range snap.
   assert.ok(lastRange<=15,`stowed from ${lastRange.toFixed(2)} m away`);
  }else{
   assert.ok(moved<=(10*KNOT+1.5)*DT+.02,`ROV moved ${moved.toFixed(2)} m in ${DT} s`);
   assert.ok(distance(s,s.drone)<100,'the complete return path must remain linked');
  }
  travel+=moved;onStep(s,elapsed);
 }
 assert.equal(s.drone.mode,'stowed',`return must converge within ${limit}s, not orbit indefinitely; final range ${distance(s,s.drone).toFixed(2)}m`);
 assert.ok(elapsed>0,'recovery must consume simulated travel time');
 assert.ok(s.drone.battery<battery,'deployed recovery must consume finite onboard energy');
 return {elapsed,travel};
}

for(const depth of [0,12,80,180])for(const speed of [0,3])for(const direction of Object.keys(directions)){
 test(`healthy ROV recovers from ${direction} at ${depth} m and ${speed} kn across rotated and translated frames`,()=>{
  for(const [i,frame] of frames.entries()){
   const s=launch(ocean({depth,speed,...frame,seed:31+i}),direction,60+i*2.5);
   const initial=integrity(s);startReturn(s);
   advanceReturn(s,{expectedIntegrity:initial});
  }
 });
}

test('return continues while the slow boat obeys a new helm heading',()=>{
 for(const depth of [0,80,180])for(const direction of ['ahead','astern','port','starboard']){
  const s=launch(ocean({depth,speed:3,heading:35,seed:72}),direction,65),initial=integrity(s),oldHeading=s.heading;
  startReturn(s);s.targetHeading=125;
  const {elapsed}=advanceReturn(s,{expectedIntegrity:initial});
  assert.ok(elapsed<=MAX_RETURN_TIME);
  assert.ok(Math.abs(s.heading-oldHeading)>20,'boat must actually turn during recovery');
  assert.equal(s.targetHeading,125,'return must preserve your helm order');
  assert.equal(s.targetSpeed,3*17/16,'return must preserve the throttle holding three knots');
 }
});

test('recovery stays deterministic across save/restore and equivalent step batching',()=>{
 const original=launch(ocean({depth:80,speed:3,heading:217,x:-70,y:90,seed:49}),'ahead',65);
 startReturn(original);
 for(let t=0;t<4;t+=DT)step(original,DT);
 assert.equal(original.drone.mode,'return','the save sample must be mid-approach');
 const restored=restore(save(original));assert.ok(restored);
 assert.deepEqual(restored,original,'save must retain the complete recovery state');
 const batched=structuredClone(original);
 step(batched,1);for(let i=0;i<4;i++)step(original,DT);
 assert.deepEqual(batched,original,'one-second calls must preserve bounded integration outcomes');
 for(let i=0;i<4;i++)step(restored,DT);
 assert.deepEqual(restored,original,'restoration must not reset the recovery phase or route');
 const a=advanceReturn(original),b=advanceReturn(restored);
 assert.equal(b.elapsed,a.elapsed);assert.deepEqual(restored,original,'restored and uninterrupted returns must finish identically');
});

test('return mode cannot replace physical motion with an instant pickup',()=>{
 const s=launch(ocean({depth:80,speed:0,seed:19}),'astern',65),before=position(s.drone);
 startReturn(s);step(s,DT);
 assert.equal(s.drone.mode,'return','a ROV 65 m away cannot stow in a quarter second');
 assert.ok(distance(before,s.drone)<=(10*KNOT+1.5)*DT+.02,'recall must obey the same finite motion limit');
 assert.ok(distance(s,s.drone)>60,'the approach cannot snap straight to the hull');
});

test('manual control still collides with the boat instead of inheriting return immunity',()=>{
 const s=ocean({depth:80});assert.ok(deployDrone(s));
 Object.assign(s.drone,{x:s.x+7,y:s.y,depth:s.depth,targetDepth:s.depth,heading:270,targetHeading:270,speed:10,targetSpeed:10});
 for(let t=0;t<2;t+=DT)step(s,DT);
 assert.equal(s.drone.mode,'remote');
 assert.ok(s.drone.hull<100,'a commanded hull crossing must cause a real impact');
 assert.ok(s.drone.x>s.x+5,'the pressure hull must stop a starboard-to-port crossing');
});

test('condition-aware global ROV status uses three-dimensional range and available closing speed',async()=>{
 const {droneStatus}=await import('../src/vehicle-status.js');
 assert.equal(typeof droneStatus,'function');
 for(const mode of ['remote','return'])for(const [mobility,expectedSpeed] of [[0,0],[10,0],[19.99,0],[20,2],[50,5],[100,10]]){
  const s=launch(ocean({depth:80}),'port');
  Object.assign(s.drone,{mode,mobility,x:s.x+30,y:s.y+40,depth:s.depth+12});
  for(const speed of [-10,-3,0,3,expectedSpeed,expectedSpeed+.01]){
   s.speed=s.targetSpeed=speed;
   const snapshot=structuredClone(s),status=droneStatus(s);
   assert.equal(status.deployed,true);
   assert.ok(Math.abs(status.distance-Math.hypot(30,40,12))<1e-9,'range must include vertical separation');
   assert.ok(Math.abs(status.returnSpeed-expectedSpeed)<1e-9,`mobility ${mobility} limits return speed`);
   assert.equal(status.outrunning,Math.abs(speed)>=expectedSpeed,'equal speed cannot close from astern');
   assert.equal(status.canRecover,Math.abs(speed)<=3,'pickup eligibility uses signed speed magnitude');
   assert.equal(typeof status.warning,'string');
   if(status.outrunning||!status.canRecover)assert.ok(status.warning.length>0,'an unsafe return margin needs an actionable global warning');
   assert.deepEqual(s,snapshot,'status queries must not alter simulation state');
   for(const view of ['scope','sonar','chart','tower','gun','drone'])assert.deepEqual(droneStatus({...s,view}),status,`status must remain available in ${view} view`);
  }
 }
 const lost=launch(ocean(),'port');lost.drone.mode='lost';
 assert.equal(droneStatus(lost).canRecover,false,'a lost ROV cannot be recovered by the bay');
 const stowed=ocean();assert.equal(droneStatus(stowed).deployed,false);
});

test('surface eligibility, tower feed, gun feed, and gun command share inclusive one-meter threshold',async()=>{
 const {isSurfaced}=await import('../src/vehicle-status.js');
 assert.equal(typeof isSurfaced,'function');
 for(const depth of [0,.05,.1,.5,1,1.01,12]){
  const s=ocean({depth}),eligible=depth<=1,ammo=s.gun.ammo;
  assert.equal(isSurfaced(s),eligible,`surface predicate at ${depth} m`);
  assert.equal(feedActive(s,'tower'),eligible,`tower feed at ${depth} m`);
  assert.equal(feedActive(s,'gun'),eligible,`gun feed at ${depth} m`);
  assert.equal(fireDeckGun(s,{bearing:90,elevation:10}),eligible,`gun action at ${depth} m`);
  assert.equal(s.gun.ammo,ammo-(eligible?1:0),'eligibility must agree with accepted ammunition expenditure');
 }
});
