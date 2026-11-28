import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,save,restore} from '../src/sim.js';
import {updateOperation,operationConditions} from '../src/missions.js';

// Reference behavior recorded from r91. Separation limits are inclusive, the
// speed limit is inclusive, and the depth tolerance is strict.
const SEEDS=[0,1972,4294967295];
const RESCUES={'undersea-rescue':{farthest:75,tolerance:5},'surface-rescue':{farthest:85,tolerance:1}};
const SPEEDS=[[.6,true],[-.6,true],[.61,false]];

// Integer site coordinates keep offsets such as 30 m exact in floating point.
function rescueAt(mission,seed,range,depthOffset,speed){
 const s=createGame(mission,seed),site=s.site;
 Object.assign(site,{x:Math.round(site.x),y:Math.round(site.y),depth:Math.round(site.depth)});
 const station=operationConditions(s).depth;
 Object.assign(s,{x:site.x+range,y:site.y,depth:station+depthOffset,targetDepth:station+depthOffset,speed,targetSpeed:speed,ships:[]});
 return s;
}

test('rescue station keeping follows the recorded separation, speed and depth boundaries, before and after a restore',()=>{
 let cases=0;
 for(const [mission,{farthest,tolerance}] of Object.entries(RESCUES))for(const seed of SEEDS)
  for(const [range,inRange] of [[29.99,false],[30,true],[farthest,true],[farthest+.01,false]])
   for(const [speed,slow] of SPEEDS)for(const [depthOffset,atDepth] of [[tolerance-.01,true],[tolerance,false]]){
    const label=JSON.stringify({mission,seed,range,speed,depthOffset});
    const s=rescueAt(mission,seed,range,depthOffset,speed),o=s.operation,remaining=o.remaining;
    const holding=inRange&&slow&&atDepth;
    assert.equal(operationConditions(s).onStation,inRange&&slow,label);
    assert.equal(updateOperation(s,1),false,label);
    assert.equal(o.holding,holding,label);
    assert.equal(o.active,holding,label);
    assert.equal(o.assessment,holding?1:0,label);
    assert.equal(o.boarding,holding&&remaining>0?1:0,label);
    const resumed=restore(save(s));
    updateOperation(s,.25);updateOperation(resumed,.25);
    assert.deepEqual(resumed.operation,s.operation,label);
    cases++;
   }
 assert.equal(cases,144);
});

test('assessment, transfers and the team’s return take the recorded times',()=>{
 for(const mission of Object.keys(RESCUES)){
  const s=rescueAt(mission,1972,50,0,0),o=s.operation;
  o.remaining=2;o.dead=0;o.lastCasualty=1e9;
  const at=t=>{while(s.time<t){s.time+=.25;updateOperation(s,.25);}};
  at(8.75);assert.equal(o.rescued,0,mission);
  at(9);assert.equal(o.rescued,1,mission+' first transfer at 9 s');
  at(17.75);assert.equal(o.rescued,1);
  at(18);assert.equal(o.rescued,2,mission+' second transfer at 18 s');
  at(21.75);assert.equal(o.known,false,mission);
  at(22);assert.equal(o.known,true,mission+' assessment at 22 s');
  // The return clock includes the tick in which the assessment finishes.
  at(30.5);assert.equal(o.completed,false,mission);
  at(30.75);assert.equal(o.completed,true,mission+' team returns 9 s after the assessment');
  assert.equal(o.diverReturn,9);
 }
});

test('the Elm mission definitions supply the rescue criteria used by the briefings, rules and progress text',async()=>{
 const {MISSIONS}=await import('../src/missions.js'),{objectiveState}=await import('../src/mission-panel.js');
 const {readFile}=await import('node:fs/promises');
 const {rescueCriteriaFor,stationKeeping,surfaceRescue,underseaRescue}=await import('../src/rescue-operation.js');
 const team={assessmentSeconds:22,transferSeconds:9,returnSeconds:9,closestRange:30,fastestKnots:.6,
  emptySiteChance:.08,fewestSurvivors:8,survivorSpread:8,casualtyClockStart:240,firstLossDelay:145,firstLossSpread:90,laterLossDelay:105,laterLossSpread:110};
 const undersea=MISSIONS.find(m=>m.id==='undersea-rescue'),surface=MISSIONS.find(m=>m.id==='surface-rescue');
 assert.deepEqual(undersea.objective,{kind:'rescue',...team,farthestRange:75,depthTolerance:5,sinking:null});
 assert.deepEqual(surface.objective,{kind:'rescue',...team,farthestRange:85,depthTolerance:1,
  sinking:{startDepth:2,settleSeconds:500,foundersAfter:860,foundersSpread:220,sinkRate:.35,lostBelow:15}});
 assert.equal(underseaRescue,undersea.objective);assert.equal(surfaceRescue,surface.objective);
 assert.equal(rescueCriteriaFor('surface'),surfaceRescue);assert.equal(rescueCriteriaFor('sub'),underseaRescue);
 for(const [mission,c] of [[undersea,underseaRescue],[surface,surfaceRescue]])
  assert.ok(mission.desc.includes(`old ${c.closestRange}–${c.farthestRange} m`)&&mission.desc.includes(`below ${c.fastestKnots} knots`),mission.id);
 const s=rescueAt('surface-rescue',1972,120,0,0);
 assert.equal(objectiveState(s).advice,`Hold ${surfaceRescue.closestRange}–${surfaceRescue.farthestRange} m away · depth 0 m ±${surfaceRescue.depthTolerance} · ≤${surfaceRescue.fastestKnots} kn`);
 // Static documents cannot import the catalog. Edit them when the Elm values change.
 const u=underseaRescue,f=surfaceRescue,words={9:'nine'};
 const page=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 assert.ok(page.includes(`Undersea rescue needs ${u.closestRange}–${u.farthestRange} m separation, the stated depth ±${u.depthTolerance} m and ≤${u.fastestKnots} kn. Surface rescue needs ${f.closestRange}–${f.farthestRange} m and depth under ${f.depthTolerance} m.`));
 const guide=await readFile(new URL('../README.md',import.meta.url),'utf8');
 assert.ok(guide.includes(`For undersea rescue, hold ${u.closestRange}–${u.farthestRange} m away, within ${u.depthTolerance} m of the assigned depth, at ${u.fastestKnots} kn or less. Surface rescue needs ${f.closestRange}–${f.farthestRange} m of separation at the surface and the same low speed. Allow ${u.assessmentSeconds} patrol seconds for assessment, ${words[u.transferSeconds]} seconds per transfer and ${words[u.returnSeconds]} more for the team to return.`));
 // The rule follows whatever record it is given.
 assert.deepEqual(stationKeeping(50,.5,2,u),{onStation:true,holding:true});
 assert.deepEqual(stationKeeping(50,.5,2,{...u,farthestRange:40}),{onStation:false,holding:false});
 assert.deepEqual(stationKeeping(50,.5,2,{...u,depthTolerance:2}),{onStation:true,holding:false});
 assert.deepEqual(stationKeeping(50,.5,2,{...u,fastestKnots:.4}),{onStation:false,holding:false});
});

