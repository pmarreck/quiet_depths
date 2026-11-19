import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,contact,fire,save,restore} from '../src/sim.js';
import {fireDeckGun} from '../src/combat.js';

// These acceptance cases derive from the combat contract. Geometry uses compass
// bearings directly, independently of the production bearing/collision helpers.
const radians=degrees=>degrees*Math.PI/180;
const separation=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function ocean(mission='recon',seed=31){
 const s=createGame(mission,seed);
 Object.assign(s,{x:0,y:0,heading:0,targetHeading:0,speed:0,targetSpeed:0,depth:0,targetDepth:0,verticalSpeed:0,scope:false,site:null,operation:null,ships:[],contacts:[]});
 return s;
}
function vessel(id,x,y,extra={}){
 return {id,name:id,kind:'merchant',military:true,x,y,heading:0,speed:0,hull:100,alert:0,attack:999,noise:100,...extra};
}
function plane(id,x,y,altitude,extra={}){
 return {id,name:id,x,y,altitude,heading:0,speed:0,hull:100,phase:'approach',attack:999,bank:0,...extra};
}
function readyGun(s){
 for(let elapsed=0;s.gun.cooldown>0&&elapsed<60;elapsed+=.25)step(s,.25);
 assert.ok(s.gun.cooldown<=0,'a successful shot must have a finite cooldown');
}
function advanceUntil(s,predicate,limit=30){
 for(let elapsed=0;elapsed<limit&&!predicate();elapsed+=.25)step(s,.25);
 assert.ok(predicate(),`condition did not occur within ${limit} simulated seconds`);
}
function liveTorpedo(s){
 assert.ok(s.projectiles.length>0,'fixture requires an in-flight torpedo');
 return s.projectiles[0];
}

test('all six mission families start with torpedoes and explicit combat state',()=>{
 for(const mission of ['recon','shadow','intercept','survey','undersea-rescue','surface-rescue']){
  const s=createGame(mission,13);
  assert.ok(Number.isInteger(s.torps)&&s.torps>0,mission);
  assert.ok(Number.isInteger(s.gun.ammo)&&s.gun.ammo>0,mission);
  assert.equal(s.gun.shots,0);
  assert.equal(s.gun.cooldown,0);
  assert.deepEqual(s.gunRounds,[]);
  assert.deepEqual(s.aircraft,[]);
  assert.equal(s.airSupport.status,'idle');
  assert.equal(s.airSupport.requestedAt,null);
  assert.equal(s.airSupport.launchAt,null);
 }
});

test('gun availability gates conserve ammunition and accepted shots cost exactly one round',()=>{
 for(const mutation of [s=>s.depth=s.targetDepth=1.001,s=>s.status='won',s=>s.gun.ammo=0]){
  const s=ocean();mutation(s);
  const before={ammo:s.gun.ammo,shots:s.gun.shots,cooldown:s.gun.cooldown,rounds:structuredClone(s.gunRounds)};
  assert.equal(fireDeckGun(s,{bearing:0,elevation:0}),false);
  assert.deepEqual({ammo:s.gun.ammo,shots:s.gun.shots,cooldown:s.gun.cooldown,rounds:s.gunRounds},before);
 }
 const s=ocean();s.depth=s.targetDepth=.05;
 const ammunition=s.gun.ammo;
 assert.equal(fireDeckGun(s,{bearing:0,elevation:0}),true);
 assert.equal(s.gun.ammo,ammunition-1);
 assert.equal(s.gun.shots,1);
 assert.ok(Number.isFinite(s.gun.cooldown)&&s.gun.cooldown>0);
 assert.equal(fireDeckGun(s,{bearing:0,elevation:0}),false);
 assert.equal(s.gun.ammo,ammunition-1);
 assert.equal(s.gun.shots,1);
 readyGun(s);
 assert.equal(fireDeckGun(s,{bearing:0,elevation:0}),true);
 assert.equal(s.gun.ammo,ammunition-2);
 assert.equal(s.gun.shots,2);
});

test('every fifth player round is tracer and projectiles take time to move',()=>{
 const s=ocean();
 for(let number=1;number<=10;number++){
  readyGun(s);
  const count=s.gunRounds.length;
  assert.equal(fireDeckGun(s,{bearing:0,elevation:10}),true);
  assert.equal(s.gunRounds.length,count+1);
  const round=s.gunRounds.at(-1);
  assert.equal(round.owner,'player');
  assert.equal(round.tracer,number%5===0,`shot ${number}`);
  const origin={x:round.x,y:round.y};
  assert.ok(Number.isFinite(origin.x)&&Number.isFinite(origin.y));
  step(s,.25);
  assert.ok(separation(round,origin)>0,'a live round must travel during simulation time');
 }
});

