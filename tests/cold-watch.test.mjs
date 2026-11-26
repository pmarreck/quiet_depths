import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,createGame,step,ping,fire,save,restore,dropDepthCharge} from '../src/sim.js';
import {advanceTraffic,canAttackPlayer,encounterGroups,encounterTime,playerSignal,resumeTraffic} from '../src/cold-watch.js';
import {DAY_SECONDS,patrolCalendar,sailingDay} from '../src/patrol-calendar.js';
import {environmentAt} from '../src/environment.js';
import {launchNoise} from '../src/acoustics.js';
import {energyDraw} from '../src/power-plant.js';
import {recordWake} from '../src/surface-wake.js';
import {CrewAmbience} from '../src/crew-ambience.js';
import {friendlyLead} from '../src/fleet-action.js';

test('all 366 sailing dates are reachable, including leap day, and moon phases follow the UTC watch',()=>{
 const sampled=new Set(Array.from({length:10000},(_,seed)=>sailingDay(seed)));
 assert.equal(sampled.size,366);assert.equal(Math.min(...sampled),0);assert.equal(Math.max(...sampled),365);
 assert.equal(patrolCalendar(59,0,0).date,'29 FEB 1972');
 assert.equal(patrolCalendar(365,23,120).date,'01 JAN 1973');
 assert.equal(patrolCalendar(365,23,120).holiday,'new-year');assert.equal(patrolCalendar(359,0,0).holiday,'christmas');
 // NASA's 1972 UT table gives January 16 1052 new, January 30 1058 full.
 assert.ok(patrolCalendar(15,10+52/60,0).illumination<.00001);
 assert.ok(patrolCalendar(29,10+58/60,0).illumination>.99999);
 const s=createGame('survey',12,{timeOfDay:'night',weather:'clear',changing:false});
 s.environment.startDay=29;const full=environmentAt(s);
 assert.ok(full.moonDirection.y>0&&full.moonLight>.7);
 s.environment.startWeather='storm';assert.equal(environmentAt(s).moonLight,0);assert.equal(environmentAt(s).clearLight,0);
 s.environment.startWeather='clear';s.environment.startDay=15;assert.ok(environmentAt(s).moonLight<.01);
 delete s.environment.startDay;assert.equal(restore(save(s)).environment.startDay,sailingDay(12));
});

test('passages have independent draws, can coincide on any mission, and never change the original manifest',()=>{
 const patterns=new Map();
 for(let seed=1;seed<2500;seed++){
  const flags=Object.values(encounterGroups(seed,0)).map(Number).join('');
  if(!patterns.has(flags))patterns.set(flags,seed);
 }
 assert.equal(patterns.size,16);
 for(const mission of MISSIONS){
  for(const longPatrol of [true,false]){
   const seed=patterns.get('1111'),s=createGame(mission.id,seed,{difficulty:{longPatrol}});
   const targets=s.search?.targets.slice(),lead=friendlyLead(s.ships),original=s.ships.length;
   s.time=encounterTime(seed,0)-.01;advanceTraffic(s,false,()=>{});assert.equal(s.ships.length,original);
   step(s,.02);const visitors=s.ships.filter(v=>v.incidental);
   assert.ok(visitors.length>=4);assert.equal(friendlyLead(s.ships),lead);assert.deepEqual(s.search?.targets,targets);
   const resumed=restore(save(s));assert.ok(resumed,mission.id);
   advanceTraffic(resumed,false,()=>{});assert.deepEqual(resumed.ships,s.ships);
   resumed.time=encounterTime(seed,1)+.01;advanceTraffic(resumed,false,()=>{});assert.equal(resumed.traffic.window,1);
   assert.equal(new Set(resumed.ships.map(v=>v.id)).size,resumed.ships.length);
  }
 }
 const seed=patterns.get('0000'),s=createGame('survey',seed);
 s.time=encounterTime(seed,0);advanceTraffic(s,false,()=>{});assert.equal(s.traffic.window,0);assert.ok(s.ships.every(v=>!v.incidental));
 assert.equal(resumeTraffic(s.time,seed).window,0);assert.equal(resumeTraffic(0,seed).window,-1);
});