test('survivor counts and casualty deadlines follow the recorded seeded formulas',async()=>{
 const {hash01}=await import('../src/environment.js');
 const {casualtyDeadline}=await import('../src/missions.js');
 const counts=new Set();
 for(const mission of Object.keys(RESCUES))for(let seed=1;seed<=200;seed++){
  const s=createGame(mission,seed),o=s.operation;
  assert.equal(o.remaining,hash01(seed,811)<.08?0:8+Math.floor(hash01(seed,812)*8),mission+' '+seed);
  counts.add(o.remaining);
  assert.equal(o.lastCasualty,240);
  for(let dead=0;dead<=3;dead++){
   o.dead=dead;
   assert.equal(casualtyDeadline(s),o.lastCasualty+(dead===0?145+hash01(seed,821)*90:105+hash01(seed,822+dead)*110),mission+' '+seed+' '+dead);
  }
 }
 assert.ok(counts.has(0),'some sites have nobody left alive');
 assert.deepEqual([...counts].filter(n=>n>0).sort((a,b)=>a-b),[8,9,10,11,12,13,14,15]);
});

test('survivor counts and loss timing follow whatever rescue criteria they are given',async()=>{
 const {initialSurvivors,nextLossDelay,underseaRescue:c}=await import('../src/rescue-operation.js');
 assert.equal(initialSurvivors(.07,.5,c),0);assert.equal(initialSurvivors(.08,0,c),8);assert.equal(initialSurvivors(.5,.999,c),15);
 assert.equal(initialSurvivors(.15,.5,{...c,emptySiteChance:.2}),0);
 assert.equal(initialSurvivors(.5,.5,{...c,fewestSurvivors:3,survivorSpread:4}),5);
 assert.equal(nextLossDelay(0,0,c),145);assert.equal(nextLossDelay(0,1,c),235);
 assert.equal(nextLossDelay(2,0,c),105);assert.equal(nextLossDelay(2,1,c),215);
 assert.equal(nextLossDelay(0,.5,{...c,firstLossDelay:60,firstLossSpread:20}),70);
});

test('the surface casualty settles, founders after a seeded delay, and takes the remaining survivors when lost',async()=>{
 const {hash01}=await import('../src/environment.js');
 const {bottom}=await import('../src/mechanics.js');
 for(const seed of [0,1972,4294967295]){
  const s=createGame('surface-rescue',seed),site=s.site;s.ships=[];
  assert.equal(site.depth,2);
  Object.assign(s,{x:site.x+500,y:site.y});
  const floor=bottom(site.x,site.y,s.environment.chartSeed)-5;
  for(const age of [0,400,900,1100,1300]){
   s.time=age;updateOperation(s,.25);
   const expected=Math.min(floor,2+age/500+Math.max(0,age-(860+hash01(seed,820)*220))*.35);
   assert.equal(site.depth,expected,seed+' at '+age);
  }
  const lost=createGame('surface-rescue',seed);lost.ships=[];Object.assign(lost,{x:lost.site.x+500,y:lost.site.y});
  const aboard=lost.operation.remaining;
  for(let t=0;t<2000&&lost.site.depth<=15;t+=5){lost.time=t;updateOperation(lost,5);}
  assert.ok(lost.site.depth>15);
  assert.equal(lost.operation.remaining,0);
  if(aboard>0)assert.ok(lost.events.some(e=>e.text.startsWith('The casualty has gone under.')));
 }
 assert.ok(createGame('undersea-rescue',3).site.depth>15,'a disabled sub rests on the shelf and does not sink further');
});

test('a sinking casualty follows whatever sinking record it is given',async()=>{
 const {casualtyDepth,surfaceRescue}=await import('../src/rescue-operation.js');
 const sink=surfaceRescue.sinking;
 assert.equal(casualtyDepth(0,.5,sink,80),2);
 assert.equal(casualtyDepth(500,.5,sink,80),3);
 assert.equal(casualtyDepth(1070,.5,sink,80),2+1070/500+100*.35);
 assert.equal(casualtyDepth(5000,.5,sink,80),80,'it comes to rest on the seabed');
 assert.equal(casualtyDepth(100,0,{...sink,foundersAfter:50,foundersSpread:0,sinkRate:1},80),2+100/500+50);
});