test('absolute compass aim hits only the intersected ship across rotated scenarios',()=>{
 for(const bearing of [0,90,180,270]){
  const s=ocean(),angle=radians(bearing),range=300;
  // The mount is 16 m ahead of the stationary, north-facing submarine.
  const target=vessel('on-line',Math.sin(angle)*range,16+Math.cos(angle)*range);
  const miss=vessel('off-line',target.x+Math.cos(angle)*180,target.y-Math.sin(angle)*180);
  s.ships=[target,miss];
  assert.equal(fireDeckGun(s,{bearing,elevation:0}),true);
  assert.equal(target.hull,100,'firing must not apply instant damage');
  assert.equal(miss.hull,100);
  step(s,3);
  assert.ok(target.hull<100,`compass bearing ${bearing} must intersect the target`);
  assert.equal(miss.hull,100,`off-axis ship at bearing ${bearing} must remain unharmed`);
 }
});

test('elevation distinguishes a correct aircraft intercept from a shot below the aim line',()=>{
 const elevation=20,range=500,altitude=6+Math.tan(radians(elevation))*(range-16);
 const aimed=ocean(),below=structuredClone(aimed);
 for(const s of [aimed,below]){
  s.airSupport.status='airborne';s.airSupport.lastKnown=null;
  s.aircraft=[plane('geometry-target',0,range,altitude)];
 }
 assert.equal(fireDeckGun(aimed,{bearing:0,elevation}),true);
 assert.equal(fireDeckGun(below,{bearing:0,elevation:0}),true);
 assert.equal(aimed.aircraft[0].hull,100,'elevated fire must also have flight time');
 const hitPlane=aimed.aircraft[0],missPlane=below.aircraft[0];
 step(aimed,3);step(below,3);
 assert.ok(hitPlane.hull<100,'the physical elevated line must hit the aircraft');
 assert.equal(missPlane.hull,100,'a level shot must pass below the aircraft');
});

test('a waterline hit causes flooding and its damage continues after the round is gone',()=>{
 const s=ocean(),ship=vessel('flooding-target',0,300);
 s.ships=[ship];
 // Aim at 2 m above mean sea level rather than relying on a renderer silhouette.
 const elevation=Math.atan2(2-6,300-16)*180/Math.PI;
 assert.equal(fireDeckGun(s,{bearing:0,elevation}),true);
 advanceUntil(s,()=>ship.hull<100,5);
 assert.ok(ship.flood>0,'a penetrating waterline hit must open a flooding path');
 const hullAfterHit=ship.hull,shotsAfterHit=s.gun.shots,ammoAfterHit=s.gun.ammo;
 assert.ok(hullAfterHit>0,'this full-health target must remain available for a flooding interval');
 advanceUntil(s,()=>ship.hull<hullAfterHit,120);
 assert.ok(ship.hull<hullAfterHit,'flooding must cause subsequent damage without another shot');
 assert.equal(s.gun.shots,shotsAfterHit);
 assert.equal(s.gun.ammo,ammoAfterHit);
 // Several aimed hits establish a severe breach without prescribing a
 // one-round kill. Respect the actual cooldown and each round's flight time.
 for(let shot=1;shot<5&&ship.hull>0;shot++){
  readyGun(s);
  assert.equal(fireDeckGun(s,{bearing:0,elevation}),true);
  step(s,3);
 }
 step(s,60);step(s,60);
 assert.ok(ship.disabled||ship.hull===0,'repeated waterline hits and sustained flooding must disable or sink the target');
});

test('armed torpedo sonar steers using live returns rather than stale plotted contact coordinates',()=>{
 const left=ocean(),right=structuredClone(left);
 for(const s of [left,right]){
  s.depth=s.targetDepth=30;
  s.ships=[vessel('intended',0,1400)];
  contact(s,s.ships[0],'active');
  assert.equal(fire(s,'intended'),true);
  const torpedo=liveTorpedo(s);
  assert.equal(torpedo.intended,'intended');
  assert.equal(torpedo.lock,null,'a newly launched torpedo must complete its arming run first');
 }
 left.ships[0].x=-220;right.ships[0].x=220;
 const plottedLeft=left.contacts.find(c=>c.id==='intended').x;
 const plottedRight=right.contacts.find(c=>c.id==='intended').x;
 step(left,12);step(right,12);
 const a=liveTorpedo(left),b=liveTorpedo(right);
 assert.equal(a.lock,'intended');assert.equal(b.lock,'intended');
 assert.ok(a.x<0&&b.x>0,'mirrored true returns must produce mirrored steering');
 assert.equal(left.contacts.find(c=>c.id==='intended').x,plottedLeft);
 assert.equal(right.contacts.find(c=>c.id==='intended').x,plottedRight);
 for(const [s,t] of [[left,a],[right,b]]){
  assert.ok(Number.isFinite(t.depth)&&Number.isFinite(t.heading)&&t.age>0);
  assert.ok(t.path.length>=2);
  for(const sample of t.path)for(const field of ['x','y','depth','time'])assert.ok(Number.isFinite(sample[field]),field);
  assert.ok(separation(t.path[0],t.path.at(-1))>0,'wake samples must describe actual travel');
  assert.ok(Number.isFinite(t.pingAge));
  assert.ok(s.acoustics.some(e=>e.type==='seeker'),'own active seeker pulses must enter acoustic state');
 }
});