function visitor(s,id,side,kind='sub'){
 return {id,name:id,kind,side,military:true,incidental:true,hull:100,depth:kind==='sub'?30:0,heading:0,speed:4,attack:0,alert:0,x:s.x,y:s.y+700};
}
test('warnings can draw withdrawal, counterthreats, or a fight, with fewer unprovoked challenges over holidays',()=>{
 const count=holiday=>{
  const results={warn:0,retreat:0,fight:0,short:0};
  for(let seed=0;seed<320;seed++){
   const s=createGame('survey',seed),a=visitor(s,'a','hostile'),b=visitor(s,'b','friendly');
   b.x+=800;s.ships=[a,b];
   for(let t=0;t<=64;t+=4){
    s.time=t;advanceTraffic(s,holiday,(action,ship,v)=>{
     if(['ping','short-run','shell'].includes(action))results.warn++;
     if(action==='withdraw')results.retreat++;
     if(action==='attack')results.fight++;
     if(action==='short-run'){results.short++;assert.equal(v.damage,0);assert.equal(v.warning,true);}
    });
   }
  }
  return results;
 };
 const normal=count(false),holiday=count(true);
 assert.ok(normal.warn>0&&normal.retreat>0&&normal.fight>0&&normal.short>0);
 assert.ok(holiday.warn<normal.warn*.5&&holiday.fight<normal.fight*.5);
});

test('a limited player run can be a warning, and a friendly may defend a player already under attack',()=>{
 const s=createGame('recon',5),enemy=visitor(s,'passage-0-1-0','hostile');
 s.ships=[enemy];s.runSetting=100;ping(s);assert.ok(fire(s,enemy.id));
 assert.equal(enemy.parley.order,'warn');assert.equal(canAttackPlayer(s,enemy),false);
 s.runSetting=3000;assert.ok(fire(s,enemy.id));assert.equal(canAttackPlayer(s,enemy),true);
 const ally=visitor(s,'passage-0-0-0','friendly');ally.x+=300;s.ships.push(ally);
 let helped=false;
 for(let time=0;time<90&&!helped;time+=4){s.time=time;advanceTraffic(s,false,(action,v,shot)=>{if(action==='attack'&&v===ally&&shot.target===enemy.id)helped=true;});}
 assert.ok(helped);
 const withdrawals=new Set();
 for(let seed=1;seed<100;seed++){
  const s=createGame('survey',seed),v=visitor(s,'passage-0-1-0','hostile');
  s.ships=[v];v.hull=20;v.disabled=true;playerSignal(s,v,true);
  advanceTraffic(s,false,()=>{});withdrawals.add(v.parley.order);assert.equal(v.speed, v.parley.order==='retreat'?0:4);
 }
 assert.ok(withdrawals.has('retreat')&&withdrawals.has('fight'));
});

test('receipts give a bearing from the listening position, with no ranged fix and occasional inaudible splashes',()=>{
 const hits=new Set();
 for(let seed=1;seed<=60;seed++){
  const s=createGame('survey',seed);s.ships=[];s.speed=s.targetSpeed=0;
  const x=s.x+750,y=s.y;
  launchNoise(s,{x,y,depth:50});dropDepthCharge(s,{x,y,depth:50,delay:8});
  step(s,1);
  hits.add(s.soundBearings.some(v=>v.kind==='splashdown'));
  for(const b of s.soundBearings){
   assert.deepEqual(Object.keys(b).sort(),['bearing','kind','time','x','y']);
   assert.ok(Math.abs(b.bearing-90)<=5);assert.equal(b.x,s.x);assert.equal(b.y,s.y);
   assert.ok(s.events.some(e=>e.text.includes('heard · bearing')));
  }
  assert.deepEqual(s.contacts,[]);assert.deepEqual(s.torpedoTracks,[]);
  assert.deepEqual(restore(save(s)).soundBearings,s.soundBearings);
 }
 assert.equal(hits.size,2);
 const deaf=createGame('survey',17);deaf.ships=[];deaf.systems.sonar=0;launchNoise(deaf,deaf);step(deaf,1);
 assert.deepEqual(deaf.soundBearings,[]);assert.ok(deaf.acoustics.find(a=>a.type==='launch').missed);
});

