import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,photograph} from '../src/sim.js';
import {hash01} from '../src/environment.js';

// Reference behavior recorded from r93: the nearest qualifying merchant within
// the reticle's framing earns credit, once per ship, toward a seeded goal.
const radians=degrees=>degrees*Math.PI/180;
function scope(seed,ships){
 const s=createGame('recon',seed,{timeOfDay:'day',weather:'clear',changing:false});
 Object.assign(s,{x:0,y:0,heading:0,targetHeading:0,speed:0,targetSpeed:0,depth:10,targetDepth:10,scope:true,photoCooldown:0,photos:[]});
 s.ships=ships.map(([id,bearing,extra={}])=>({id,name:id,kind:'merchant',military:false,x:Math.sin(radians(bearing))*800,y:Math.cos(radians(bearing))*800,heading:90,speed:0,hull:100,alert:0,attack:999,flood:0,disabled:false,sinkDepth:0,...extra}));
 return s;
}

test('a merchant framed inside the reticle earns photographic credit, and others do not',()=>{
 for(const seed of [0,1972,4294967295]){
  const framed=scope(seed,[['framed',4.9]]);
  assert.equal(photograph(framed,0),true);assert.deepEqual(framed.photos,['framed']);
  assert.equal(photograph(scope(seed,[['wide',5.1]]),0),false,'outside the framing');
  assert.equal(photograph(scope(seed,[['wide',-5.1]]),0),false);
  assert.equal(photograph(scope(seed,[['passing',1,{incidental:true}]]),0),false,'passing traffic is not the briefed convoy');
  assert.equal(photograph(scope(seed,[['escort',1,{kind:'escort'}]]),0),false,'only merchants count');
  const pair=scope(seed,[['off',3],['center',-1]]);
  assert.equal(photograph(pair,0),true);assert.deepEqual(pair.photos,['center'],'only the ship nearest the reticle is credited');
  pair.photoCooldown=0;assert.equal(photograph(pair,-1),true);assert.deepEqual(pair.photos,['center'],'a ship counts once');
 }
});

test('the seeded photograph goal is two or three ships',()=>{
 const goals=new Set();
 for(let seed=1;seed<=200;seed++){
  const goal=createGame('recon',seed).patrol.photoGoal;
  assert.equal(goal,2+Math.floor(hash01(seed,24)*2),String(seed));
  goals.add(goal);
 }
 assert.deepEqual([...goals].sort(),[2,3]);
});

test('the Elm mission definition supplies the framing and goal used by the rule and the field guide',async()=>{
 const {MISSIONS}=await import('../src/missions.js');
 const {framed,photoCriteria,photoGoal}=await import('../src/recon-photos.js');
 const {readFile}=await import('node:fs/promises');
 const c=photoCriteria,recon=MISSIONS.find(m=>m.id==='recon');
 assert.deepEqual(recon.objective,{kind:'photographs',framingDegrees:5,fewestPhotos:2,goalSpread:2});
 assert.equal(c,recon.objective);
 assert.equal(framed(4.999,c),true);assert.equal(framed(-4.999,c),true);
 assert.equal(framed(5,c),false,'framing is strict');assert.equal(framed(-5,c),false);
 assert.equal(framed(7,{...c,framingDegrees:8}),true);
 assert.equal(photoGoal(0,c),2);assert.equal(photoGoal(.999,c),3);
 assert.equal(photoGoal(.999,{...c,fewestPhotos:4,goalSpread:3}),6);
 // Static documents cannot import the catalog. Edit them when the Elm values change.
 const page=await readFile(new URL('../src/index.html',import.meta.url),'utf8'),words={5:'five'};
 assert.ok(page.includes(`a merchant silhouette within ${words[c.framingDegrees]} degrees of the reticle also counts toward reconnaissance`));
});
