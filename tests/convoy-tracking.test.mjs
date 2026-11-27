import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,save,restore} from '../src/sim.js';
import {hash01} from '../src/environment.js';

// Reference behavior recorded from r92 through whole simulation ticks.
function shadowing(seed,{depth=40,speed=0,range=3000,sonar=100,ship={}}={}){
 const s=createGame('shadow',seed);
 Object.assign(s,{x:0,y:0,heading:0,targetHeading:0,speed,targetSpeed:speed,depth,targetDepth:depth,verticalSpeed:0,scope:false});
 s.systems.sonar=sonar;s.trackTime=0;
 s.ships=[{id:'tracked',name:'Tracked',kind:'merchant',military:false,x:range,y:0,heading:90,speed:0,hull:100,alert:0,attack:999,flood:0,disabled:false,sinkDepth:0,...ship}];
 return s;
}
const tracked=(s,dt=.25)=>{const before=s.trackTime;step(s,dt);return s.trackTime-before;};

test('quiet, deep tracking within listening range accumulates time, and nothing else does',()=>{
 for(const seed of [0,1972,4294967295]){
  assert.equal(tracked(shadowing(seed)),.25,'quiet and deep inside 4 km');
  assert.equal(tracked(shadowing(seed,{range:3990})),.25);
  assert.equal(tracked(shadowing(seed,{range:4010})),0,'beyond 4 km');
  assert.equal(tracked(shadowing(seed,{depth:14.5})),0,'too shallow');
  assert.equal(tracked(shadowing(seed,{depth:15.5})),.25);
  assert.equal(tracked(shadowing(seed,{speed:10})),0,'too loud');
  assert.equal(tracked(shadowing(seed,{sonar:50,range:1990})),.25,'damaged sonar listens to half range');
  assert.equal(tracked(shadowing(seed,{sonar:50,range:2010})),0);
  assert.equal(tracked(shadowing(seed,{sonar:19})),0,'a failed sonar hears nothing');
  assert.equal(tracked(shadowing(seed,{ship:{incidental:true}})),0,'passing traffic is not the convoy');
  assert.equal(tracked(shadowing(seed,{ship:{kind:'escort'}})),0,'only merchants count');
  assert.equal(tracked(shadowing(seed,{ship:{hull:0}})),0,'a sunk ship cannot be tracked');
  const s=shadowing(seed);step(s,1);
  const resumed=restore(save(s));step(s,1);step(resumed,1);
  assert.equal(resumed.trackTime,s.trackTime);assert.equal(s.trackTime,2);
 }
});

test('the seeded tracking goal is 150 to 240 seconds in 30-second steps',()=>{
 const goals=new Set();
 for(let seed=1;seed<=200;seed++){
  const goal=createGame('shadow',seed).patrol.trackGoal;
  assert.equal(goal,150+30*Math.floor(hash01(seed,25)*4),String(seed));
  goals.add(goal);
 }
 assert.deepEqual([...goals].sort((a,b)=>a-b),[150,180,210,240]);
});

test('the Elm mission definition supplies the tracking criteria, and the rule follows them exactly',async()=>{
 const {MISSIONS}=await import('../src/missions.js');
 const {trackingConvoy,trackingCriteria,trackingGoal}=await import('../src/convoy-tracking.js');
 const c=trackingCriteria,shadow=MISSIONS.find(m=>m.id==='shadow');
 assert.deepEqual(shadow.objective,{kind:'track',listeningRange:4000,quieterThan:27,deeperThan:15,shortestGoal:150,goalStep:30,goalSteps:4});
 assert.equal(c,shadow.objective);
 assert.ok(shadow.desc.includes(`inside ${c.listeningRange/1000} km`));
 const merchant={x:0,y:3999.99,kind:'merchant',hull:100};
 const at=(changes={},ship={})=>trackingConvoy({x:0,y:0,noise:26.99,depth:15.01,systems:{sonar:100},ships:[{...merchant,...ship}],...changes},c);
 assert.equal(at(),true);
 assert.equal(at({noise:27}),false,'noise limit is strict');
 assert.equal(at({depth:15}),false,'depth limit is strict');
 assert.equal(at({},{y:4000}),false,'range limit is strict');
 assert.equal(at({systems:{sonar:20}},{y:799.99}),true);
 assert.equal(at({systems:{sonar:20}},{y:800}),false);
 // The rule and goal follow whatever record they are given.
 assert.equal(trackingConvoy({x:0,y:0,noise:30,depth:16,systems:{sonar:100},ships:[merchant]},{...c,quieterThan:31}),true);
 assert.equal(trackingConvoy({x:0,y:0,noise:20,depth:16,systems:{sonar:100},ships:[merchant]},{...c,listeningRange:3000}),false);
 assert.equal(trackingGoal(.99,c),240);assert.equal(trackingGoal(0,c),150);
 assert.equal(trackingGoal(.99,{...c,shortestGoal:60,goalStep:10,goalSteps:3}),80);
});
