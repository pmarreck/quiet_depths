import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,contact,fire,save,restore} from '../src/sim.js';
import {estimateAt} from '../src/track-estimates.js';

// A player's torpedo runs out along its ordered gyro course before it starts a
// search circle. The seeker still listens during the run, so a target beyond
// seeker range is acquired on the way instead of being abandoned at arming.
// Geometry uses compass bearings directly, independently of production helpers.
const radians=degrees=>degrees*Math.PI/180;
const flat=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const TORPEDO_SPEED=24,TICK=.25;

function ocean(seed=31){
 const s=createGame('recon',seed);
 Object.assign(s,{x:0,y:0,heading:0,targetHeading:0,speed:0,targetSpeed:0,depth:14,targetDepth:14,verticalSpeed:0,scope:false,site:null,operation:null,ships:[],contacts:[]});
 return s;
}
function vessel(id,bearing,range,extra={}){
 return {id,name:id,kind:'merchant',military:true,x:Math.sin(radians(bearing))*range,y:Math.cos(radians(bearing))*range,heading:270,speed:0,hull:100,alert:0,attack:999,noise:100,...extra};
}
function headingError(a,b){return Math.abs((a-b+540)%360-180);}

test('a torpedo fired at a visual fix beyond seeker range holds its course, acquires the target and sinks it',()=>{
 // Reported case: a selected merchant about 2.7 km ahead at bearing 343.
 const s=ocean(),target=vessel('ironwood',343,2700);s.ships=[target];
 contact(s,target,'visual');assert.ok(s.contacts[0].fix,'fixture requires a measured fix');
 assert.equal(fire(s,'ironwood'),true);
 const p=s.projectiles[0];
 let searchedBeforeLock=false,locked=false;
 for(let t=0;t<150&&target.hull>0&&s.projectiles.includes(p);t+=TICK){
  step(s,TICK);
  if(p.lock==='ironwood')locked=true;
  if(!locked&&p.searchAge>0)searchedBeforeLock=true;
 }
 assert.equal(searchedBeforeLock,false,'the torpedo must not circle before it reaches the target range');
 assert.equal(locked,true,'the seeker must acquire the selected target during its run');
 assert.equal(target.hull,0);
});

test('a bearing-only shot runs straight down the bearing long enough to find a distant target',()=>{
 const s=ocean(),target=vessel('distant',0,2600);s.ships=[target];
 s.contacts=[{id:'distant',label:'A1',kind:'merchant',bearing:0,range:0,confidence:0,age:0,identified:false,method:'passive',x:0,y:0}];
 assert.equal(fire(s,'distant'),true);
 const p=s.projectiles[0];
 for(let t=0;t<150&&target.hull>0&&s.projectiles.includes(p);t+=TICK){
  step(s,TICK);
  if(!p.lock)assert.equal(p.searchAge,0,'no search before acquisition at this range');
 }
 assert.equal(target.hull,0);
});

test('with nothing to hear, the search starts where the fix said the target would be',()=>{
 const s=ocean(),target=vessel('gone',20,2000);s.ships=[target];
 contact(s,target,'visual');
 const estimate=estimateAt(s.contacts[0],s.time);
 assert.equal(fire(s,'gone'),true);
 s.ships=[];
 const p=s.projectiles[0],runOut=flat(p.path[0],estimate);
 let started=null;
 while(s.projectiles.includes(p)&&started===null){
  const before=p.traveled;step(s,TICK);
  if(p.searchAge>0)started=before;
  else if(p.age>4)assert.ok(headingError(p.heading,p.orderedHeading)<1e-6,'the run-out holds the ordered course');
 }
 assert.notEqual(started,null,'the torpedo must search before its run ends');
 assert.ok(started>=runOut-TORPEDO_SPEED*TICK&&started<=runOut+TORPEDO_SPEED*TICK,`search began after ${started} m; expected about ${runOut} m`);
});

test('a torpedo saved during its run-out resumes the same run, and older saves keep their recorded search',()=>{
 const s=ocean(),target=vessel('steady',0,2500);s.ships=[target];
 contact(s,target,'visual');assert.equal(fire(s,'steady'),true);
 for(let i=0;i<40;i++)step(s,TICK);
 assert.equal(s.projectiles[0].lock,null,'fixture saves before acquisition');
 const resumed=restore(save(s));
 assert.deepEqual(resumed.projectiles,s.projectiles);
 for(let i=0;i<20;i++){step(s,TICK);step(resumed,TICK);}
 assert.deepEqual(resumed.projectiles,s.projectiles);

 // An in-flight torpedo from an earlier build has no run-out distance. It
 // continues exactly as that build would have flown it.
 const legacy=JSON.parse(save(s));delete legacy.projectiles[0].runOut;
 const old=restore(JSON.stringify(legacy));
 assert.ok(old,'an earlier in-flight torpedo must restore');
 assert.equal(old.projectiles[0].runOut,0);
});