test('an armed torpedo can acquire an unplotted loud return after its intended target disappears',()=>{
 const s=ocean();s.depth=s.targetDepth=30;
 s.ships=[vessel('intended',0,1400)];
 contact(s,s.ships[0],'active');assert.equal(fire(s,'intended'),true);
 s.ships=[vessel('unplotted-return',100,1300,{noise:140})];
 assert.ok(!s.contacts.some(c=>c.id==='unplotted-return'));
 advanceUntil(s,()=>s.projectiles.some(t=>t.lock==='unplotted-return'),20);
 const torpedo=liveTorpedo(s);
 assert.equal(torpedo.intended,'intended','reacquisition must retain the originally chosen intent');
 assert.equal(torpedo.lock,'unplotted-return');
 assert.ok(s.acoustics.some(e=>e.type==='seeker'));
});

test('radio support prepares for at least 45 seconds then launches physically from its island base',()=>{
 const s=ocean();
 s.ships=[vessel('reporting-escort',800,0,{kind:'escort',alert:100})];
 step(s,.25);
 assert.equal(s.airSupport.status,'arming');
 assert.ok(Number.isFinite(s.airSupport.requestedAt));
 assert.ok(s.airSupport.launchAt-s.airSupport.requestedAt>=45);
 assert.equal(s.aircraft.length,0,'a radio request cannot materialize an aircraft');
 s.ships=[];
 const untilLaunch=s.airSupport.launchAt-s.time;
 if(untilLaunch>.25)step(s,untilLaunch-.25);
 assert.equal(s.aircraft.length,0,'the preparation interval must be simulated');
 advanceUntil(s,()=>s.aircraft.length>0,2);
 assert.equal(s.airSupport.status,'airborne');
 for(const aircraft of s.aircraft){
  assert.ok(separation(aircraft,s.airSupport.base)<=aircraft.speed*.5+10,'first observed aircraft must be at the base, within one integration step');
 }
 const origins=new Map(s.aircraft.map(a=>[a.id,{x:a.x,y:a.y}]));
 step(s,1);
 for(const aircraft of s.aircraft)assert.ok(separation(aircraft,origins.get(aircraft.id))>0,'a launched aircraft must travel across the world');
});

test('diving prevents surface strafing while the aircraft retains only the last reported position',()=>{
 const surface=ocean(),deep=structuredClone(surface);
 for(const s of [surface,deep]){
  s.airSupport.status='airborne';
  s.airSupport.lastKnown={x:0,y:0,time:s.time};
  s.aircraft=[plane('attack-run',0,-250,70,{speed:90,phase:'attack',attack:0})];
 }
 deep.depth=deep.targetDepth=60;deep.x=700;
 let surfacedStrafing=false,deepStrafing=false,deepBombing=false;
 const lastReport=structuredClone(deep.airSupport.lastKnown);
 for(let t=0;t<12;t+=.25){
  step(surface,.25);step(deep,.25);
  surfacedStrafing ||= surface.gunRounds.some(r=>r.owner==='aircraft');
  deepStrafing ||= deep.gunRounds.some(r=>r.owner==='aircraft');
  deepBombing ||= deep.blasts.some(b=>['bomb','charge'].includes(b.kind)&&!b.exploded&&b.delay>0&&Math.hypot(b.x-lastReport.x,b.y-lastReport.y)<300);
 }
 assert.ok(surfacedStrafing,'a visible surfaced target must be vulnerable to the attack run');
 assert.equal(deepStrafing,false,'deep water must prevent visual strafing acquisition');
 assert.deepEqual(deep.airSupport.lastKnown,lastReport,'aircraft must not refresh a submerged target through deep water');
 assert.ok(deepBombing,'an attack may still drop finite-fuse ordnance near the last reported position');
});

test('combat state round-trips exactly and pause/modal input cannot advance live weapons',()=>{
 const s=ocean();s.ships=[vessel('intended',0,1400)];
 contact(s,s.ships[0],'active');assert.equal(fire(s,'intended'),true);
 assert.equal(fireDeckGun(s,{bearing:90,elevation:15}),true);
 s.airSupport.status='arming';s.airSupport.requestedAt=s.time;s.airSupport.launchAt=s.time+60;
 s.airSupport.lastKnown={x:s.x,y:s.y,time:s.time};
 const restored=restore(save(s));
 assert.ok(restored);assert.deepEqual(restored,s);
 for(const input of [{paused:true},{modal:true}]){
  const frozen=structuredClone(restored),before=save(frozen);
  step(frozen,10,input);
  assert.equal(save(frozen),before,'simulation holds must include all new combat systems');
 }
});
