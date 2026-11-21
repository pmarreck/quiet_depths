import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,save,restore,bearing,rad} from '../src/sim.js';
import {operationApproach,dronePhotograph,startRescue,casualtyDeadline} from '../src/missions.js';
function atSite(s){const p=operationApproach(s);Object.assign(s,{x:p.x,y:p.y,depth:p.depth,targetDepth:p.depth,speed:0,targetSpeed:0,heading:0,targetHeading:0});s.ships=[];}
for(const mission of ['undersea-rescue','surface-rescue'])test(`${mission}: holds assess, transfer finite survivors, recover crew, then require surface extraction`,()=>{
 for(let seed=1;seed<=16;seed++){const s=createGame(mission,seed),initial=s.operation.remaining;atSite(s);step(s,8);assert.equal(s.operation.rescued,0);assert.equal(s.operation.known,false);step(s,15);assert.equal(s.operation.known,true);assert.ok(s.operation.rescued>0||initial===0);
  for(let i=0;i<4&&s.phase!=='extract';i++)step(s,60);assert.equal(s.phase,'extract',seed);assert.equal(s.operation.remaining,0);assert.equal(s.operation.rescued+s.operation.dead,initial);assert.ok(s.operation.diverReturn>=9);assert.equal(s.status,'patrol');
  const r=restore(save(s));assert.deepEqual(r,s);r.x=r.home.x;r.y=r.home.y;r.depth=r.targetDepth=10;step(r,.25);assert.equal(r.status,'patrol');r.depth=r.targetDepth=0;r.verticalSpeed=0;step(r,.25);assert.equal(r.status,'won');}
});
test('rescue cannot progress away from site, too deep, or moving too fast',()=>{
 for(const change of [s=>s.x+=200,s=>s.depth=s.targetDepth=30,s=>s.speed=s.targetSpeed=4]){const s=createGame('surface-rescue');atSite(s);change(s);step(s,8);assert.equal(s.operation.rescued,0);assert.equal(s.operation.assessment,0);}
});
test('waiting too long loses survivors without manufacturing or hiding boarded people',()=>{
 const s=createGame('undersea-rescue',3),initial=s.operation.remaining;s.ships=[];s.speed=s.targetSpeed=0;for(let i=0;i<8;i++)step(s,60);assert.ok(s.operation.dead>0);assert.equal(s.operation.remaining+s.operation.rescued+s.operation.dead,initial);assert.equal(s.operation.known,false);
});
test('wreck survey requires timed close passes, or distinct aimed drone images',()=>{
 const a=createGame('survey');atSite(a);step(a,60);assert.equal(a.operation.scan,0);a.speed=a.targetSpeed=1;step(a,46);assert.equal(a.phase,'extract');assert.ok(a.operation.find);
 const s=createGame('survey');atSite(s);s.drone.mode='remote';s.drone.hull=100;
 for(const angle of [0,120,240]){const d=s.drone;Object.assign(d,{x:s.site.x+Math.sin(rad(angle))*35,y:s.site.y+Math.cos(rad(angle))*35,depth:s.site.depth-5});d.heading=bearing(d,s.site);s.photoCooldown=0;assert.ok(dronePhotograph(s).ok);s.photoCooldown=0;assert.equal(dronePhotograph(s).ok,false);}
 step(s,.25);assert.equal(s.phase,'extract');assert.ok(s.operation.find);assert.equal(s.operation.photoAngles.length,3);
});
test('complete a rescue using only the plotted approach and normal simulated controls',()=>{
 const s=createGame('undersea-rescue',2);s.ships=[];const p=operationApproach(s);s.route={x:p.x,y:p.y,radius:p.radius};s.targetDepth=p.depth;s.targetSpeed=3;
 for(let i=0;i<20&&s.phase!=='extract'&&s.status==='patrol';i++)step(s,60);
 assert.equal(s.phase,'extract');assert.ok(s.hull>0);assert.equal(s.operation.remaining,0);assert.equal(s.route,null);
});
test('a detected surfaced boat draws delayed shellfire; diving avoids the same shell impacts',()=>{
 const surface=createGame('recon',1);surface.x=surface.y=0;surface.speed=surface.targetSpeed=0;surface.depth=surface.targetDepth=0;surface.ships=[{...surface.ships.find(v=>v.id==='kestrel'),x:1000,y:0,speed:0,alert:100,attack:0}];
 step(surface,1);assert.ok(surface.shells.length>0);assert.equal(surface.hull,100);
 // Put both listeners at the actual impact point. This removes random shell
 // dispersion from the damage/depth comparison without replacing weapon logic.
 surface.x=surface.shells[0].x;surface.y=surface.shells[0].y;const deep=structuredClone(surface);deep.depth=deep.targetDepth=35;
 step(surface,8);step(deep,8);assert.ok(surface.hull<deep.hull);assert.equal(deep.hull,100);assert.ok(surface.acoustics.some(e=>e.type==='gunfire'));
});

test('a stopped boat can initiate a rescue from its chosen station without plotting an approach',()=>{
 for(const mission of ['undersea-rescue','surface-rescue']){
  const s=createGame(mission,17),site=s.site;s.ships=[];
  Object.assign(s,{x:site.x+48,y:site.y,depth:mission==='surface-rescue'?6:site.depth-25,speed:0,targetSpeed:3,route:{x:0,y:0}});
  const chosen=[s.x,s.y];assert.equal(startRescue(s),true);
  assert.equal(s.route,null);assert.equal(s.targetSpeed,0);assert.deepEqual([s.x,s.y],chosen);
  for(let i=0;i<5&&!s.operation.completed;i++)step(s,60);
  assert.ok(s.operation.completed);assert.ok(s.operation.rescued>0);
  assert.ok(Math.hypot(s.x-chosen[0],s.y-chosen[1])<1);
 }
 const s=createGame('undersea-rescue',4);assert.equal(startRescue(s),false);
});
test('casualty deadlines vary with the patrol and leave time to reach and service the casualty',()=>{
 const first=new Set(),spacing=new Set();
 for(let seed=1;seed<=32;seed++){
  const s=createGame('undersea-rescue',seed),initial=casualtyDeadline(s);
  assert.ok(initial>=385&&initial<=475);first.add(Math.floor(initial));
  for(let n=1;n<=6;n++){
   s.operation.dead=n;s.operation.lastCasualty=initial;
   const wait=casualtyDeadline(s)-initial;assert.ok(wait>=105&&wait<=215);spacing.add(Math.floor(wait));
  }
 }
 assert.ok(first.size>15&&spacing.size>50);
});
