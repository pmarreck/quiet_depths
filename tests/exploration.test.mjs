import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MISSIONS,createGame,step,ping,save,restore,getSoundings} from '../src/sim.js';
import {operationApproach} from '../src/missions.js';
import {environmentAt,hash01} from '../src/environment.js';
import {chartDepth} from '../src/coast.js';
import {floorSurface} from '../src/seafloor.js';
import {chartContacts} from '../src/track-estimates.js';
import {weatherMix} from '../src/audio.js';
import {messLine,messClips,crewPeriod} from '../src/mess-watch.js';
import {CrewAmbience} from '../src/crew-ambience.js';
const options={weather:'clear',changing:false,difficulty:{longPatrol:true,airSupport:false,omniscientChart:true}};
test('every briefing has a complete play-time range for each patrol length',()=>{
 const bounds=text=>{
  const range=/^(\d+)–(\d+) MIN$/.exec(text);
  assert.ok(range,'Expected a play-time range, got '+text);
  const [low,high]=range.slice(1).map(Number);
  assert.ok(low>0&&high>low);return [low,high];
 };
 for(const mission of MISSIONS){
  const standard=bounds(mission.minutes),longer=bounds(mission.longMinutes);
  assert.ok(longer[0]>standard[0]&&longer[1]>standard[1],mission.name);
 }
});

