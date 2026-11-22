import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,save,restore,step,ping} from '../src/sim.js';
import {ReplayRecorder,ReplayPlayback,replayEvent} from '../src/instant-replay.js';
import {observeTorpedo,gameEcho,threats,etaText} from '../src/torpedo-watch.js';
import {patrolNotices} from '../src/ui.js';
import {seriousRepairs} from '../src/red-alert.js';

function passFixture(side,{enemy=true,enabled=true}={}){
 const s=createGame('recon',31,{difficulty:{instantReplay:enabled,orbitCamera:false}});
 Object.assign(s,{x:0,y:0,depth:55,targetDepth:55,speed:0,targetSpeed:0,heading:0,targetHeading:0});
 const p={id:999,owner:enemy?'enemy':'player',launcher:null,x:side,y:-200,depth:55,age:5,heading:0,
  orderedHeading:0,orderedDepth:55,pitch:0,aim:{x:side,y:1500},pingAge:2,path:[]};
 s.projectiles.push(p);
 // Use the normal legacy-save defaults for fields unrelated to the fixture.
 s.weaponSequence=1000;
 const world=restore(save(s));assert.ok(world);
 let wall=0;
 const recorder=enabled?new ReplayRecorder(world,()=>wall):null;
 const tick=(seconds)=>{wall+=seconds;step(world,seconds,{afterTick:s=>recorder?.capture(s)});};
 return {world,recorder,tick};
}

test('a torpedo passing 19 m from the hull yields one complete near-miss replay with orbit disabled',()=>{
 const {world,recorder,tick}=passFixture(24);
 tick(8);assert.equal(recorder.pending.length,0);
 tick(4);assert.equal(world.impacts.length,0);assert.equal(world.hull,100);
 tick(2);
 const clip=recorder.take(world.time,false,()=>false);
 assert.equal(clip?.event.kind,'near-miss');assert.ok(clip.event.shot===999);
 assert.equal(recorder.pending.length,0);
 const playback=new ReplayPlayback(clip),live=save(world);
 assert.ok(Math.abs(clip.event.time-playback.cursor-5)<1e-8);
 const initial=playback.camera();
 playback.press(1,10,10);playback.move(1,50,20);assert.notEqual(playback.camera().yaw,initial.yaw);
 playback.press(2,60,20);playback.move(2,80,20);assert.ok(playback.camera().distance<initial.distance);
 playback.release(2);playback.release(1);
 const previousY=playback.world.projectiles[0].y;
 assert.equal(playback.advance(.5),true);assert.ok(playback.world.projectiles[0].y>previousY);
 assert.equal(save(world),live);assert.ok(!playback.advance(10));
 tick(25);assert.equal(recorder.pending.length,0);
});

test('shots outside the band, friendly shots, expiry and hits never count as close passes',()=>{
 for(const [side,opts] of [[26,{}],[24,{enemy:false}],[0,{}],[24,{expires:true}]]){
  const {world,recorder,tick}=passFixture(side,opts);
  if(opts.expires)world.projectiles[0].runLimit=192;
  for(let i=0;i<64;i++)tick(.25);
  assert.equal(recorder.pending.some(c=>c.event.kind==='near-miss'),false);
  if(side===0)assert.ok(recorder.pending.some(c=>c.event.kind==='torpedo'));
 }
});

test('master and enemy-event switches apply independently of orbit and wait for live effects',()=>{
 for(const [master,extra] of [[false,true],[true,false],[true,true]]){
  const s=createGame('recon',1,{difficulty:{instantReplay:master,enemyReplay:extra,orbitCamera:false}});
  let wall=0;const rec=new ReplayRecorder(s,()=>wall);
  const mark=(kind,enemy)=>replayEvent(s,{kind,enemy,point:{x:0,y:0,depth:30}});
  mark('collapse',true);mark('ground',false);
  assert.equal(rec.pending.length,master?extra?2:1:0);
  if(!master)continue;
  assert.equal(rec.take(1,false,()=>false),null);
  wall=10;assert.equal(rec.take(10,false,()=>true),null);
  assert.ok(rec.take(10,false,()=>false));
 }
});

test('active contacts keep separate fixes through passive pulses and lose stale ETA warnings',()=>{
 const s=createGame('recon',22);Object.assign(s,{x:0,y:0,depth:55,time:1});
 const shot={id:1,x:0,y:600,depth:55,orderedDepth:55,aim:{x:s.x,y:s.y},owner:'enemy',diverted:false};
 const emit=(time,x,y,active,id=1)=>{s.time=time;observeTorpedo(s,gameEcho(s,{...shot,id,x,y},time,24),active);};
 emit(1,0,600,false);assert.equal(s.torpedoTracks.length,0);
 emit(1,0,600,true);emit(1,0,600,true);assert.equal(s.torpedoTracks[0].fixes,1);
 emit(2,12,400,false);emit(3,0,300,false);assert.equal(s.torpedoTracks[0].course,null);
 emit(3,0,300,true);assert.equal(s.torpedoTracks[0].course,180);assert.equal(threats(s).length,1);
 assert.equal(s.torpedoTracks[0].arrival,5); // Halving the measured range took two patrol seconds.
 assert.match(patrolNotices(s,false,false,'sonar',5)[0].text,/likely targeting us! ETA .* ship · 2 patrol s \(1 real s\)/);
 emit(3,50,300,true,2);assert.equal(s.torpedoTracks.length,2);
 assert.equal(etaText(33,3,5,false),'30 patrol s (6 real s)');assert.equal(etaText(33,3,1,true),'30 patrol s (paused)');
 assert.deepEqual(restore(save(s)).torpedoTracks,s.torpedoTracks);
 emit(4,0,310,false);assert.equal(threats(s).length,0);
 emit(5,0,270,false);s.time+=9;assert.equal(threats(s).length,0);
 const old=JSON.parse(save(s));delete old.torpedoTracks;delete old.difficulty.instantReplay;
 assert.deepEqual(restore(JSON.stringify(old)).torpedoTracks,[]);assert.equal(restore(JSON.stringify(old)).difficulty.instantReplay,false);
 s.torpedoTracks[0].activeAt=1e10;assert.equal(restore(save(s)),null);
});

test('active ping labels both owners and a failed or repeated ping cannot supply a second fix',()=>{
 const {world}=passFixture(24);
 world.projectiles.push({...world.projectiles[0],id:1000,owner:'player',x:35});
 assert.equal(ping(world),true);assert.deepEqual(world.torpedoTracks.map(t=>t.id),[999,1000]);
 assert.equal(ping(world),false);assert.ok(world.torpedoTracks.every(t=>t.fixes===1));
});

test('a repair alert follows work on damage that crews can still repair',()=>{
 const s=createGame();s.systems.sonar=30;assert.equal(seriousRepairs(s),false);
 s.repair=10;assert.equal(seriousRepairs(s),true);s.repairLimits.sonar=30;assert.equal(seriousRepairs(s),false);
 s.systems.sonar=0;assert.equal(seriousRepairs(s),false);s.flood=.5;assert.equal(seriousRepairs(s),true);
 s.repair=0;s.drone.camera=28;assert.equal(seriousRepairs(s),true);
 s.drone.mode='remote';assert.equal(seriousRepairs(s),false);
});