test('surfaced hull and periscope leave different wakes, with old foam persisting briefly after a dive',()=>{
 const s=createGame(),sea={waveScale:0,waveSpeed:1};
 const sample=(speed,depth,scope)=>{Object.assign(s,{wake:[],time:1,speed,depth,pitch:0,scope});recordWake(s,sea);return s.wake[0];};
 const hull=sample(12,0,false),slow=sample(3,0,false),scope=sample(12,15,true);
 assert.ok(hull.width>scope.width&&hull.strength>slow.strength);assert.ok(slow.width<hull.width);
 assert.equal(sample(0,0,true),undefined);assert.equal(sample(12,20,true),undefined);
 sample(10,0,false);s.depth=40;s.time+=3;recordWake(s,sea);assert.equal(s.wake.length,1);
 s.time+=26;recordWake(s,sea);assert.equal(s.wake.length,0);
});

test('both plants have hotel loads, speed costs energy per mile, and powerless idle patrols end',()=>{
 for(const field of ['diesel','electric']){
  const cost=v=>energyDraw(v,0,0)[field];assert.ok(cost(0)>0);
  assert.ok(cost(16)/16>cost(8)/8);assert.equal(cost(-4),cost(4));
  const s=createGame('survey',7);Object.assign(s,{ships:[],x:0,y:0,depth:0,targetDepth:0,speed:0,targetSpeed:0,engine:field,dieselMode:'drive'});
  const reserve=field==='diesel'?'fuel':'battery',before=s[reserve];step(s,6);assert.ok(s[reserve]<before);
 }
 const s=createGame('survey',17);Object.assign(s,{battery:0,fuel:20,engine:'electric',ships:[],speed:0,targetSpeed:0});
 step(s,1);assert.equal(s.status,'patrol');const r=restore(save(s));assert.equal(r.unpoweredSince,s.unpoweredSince);
 r.depth=r.targetDepth=0;r.engine='diesel';step(r,1);assert.equal(r.unpoweredSince,undefined);
 for(let i=0;i<3;i++)step(s,60);assert.equal(s.status,'expired');
});

test('holiday greetings follow the calendar aboard ship and fall silent during combat',()=>{
 const s=createGame('intercept',17),ctx={currentTime:1,createGain:()=>({gain:{setTargetAtTime(){}},connect(){}})};
 const crew=new CrewAmbience(ctx,{}),heard=[];crew.speak=id=>{heard.push(id);return true;};crew.note=()=>{};crew.playSnore=()=>{};crew.playMusic=()=>{};
 for(const ship of s.ships)ship.x+=15000;s.environment.startDay=0;s.environment.startHour=0;
 crew.update(s,environmentAt(s),false);assert.deepEqual(heard,[]);
 crew.update(s,environmentAt(s),true);crew.update(s,environmentAt(s),true);assert.deepEqual(heard,['happy-new-year']);
 const r=restore(save(s));crew.update(r,environmentAt(r),true);assert.deepEqual(heard,['happy-new-year']);
 s.environment.startDay=359;s.environment.startHour=18;
 for(let slot=0;slot<40;slot++){s.time=slot*19;ctx.currentTime+=20;const hour=18+(s.time%500)/120;crew.update(s,{holiday:'christmas',day:359,hour},true);}
 assert.ok(heard.includes('merry-christmas'));
 const count=heard.length;s.alert=80;s.environment.startDay=0;s.time=0;delete s.newYearWatch;
 crew.update(s,environmentAt(s),true);assert.equal(heard.length,count);
 assert.equal(patrolCalendar(358,23,DAY_SECONDS/24).holiday,'christmas');
});