test('all long patrols begin in water outside all sonar ranges, with a reproducible uncertain briefing',()=>{
 for(const m of MISSIONS)for(let seed=0;seed<30;seed++){
  const s=createGame(m.id,seed,options),a=s.search;
  assert.ok(!createGame(m.id,seed).search);
  assert.ok(getSoundings(s).belowKeel>0);
  for(const p of [...s.ships,...(s.site?[s.site]:[])])assert.ok(Math.hypot(p.x-s.x,p.y-s.y)>6000,m.id);
  assert.equal(s.contacts.length,0);assert.deepEqual(chartContacts(s),[]);
  assert.ok(ping(s));assert.equal(s.contacts.length,0);assert.ok(!a.located);
  const goals=s.site?[s.site]:s.ships.filter(v=>a.targets.includes(v.id));
  assert.ok(goals.length>0);for(const p of goals)assert.ok(Math.hypot(p.x-a.x,p.y-a.y)<a.radius,m.id+' '+seed);
  assert.deepEqual(restore(save(s)).search,createGame(m.id,seed,options).search);
  if(s.departure)assert.deepEqual(s.departure,{x:s.x,y:s.y});
 }
});
function hold(s){Object.assign(s,{depth:0,targetDepth:0,speed:0,targetSpeed:0,engine:'diesel'});}
test('rescue and both fleets get three real minutes at 20x, surviving pause, save, and an extended patrol clock',()=>{
 for(const mission of ['surface-rescue','undersea-rescue','tiebreaker']){
  let s=createGame(mission,47,options);hold(s);
  const fuel=s.fuel,initial=s.ships.map(v=>({x:v.x,y:v.y}));
  for(let i=0;i<30;i++)step(s,60,{timeRate:20});
  const raw=save(s);step(s,60,{paused:true,timeRate:20});assert.equal(save(s),raw);s=restore(raw);
  for(let i=0;i<30;i++)step(s,60,{timeRate:20});
  assert.equal(s.search.activeSeconds,180);assert.equal(s.search.protectedTime,3600);
  assert.equal(s.status,'patrol');assert.ok(s.fuel<fuel);
  if(s.operation){assert.equal(s.operation.dead,0);if(s.site.kind==='surface')assert.equal(s.site.depth,2);}
  if(s.battle){
   assert.equal(s.battle.round,0);assert.deepEqual(s.battle.volleys,[]);
   assert.ok(s.ships.every((v,i)=>Math.abs(v.x-initial[i].x)>790&&v.hull===100));
   step(s,.25);assert.ok(s.battle.volleys.length);
  }else{
   for(let i=0;i<10;i++)step(s,60);assert.ok(s.operation.dead>0);
  }
 }
});
test('site controls and chart fix unlock on an observation, independent of the center of the search ring',()=>{
 const s=createGame('survey',5,options);
 assert.equal(operationApproach(s),null);assert.ok(Math.hypot(s.search.x-s.site.x,s.search.y-s.site.y)>300);
 Object.assign(s,{x:s.site.x-1200,y:s.site.y});ping(s);assert.ok(s.search.located);assert.ok(operationApproach(s));assert.ok(restore(save(s)).search.located);
 const a=createGame('survey',5,options);a.search.protectedTime=900;assert.equal(restore(save(a)),null);
});
test('seeded outer shores are reproducible and agree with soundings and the rendered seafloor',()=>{
 const depthMask=seed=>Array.from({length:210},(_,i)=>chartDepth((i%15-7)*2400,(Math.floor(i/15)-4)*1900,seed)<0);
 const a=depthMask(12),b=depthMask(13);assert.deepEqual(a,depthMask(12));assert.ok(a.filter((v,i)=>v!==b[i]).length>8);
 assert.ok(a.some(Boolean)&&a.some(v=>!v));
 const s=createGame('survey',12),cell=16000/140;Object.assign(s,{x:96*cell,y:132*cell});
 const sampled=getSoundings(s).waterDepth;assert.equal(sampled,chartDepth(s.x,s.y,12));
 assert.ok(Math.abs(floorSurface(s.x,s.y,12).height+sampled)<.0001);
 delete s.environment.chartSeed;const old=restore(save(s));assert.equal(getSoundings(old).waterDepth,chartDepth(s.x,s.y));
});
test('morning fog hides hulls on both sides while a lit vessel can still leave an anonymous optical bearing',()=>{
 let s,e,clear;
 for(let seed=0;seed<60&&(!s||!clear);seed++){
  const sample=createGame('recon',seed,{weather:'clear',timeOfDay:'dawn',changing:false}),env=environmentAt(sample);
  if(env.fog>.6){s=sample;e=env;}else if(!env.fog)clear=env;
 }
 assert.ok(e.opticalRange<clear.opticalRange&&e.subVisualRange<clear.subVisualRange&&e.lightRange>e.opticalRange);
 hold(s);s.scope=false;s.ships=s.ships.slice(0,1);const v=s.ships[0];Object.assign(v,{x:s.x,y:s.y+(e.lightRange+e.opticalRange)/2,speed:0});s.systems.sonar=0;
 step(s,3,{observation:'tower',look:0});const c=s.contacts.find(c=>c.id===v.id);assert.equal(c.method,'lights');assert.ok(!c.identified&&!c.fix&&!c.range);
 s.time=480;assert.equal(environmentAt(s).fog,0);
});
test('open stations get stronger rain and thunder, and occasional bolts join a surfaced ship to the storm cloud',()=>{
 const s=createGame('recon',1);hold(s);
 for(const deck of ['tower','gun']){const a=weatherMix(s,deck),b=weatherMix(s,'scope');assert.ok(a.rain>b.rain*4&&a.thunder>b.thunder*3&&a.cutoff>b.cutoff*3);}
 let direct=0,water=0;
 for(let seed=1;seed<125;seed++){
  const s=createGame('recon',seed,{weather:'storm',changing:false});s.nextLightningAt=0;const hull=s.ships.map(v=>v.hull);step(s,.25);
  const bolt=s.lightning[0];assert.ok(bolt);const index=s.ships.findIndex((v,i)=>v.hull<hull[i]&&Math.hypot(bolt.x-v.x,bolt.y-v.y)<3);
  if(index<0)water++;else{direct++;assert.ok(bolt.altitude>0);assert.notEqual(s.ships[index].kind,'sub');}
 }
 assert.ok(direct>0&&water>direct*3);
});
test('recordings resolve offline, coffee stays in its watches, and distant audible events trigger bounded crew responses',async()=>{
 for(const id of messClips){const b=await readFile(new URL('../src/crew/'+id+'.mp3',import.meta.url));assert.ok(b.length>4000);}
 const lines=h=>new Set(Array.from({length:100},(_,i)=>messLine(crewPeriod(h),(i+.5)/100)));
 for(const h of [12,18])assert.deepEqual(lines(h),new Set(['steak','chicken','ice-cream','mmm','horse','elephant']));
 assert.ok(lines(7.2).has('eggs'));assert.ok(lines(14.2).has('coffee'));assert.equal(crewPeriod(23.1),'lights-out');
 const s=createGame('recon',1),context={currentTime:0,createGain:()=>({gain:{setTargetAtTime(){}},connect(){}})},crew=new CrewAmbience(context,{}),heard=[];
 crew.speak=line=>heard.push(line);crew.update(s,{hour:10},true);
 const id=Array.from({length:150},(_,i)=>i).find(i=>hash01(s.patrol.seed,i+8520)<.22),event={id,type:'thunder',perceived:{distance:2100}};
 crew.distantSound(s,{...event,perceived:{distance:50}});assert.equal(crew.reaction,null);
 crew.distantSound(s,event);context.currentTime=2;crew.update(s,{hour:10},true);assert.equal(heard.length,1);assert.match(heard[0],/what-noise|hear-that/);
 crew.distantSound(s,event);assert.equal(crew.reaction,null);
});
