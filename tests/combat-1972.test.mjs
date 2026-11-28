import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,contact,fire,save,restore,ping,hurt,deployDrone} from '../src/sim.js';
import {fireDeckGun,updateCombat} from '../src/combat.js';
import {chartContacts,estimateAt} from '../src/track-estimates.js';
import {requestRecon} from '../src/recon.js';
import {patrolKills,saveServiceRecord,serviceRecord} from '../src/service-record.js';

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
 return {id,name:id,x,y,altitude,heading:0,speed:0,hull:100,phase:'approach',takeoffUntil:0,attack:999,bank:0,bombDropped:false,...extra};
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

test('all mission families start with torpedoes and explicit combat state',()=>{
 for(const mission of ['recon','shadow','intercept','seek-and-destroy','survey','undersea-rescue','surface-rescue']){
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

test('an enemy tube launches a moving underwater object from the hunter, using its last report',()=>{
 const s=ocean();s.depth=s.targetDepth=60;s.difficulty.airSupport=false;
 const hunter=vessel('hunter',0,550,{kind:'sub',depth:60,heading:180,alert:95,attack:0,
  report:{x:0,y:0,depth:60,heading:0,speed:0,time:0,reason:'an active sonar ping'}});
 s.ships.push(hunter);step(s,.25);
 const p=liveTorpedo(s);
 assert.equal(p.owner,'enemy');assert.equal(p.launcher,hunter.id);assert.equal(s.blasts.length,0);
 assert.ok(p.path[0].y>510&&p.path[0].y<525&&Math.abs(p.path[0].depth-60)<2);
 assert.ok(p.y<p.path[0].y&&p.y>500);
 assert.equal(s.torps,6);
 const saved=restore(save(s));assert.deepEqual(saved,s);
 step(saved,10,{paused:true});assert.deepEqual(saved,s);
 // Move one player well away. Until collision, both shots must follow the
 // launch information and travel the same path regardless of player position.
 saved.x+=450;
 for(let i=0;i<32;i++){
  step(s,.25);step(saved,.25);assert.deepEqual(saved.projectiles[0],p);
 }
 assert.ok(p.path.length>8);
 assert.ok(s.acoustics.some(sound=>sound.type==='seeker'));
 saved.ships[0].attack=999;
 step(saved,24);
 assert.equal(saved.hull,100);assert.ok(saved.projectiles[0].searchAge>0);
});

test('incoming torpedoes strike only on intersection and hostile collateral leaves the patrol running',()=>{
 const setup=()=>{
  const s=ocean();s.depth=s.targetDepth=55;
  const hunter=vessel('hunter',0,350,{kind:'sub',depth:55,heading:180,alert:95,attack:0,
   report:{x:0,y:0,depth:55,heading:0,speed:0,time:0,reason:'an active sonar ping'}});
  s.ships=[hunter];step(s,.25);return s;
 };
 for(const victim of ['player','neutral']){
  const s=setup(),p=liveTorpedo(s);
  if(victim==='neutral')s.ships.push(vessel('bystander',0,120,{kind:'sub',depth:55,military:false}));
  else s.x=p.aim.x;
  advanceUntil(s,()=>s.impacts.some(impact=>impact.id===p.id),20);
  assert.equal(s.projectiles.length,0);assert.equal(s.impacts[0].kind,'torpedo');
  assert.ok(Math.abs(s.impacts[0].altitude+55)<4);
  if(victim==='player')assert.ok(s.hull<100);
  else{assert.equal(s.ships[1].hull,0);assert.equal(s.hull,100);assert.equal(s.status,'patrol');assert.deepEqual(patrolKills(s),{ships:0,submarines:0});}
 }
});

test('pre-update pending enemy attacks resume in the water while older player shots keep their ownership',()=>{
 const s=ocean();s.ships=[vessel('target',0,850)];
 contact(s,s.ships[0],'active');fire(s,'target');delete s.projectiles[0].owner;
 s.blasts.push({id:9,x:20,y:30,depth:48,delay:6,age:0,exploded:false,kind:'weapon'});
 const r=restore(save(s));
 assert.ok(r);assert.equal(r.blasts.length,0);
 assert.deepEqual(r.projectiles.map(p=>p.owner),['player','enemy']);
 const incoming=r.projectiles[1];assert.equal(incoming.depth,48);assert.ok(separation(incoming,incoming.aim)>100);
 assert.deepEqual(restore(save(r)),r);
 const y=incoming.y;step(r,.25);assert.ok(incoming.y>y);
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

test('torpedoes leave alternating bow tubes at boat depth and climb into a level surface run',()=>{
 const s=ocean();s.depth=s.targetDepth=96;
 const target=vessel('transport',0,900);s.ships=[target];
 contact(s,target,'active');assert.ok(fire(s,target.id));assert.ok(fire(s,target.id));
 const [port,starboard]=s.projectiles;
 assert.ok(port.x<0&&starboard.x>0);
 assert.ok(port.y>30&&starboard.y>30,'both launches begin at the bow');
 assert.equal(port.depth,starboard.depth);
 assert.ok(Math.abs(port.depth-s.depth)<1);
 assert.deepEqual(port.path[0],{x:port.x,y:port.y,depth:port.depth,time:0});
 step(s,15);
 assert.ok(port.depth<=5&&port.depth>=2,'the surface run is submerged and shallow');
 assert.equal(port.lock,target.id);
 for(let i=1;i<port.path.length;i++){
  const a=port.path[i-1],b=port.path[i];
  assert.ok(Math.abs(a.depth-b.depth)<=separation(a,b)+1e-8,'climb never exceeds 45 degrees');
  assert.ok(Math.hypot(separation(a,b),b.depth-a.depth)<=24*(b.time-a.time)+1e-8,'the climb respects the same speed limit');
 }
 advanceUntil(s,()=>target.hull===0,55);
 assert.equal(target.hull,0);
});

test('a seeker without a return widens its turns, searches either way, and runs out of range',()=>{
 const directions=new Set();
 for(const seed of [31,33]){
  const s=ocean('recon',seed);s.contacts=[{id:'missing',kind:'merchant',bearing:0}];
  assert.ok(fire(s,'missing'));const p=s.projectiles[0],turn=[];
  while(s.time<180&&s.projectiles.length){
   const old=p.heading;s.time+=.25;updateCombat(s,.25);
   if(p.searchAge>0&&s.projectiles.length)turn.push((p.heading-old+540)%360-180);
  }
  const sign=Math.sign(turn[0]);directions.add(sign);
  assert.ok(turn.every(value=>Math.sign(value)===sign));
  assert.ok(Math.abs(turn[0])>Math.abs(turn.at(-1)),'later arcs widen');
  assert.equal(s.projectiles.length,0);assert.equal(s.time,180);
 }
 assert.equal(directions.size,2);
});

test('enemy submarine decoys are finite and a confirmed diversion prevents instant recall for a later neutral lock',()=>{
 const s=ocean();s.depth=s.targetDepth=80;
 const hunter=vessel('hunter',0,550,{kind:'sub',depth:80});
 s.ships=[hunter];
 contact(s,hunter,'active');assert.ok(fire(s,hunter.id));const shot=s.projectiles[0];
 // This seed releases a decoy that the first shot follows and passes.
 advanceUntil(s,()=>shot.diverted,24);
 assert.equal(shot.diverted,true);assert.equal(hunter.torpedoDecoys,1);
 assert.deepEqual(restore(save(s)).projectiles,[shot]);
 const heading=radians(shot.heading);
 const neutral=vessel('fishing boat',shot.x+Math.sin(heading)*160,shot.y+Math.cos(heading)*160,{kind:'fishing',military:false,heading:shot.heading});
 s.ships=[neutral];
 advanceUntil(s,()=>neutral.hull===0,20);
 assert.equal(neutral.hull,0);assert.equal(s.status,'patrol');
 assert.ok(s.debrief.some(entry=>entry.text.includes('struck the neutral')));
 assert.deepEqual(patrolKills(s),{ships:0,submarines:0});
 const clean=ocean();clean.ships=[vessel('neutral',0,400,{military:false})];
 clean.contacts=[{id:'neutral',bearing:0,identified:true,military:false}];
 assert.equal(fire(clean,'neutral'),false);
 clean.contacts[0].identified=false;
 assert.ok(fire(clean,'neutral'));
 advanceUntil(clean,()=>clean.ships[0].hull===0,25);
 assert.equal(clean.status,'patrol');assert.ok(Number.isFinite(clean.ships[0].neutralHitAt));
 assert.ok(clean.debrief.some(entry=>entry.text.includes('struck the neutral')));

 const supply=ocean();supply.ships=[vessel('hunter',0,175,{kind:'sub',depth:3})];
 supply.contacts=[{id:'hunter',bearing:0,kind:'sub',depthEstimate:3}];
 for(let i=0;i<3;i++){
  supply.time=20*i;
  assert.ok(fire(supply,'hunter'));supply.projectiles.at(-1).age=4;
  supply.time+=.25;updateCombat(supply,.25);supply.projectiles=[];
  assert.equal(supply.ships[0].torpedoDecoys,Math.max(0,1-i));
 }
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

test('each aircraft has one depth bomb for its flight, including after a reload',()=>{
 const s=ocean();
 s.airSupport.status='airborne';s.airSupport.lastKnown={x:0,y:0,time:0};
 s.aircraft=['alpha','bravo','charlie'].map((id,i)=>plane(id,i*10,-100,70,{phase:'search'}));
 step(s,.25);
 assert.equal(s.blasts.filter(b=>b.kind==='bomb').length,3);
 assert.ok(s.aircraft.every(p=>p.bombDropped));
 const loaded=restore(save(s));assert.ok(loaded);
 for(const p of loaded.aircraft)p.phase='search';
 step(loaded,.25);assert.equal(loaded.blasts.filter(b=>b.kind==='bomb').length,3);
});

test('an expired air search ends once, survives a reload, and its aircraft leave the map',()=>{
 const s=ocean();s.depth=s.targetDepth=80;s.time=200;
 s.airSupport.status='airborne';s.airSupport.launchAt=60;s.airSupport.lastKnown={x:0,y:0,time:0};
 s.aircraft=[plane('patrol',s.airSupport.base.x+1200,s.airSupport.base.y,120,{speed:70,phase:'search'})];
 step(s,.25);
 assert.equal(s.airSupport.status,'spent');assert.equal(s.aircraft[0].phase,'return');
 const resumed=restore(save(s));assert.ok(resumed);
 step(resumed,30);
 assert.equal(resumed.aircraft.length,0);assert.equal(resumed.airSupport.status,'spent');
 assert.equal(resumed.events.filter(e=>e.text.includes('called off')).length,1);
});

test('the air search timeout follows pursuit persistence and the most recent report',()=>{
 for(const pursuit of [.5,1,2]){
  const s=ocean();s.depth=s.targetDepth=80;s.difficulty.pursuit=pursuit;
  s.airSupport.status='airborne';s.airSupport.launchAt=10;s.airSupport.lastKnown={x:0,y:0,time:125};
  s.aircraft=[plane('patrol',1000,2000,120,{speed:70,phase:'search'})];
  s.time=125+100*pursuit-1;step(s,.25);
  assert.equal(s.airSupport.status,'airborne');
  step(s,1);assert.equal(s.airSupport.status,'spent');
 }
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

function patrolWithHunter(kind,range,seed=31){
 const s=ocean('recon',seed);
 Object.assign(s.environment,{startHour:12,startWeather:'clear',changing:false});
 s.ships=[vessel('hunter',0,-range,{kind,depth:kind==='sub'?80:0,alert:85,attack:0})];
 return s;
}

test('an enemy submarine attacks the same predicted track after the quiet boat takes either of two unseen courses',()=>{
 const s=patrolWithHunter('sub',700);
 s.heading=s.targetHeading=90;
 s.speed=s.targetSpeed=6;
 s.ships[0].attack=10;
 step(s,.25);
 const snapshot=restore(save(s));
 assert.deepEqual(snapshot,s);
 const a=structuredClone(snapshot),b=structuredClone(snapshot);
 for(const [boat,x,y] of [[a,-500,-200],[b,500,250]]){
  Object.assign(boat,{x,y,depth:150,targetDepth:150,speed:0,targetSpeed:0,silent:true,scope:false});
  boat.ships[0].attack=0;
  step(boat,.25);
 }
 assert.equal(a.projectiles.length,1,'the hunter should still act on its recent report');
 assert.equal(a.projectiles[0].owner,'enemy');
 assert.deepEqual(a.projectiles,b.projectiles,'unobserved moves must not change the incoming shot’s course or ordered depth');
 assert.equal(a.ships[0].heading,b.ships[0].heading);
});

test('escort gunfire has a wider spread at distance and can miss a stationary boat',()=>{
 let closeMisses=0,farMisses=0;
 for(let seed=1;seed<=48;seed++){
  const near=patrolWithHunter('escort',400,seed),far=patrolWithHunter('escort',2400,seed);
  step(near,.25);step(far,.25);
  assert.equal(near.shells.length,1);
  assert.equal(far.shells.length,1);
  const miss=s=>separation(s,s.shells[0])>=65;
  closeMisses+=Number(miss(near));
  farMisses+=Number(miss(far));
 }
 assert.ok(farMisses>closeMisses+12,{closeMisses,farMisses});
 assert.ok(farMisses>0&&farMisses<48,'distant shooting must sometimes miss and sometimes still threaten the boat');
});

test('difficulty settings survive reload and gate enemy support, equipment, ping detection and chart truth',()=>{
 const s=patrolWithHunter('escort',600);
 Object.assign(s.difficulty,{airSupport:false,satellite:false,drone:false,pingDetection:0,damage:1});
 assert.ok(ping(s));assert.equal(s.ships[0].report,undefined);
 const plotted=estimateAt(chartContacts(s)[0],s.time);
 s.ships[0].x+=500;
 assert.deepEqual(estimateAt(chartContacts(s)[0],s.time),plotted);
 s.difficulty.omniscientChart=true;
 assert.equal(estimateAt(chartContacts(s)[0],s.time).x,s.ships[0].x);
 assert.equal(requestRecon(s,{x:0,y:0,size:10000}),false);
 assert.equal(deployDrone(s),false);
 hurt(s,10,'Fixture damage');assert.equal(s.hull,95);
 step(s,.25);assert.equal(s.airSupport.status,'idle');
 assert.deepEqual(restore(save(s)),s);
});

test('submarine patrols can contain a second boat and succeed on surfaced withdrawal with zero kills',()=>{
 const submarineCounts=new Set(),convoyCounts=new Set();
 for(let seed=1;seed<64;seed++){
  const sub=createGame('seek-and-destroy-sub',seed),convoy=createGame('seek-and-destroy',seed);
  submarineCounts.add(sub.ships.filter(ship=>ship.kind==='sub').length);
  convoyCounts.add(convoy.ships.filter(ship=>ship.kind==='sub').length);
  assert.deepEqual(restore(save(sub)),sub);
 }
 assert.deepEqual([...submarineCounts].sort(),[1,2]);assert.deepEqual([...convoyCounts].sort(),[0,1]);
 const s=createGame('seek-and-destroy-sub',31);
 Object.assign(s,{...s.home,depth:0,targetDepth:0,speed:0,targetSpeed:0});
 step(s,.25);assert.equal(s.status,'won');assert.deepEqual(patrolKills(s),{ships:0,submarines:0});
});

test('submarine contacts carry estimates, a player torpedo can hit, and service totals are idempotent',()=>{
 const s=patrolWithHunter('sub',600);
 Object.assign(s,{depth:80,targetDepth:80,patrolId:'a'.repeat(32)});
 Object.assign(s.ships[0],{x:0,y:550,attack:999,alert:0,torpedoDecoys:0});
 const target=contact(s,s.ships[0],'active');assert.equal(target.kind,'sub');
 assert.ok(Number.isFinite(target.depthEstimate));assert.equal(target.courseEstimated,undefined);
 assert.ok(fire(s,target.id));step(s,32);
 assert.deepEqual(patrolKills(s),{ships:0,submarines:1});
 const entries=new Map(),storage={get length(){return entries.size;},key:index=>Array.from(entries.keys())[index],getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)};
 saveServiceRecord(storage,s);saveServiceRecord(storage,restore(save(s)));
 assert.deepEqual(serviceRecord(storage),{ships:0,submarines:1,doubleHunts:0});
 s.ships.push({...s.ships[0],id:'second'});saveServiceRecord(storage,s);
 assert.deepEqual(serviceRecord(storage),{ships:0,submarines:2,doubleHunts:1});
 saveServiceRecord(storage,{...s,patrolId:'b'.repeat(32)});
 assert.deepEqual(serviceRecord(storage),{ships:0,submarines:4,doubleHunts:2});
});

test('a deep bow launch clears the hull on its own axis before bending toward a surface contact',()=>{
 for(const pitch of [0,-.12,.12]){
  const s=ocean();Object.assign(s,{depth:90,targetDepth:90,pitch});
  const target=vessel('transport',400,1200);s.ships=[target];contact(s,target,'active');assert.ok(fire(s,target.id));
  const p=s.projectiles[0],origin={...p};
  for(let i=0;i<8;i++){
   step(s,.25);
   assert.ok(Math.abs(p.x-origin.x)<1e-7,'still on the bow line');
   assert.ok(Math.abs(p.depth-origin.depth+(p.y-origin.y)*Math.tan(pitch))<1e-7,'no early climb');
  }
  assert.ok(p.y>origin.y+30);
  const bends=[];
  for(let i=0;i<8;i++){
   const before=p.pitch;step(s,.25);bends.push(p.pitch-before);
   const a=p.path.at(-2),b=p.path.at(-1);
   assert.ok(Math.abs(p.pitch-Math.atan2(a.depth-b.depth,separation(a,b)))<1e-7);
  }
  assert.ok(bends.filter(v=>v>.005).length>=4,'several successive frames show the bend');
  assert.ok(bends.every(v=>Math.abs(v)<.2),'no single-frame jump to a steep angle');
  assert.ok(p.depth<origin.depth);
 }
});
