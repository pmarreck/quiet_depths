import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame,save,restore} from '../src/sim.js';
import {MISSIONS,objectiveState,updateOperation,updateSurvey} from '../src/missions.js';
import {addScan,scanRate,surveyComplete,surveyCriteria} from '../src/wreck-survey.js';

// Reference behavior recorded from r83: strict range cutoffs, an inclusive
// speed band, sonar condition scaling, and identical results after a restore.
const SEEDS=[0,1972,4294967295];
const POSITIONS=[[99,31,true],[100,31,false],[99,32,false],[100,32,false]];
const SPEEDS=[[.5,true],[-.5,true],[3,true],[-3,true],[0,false],[.49,false],[3.01,false]];
const SONAR=[19,20,100];
const PRIOR_SCAN=10;

// Integer site coordinates keep offsets such as 100 m exact in floating point.
function surveyAt(seed,horizontal,vertical,speed,sonar){
 const s=createGame('survey',seed),site=s.site;
 Object.assign(site,{x:Math.round(site.x),y:Math.round(site.y),depth:Math.round(site.depth)});
 Object.assign(s,{x:site.x+horizontal,y:site.y,depth:site.depth-vertical,targetDepth:site.depth-vertical,speed,targetSpeed:speed});
 s.systems.sonar=sonar;s.ships=[];
 return s;
}

test('survey scanning follows the recorded range, speed and sonar boundaries, before and after a restore',()=>{
 let cases=0;
 for(const seed of SEEDS)for(const [horizontal,vertical,near] of POSITIONS)for(const [speed,steady] of SPEEDS)for(const sonar of SONAR){
  const label=JSON.stringify({seed,horizontal,vertical,speed,sonar});
  const s=surveyAt(seed,horizontal,vertical,speed,sonar);
  assert.ok(s.site.depth-vertical>=0,label+' fixture must stay below the surface');
  s.operation.scan=PRIOR_SCAN;
  const rate=sonar>=20?sonar/100:0,eligible=near&&steady&&rate>0;
  assert.equal(updateOperation(s,1),false,label);
  assert.equal(s.operation.active,eligible,label);
  assert.equal(s.operation.scan,eligible?PRIOR_SCAN+1*rate:PRIOR_SCAN,label);
  const resumed=restore(save(s));
  updateOperation(s,.25);updateOperation(resumed,.25);
  assert.deepEqual(resumed.operation,s.operation,label);
  cases++;
 }
 assert.equal(cases,252);
});

test('a lost ROV still lets a scan finish the survey with the same seeded find after a mid-scan restore',()=>{
 for(const seed of SEEDS){
  const s=surveyAt(seed,0,10,1,100);
  s.drone.mode='lost';s.operation.scan=44.75;
  const resumed=restore(save(s));
  for(const patrol of [s,resumed]){
   assert.equal(updateOperation(patrol,.25),true);
   assert.equal(patrol.operation.scan,45);
   assert.equal(patrol.operation.completed,true);
  }
  assert.ok(s.operation.find);
  assert.equal(resumed.operation.find,s.operation.find);
  assert.equal(updateOperation(s,.25),false,'a completed survey reports completion once');
 }
});

test('photographs taken before the ROV is lost still count, and scanning can finish the survey',()=>{
 const s=surveyAt(1972,0,10,0,100);
 s.operation.photoAngles=[0,120];s.drone.mode='lost';
 assert.equal(updateOperation(s,1),false,'two photographs do not complete the survey');
 s.speed=s.targetSpeed=1;
 for(let i=0;i<180&&!s.operation.completed;i++)updateOperation(s,.25);
 assert.equal(s.operation.completed,true);
 assert.equal(s.operation.scan,45);
 assert.deepEqual(s.operation.photoAngles,[0,120]);
});

test('the Elm mission definition supplies the survey criteria used by the briefing, rules and progress text',()=>{
 const survey=MISSIONS.find(m=>m.id==='survey');
 assert.deepEqual(survey.objective,{kind:'survey',scanSeconds:45,horizontalRange:100,verticalRange:32,slowestKnots:.5,fastestKnots:3,photographs:3,photoSeparation:55});
 assert.equal(surveyCriteria,survey.objective);
 const c=surveyCriteria,words={3:'three'};
 assert.ok(survey.desc.includes(`Pass within ${c.horizontalRange} m horizontally and ${c.verticalRange} m vertically at ${c.slowestKnots}–${c.fastestKnots} knots.`));
 assert.ok(survey.desc.includes(`Collect ${c.scanSeconds} seconds across as many passes as you need, or take ${words[c.photographs]} ROV photos`));
 assert.equal(survey.short,`Scan the wreck or take ${c.photographs} ROV photographs`);
 const state=objectiveState(surveyAt(1972,0,10,0,100));
 assert.equal(state.text,`0/${c.scanSeconds} s scan · 0/${c.photographs} camera angles`);
 assert.ok(state.advice.endsWith(`at ${c.slowestKnots}–${c.fastestKnots} kn, within ${c.horizontalRange} m horizontally and ${c.verticalRange} m vertically. Slow passes add up.`));
});

test('the field guide and player guide state the same survey criteria as the mission definition',async()=>{
 // Static documents cannot import the catalog. Edit them when the Elm values change.
 const c=surveyCriteria,words={3:'three'};
 const page=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 assert.ok(page.includes(`Survey at ${c.slowestKnots}–${c.fastestKnots} kn within ${c.horizontalRange} m and ${c.verticalRange} m of wreck depth for ${c.scanSeconds} seconds, or take ${words[c.photographs]} drone photographs from sides at least ${c.photoSeparation}° apart.`));
 const guide=await readFile(new URL('../README.md',import.meta.url),'utf8');
 assert.ok(guide.includes(`“Collect ${c.scanSeconds} seconds of close sonar scanning” means passing within ${c.horizontalRange} m horizontally and ${c.verticalRange} m vertically at ${c.slowestKnots}–${c.fastestKnots} kn.`));
 assert.ok(guide.includes(`The photographic route needs ${words[c.photographs]} views at least ${c.photoSeparation}° apart.`));
});

test('the survey rules follow whatever criteria record they are given',()=>{
 const c=surveyCriteria,pass={range:60,vertical:20,speed:1,sonar:100};
 assert.equal(scanRate(pass,c),1);
 assert.equal(scanRate(pass,{...c,horizontalRange:50}),0);
 assert.equal(scanRate(pass,{...c,verticalRange:16}),0);
 assert.equal(scanRate({...pass,speed:4},c),0);
 assert.equal(scanRate({...pass,speed:-4},{...c,fastestKnots:5}),1);
 assert.equal(scanRate({...pass,speed:1},{...c,slowestKnots:1.5}),0);
 assert.equal(addScan(29.9,1,1,{...c,scanSeconds:30}),30);
 assert.equal(surveyComplete({scan:30,photoAngles:[]},c),false);
 assert.equal(surveyComplete({scan:30,photoAngles:[]},{...c,scanSeconds:30}),true);
 assert.equal(surveyComplete({scan:0,photoAngles:[0,90]},c),false);
 assert.equal(surveyComplete({scan:0,photoAngles:[0,90]},{...c,photographs:2}),true);
 const s=surveyAt(1972,60,10,1,100);
 assert.equal(updateSurvey(s,1,{...c,horizontalRange:50}),false);
 assert.equal(s.operation.scan,0);assert.equal(s.operation.active,false);
 assert.equal(updateSurvey(s,1,{...c,scanSeconds:1}),true);
 assert.ok(s.operation.find);
});
