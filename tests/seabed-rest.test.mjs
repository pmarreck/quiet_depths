import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,save,restore} from '../src/sim.js';
import {keelLimit} from '../src/hull-contacts.js';
import {updateHostileTrack} from '../src/hostile-tracks.js';
import {environmentAt} from '../src/environment.js';
import {restingStealth,seabedWear,sweepClutter,touchdownChance,touchdownDamage,touchdownImpact} from '../src/seabed-rest.js';

// Resting on the bottom trades mobility for stealth. A gentle landing is safe,
// a hard one risks damage, and moving along the seabed wears the outer hull.

test('touchdown risk grows with impact speed from a safe landing to a certain hard one',()=>{
 assert.equal(touchdownChance(0),0);
 assert.equal(touchdownChance(.4),0);
 assert.equal(touchdownChance(2),1);
 assert.equal(touchdownChance(3.2),1);
 let previous=0;
 for(let impact=.4;impact<=2;impact+=.1){const chance=touchdownChance(impact);assert.ok(chance>=previous);previous=chance;}
 assert.ok(touchdownChance(1.2)>.3&&touchdownChance(1.2)<.7);
 assert.equal(touchdownDamage(.4),0);
 assert.ok(touchdownDamage(1)<touchdownDamage(2)&&touchdownDamage(2)<=touchdownDamage(3.2));
 assert.ok(touchdownDamage(2)>=15,'a 2 m/s landing is a heavy blow');
 // Driving into a bank counts as an impact as well as sinking onto it.
 assert.equal(touchdownImpact(.3,0),.3);
 assert.equal(touchdownImpact(.3,10),2);
 assert.equal(touchdownImpact(1.5,4),1.5);
});

test('the seabed wears the outer hull only while the sub moves along it',()=>{
 assert.equal(seabedWear(0,1),0);
 assert.equal(seabedWear(-0,10),0);
 assert.ok(seabedWear(3,1)>0);
 assert.equal(seabedWear(-3,1),seabedWear(3,1),'astern scrapes as well');
 assert.equal(seabedWear(3,2),2*seabedWear(3,1));
 assert.ok(seabedWear(3,60)<20,'wear accumulates slowly');
});

test('a stopped sub on the bottom is much harder to hear or find with a sweep',()=>{
 assert.equal(restingStealth(false,0),1);
 assert.equal(restingStealth(true,0),.25);
 assert.equal(restingStealth(true,.3),.25);
 assert.equal(restingStealth(true,1),1,'a moving sub makes its usual noise');
 assert.equal(sweepClutter(false,0),1);
 assert.equal(sweepClutter(true,0),.5);
 assert.equal(sweepClutter(true,2),1);
});

function aboveBottom(clearance,descent,speed=0){
 const s=createGame('recon',7);
 Object.assign(s,{x:1900,y:700,heading:0,targetHeading:0,speed,targetSpeed:speed,ships:[],scope:false});
 const floor=keelLimit(s,s.environment.chartSeed);
 assert.ok(floor>30&&floor<200,'fixture needs open water over a seabed');
 Object.assign(s,{depth:floor-clearance,targetDepth:floor+20,verticalSpeed:descent});
 return s;
}

test('a gentle landing rests on the bottom without damage, and staying still costs nothing',()=>{
 const s=aboveBottom(.1,.3);
 const hull=s.hull,outer=s.outerHull;
 step(s,1);
 assert.equal(s.bottomed,true);
 assert.equal(s.hull,hull);assert.equal(s.outerHull,outer);
 assert.ok(s.events.some(e=>e.text.startsWith('Resting on the seabed.')));
 for(let i=0;i<4;i++)step(s,15);
 assert.equal(s.bottomed,true);
 assert.equal(s.hull,hull);assert.equal(s.outerHull,outer);
 const resumed=restore(save(s));
 assert.equal(resumed.bottomed,true);
 step(s,1);step(resumed,1);
 assert.deepEqual(resumed,s);
});

test('moving along the bottom slowly wears the outer hull, and rising lifts the sub off',()=>{
 const s=aboveBottom(.1,.3);
 step(s,1);assert.equal(s.bottomed,true);
 const hull=s.hull,outer=s.outerHull;
 s.targetSpeed=4;
 for(let i=0;i<20;i++)step(s,1);
 assert.equal(s.bottomed,true);
 assert.ok(s.outerHull<outer,'scraping wears the outer hull');
 assert.ok(outer-s.outerHull<15,'the wear is gradual');
 assert.equal(s.hull,hull,'scraping does not breach the pressure hull');
 assert.ok(s.events.some(e=>e.text.startsWith('Hull scraping the seabed.')));
 s.targetSpeed=0;s.targetDepth=20;
 for(let i=0;i<60&&s.bottomed;i++)step(s,1);
 assert.equal(s.bottomed,false);
 assert.ok(s.events.some(e=>e.text.startsWith('Off the bottom.')));
});

test('seafloor collision at speed still causes damage',()=>{
 const s=aboveBottom(.1,2.6);
 const hull=s.hull;
 step(s,1);
 assert.ok(s.hull<hull,'a hard landing is certain to hurt');
 assert.equal(s.bottomed,true);
});

test('older saves without a seabed state restore off the bottom',()=>{
 const s=createGame('recon',7);
 const legacy=JSON.parse(save(s));delete legacy.bottomed;
 const resumed=restore(JSON.stringify(legacy));
 assert.ok(resumed);
 assert.equal(resumed.bottomed,false);
});

test('a hostile listener needs four times the signal to notice a bottomed, stopped sub',()=>{
 const listen=bottomed=>{
  const s=aboveBottom(.1,0);Object.assign(s,{bottomed,speed:0,targetSpeed:0,noise:40});
  const ship={id:'hunter',kind:'escort',name:'Hunter',x:s.x+1000,y:s.y,heading:270,speed:0,alert:0,depth:0};
  updateHostileTrack(s,ship,environmentAt(s),1);
  return ship;
 };
 const open=listen(false),resting=listen(true);
 assert.ok(open.report,'the open-water sub is heard at this noise and range');
 assert.equal(resting.report,undefined,'the bottomed sub stays below the listening threshold');
 assert.ok(resting.alert<open.alert);
});
