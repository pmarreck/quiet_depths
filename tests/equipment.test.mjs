import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,ping,restore,save,isVisible} from '../src/sim.js';
import {environmentAt} from '../src/environment.js';
import {damageDrone,hurt,deployDrone} from '../src/systems.js';
import {feedActive} from '../src/controls.js';
import {fireDeckGun} from '../src/combat.js';
import {dronePhotograph,updateOperation} from '../src/missions.js';
import {signalOpacity,drawSonarGlass,lensFilter} from '../src/instrument-damage.js';

function boat(mission='shadow'){
 const s=createGame(mission,36,{weather:'clear',timeOfDay:'day',changing:false});
 Object.assign(s,{heading:0,targetHeading:0,speed:0,targetSpeed:0,depth:0,targetDepth:0});
 return s;
}

test('old saves preserve damaged and destroyed parts, modern saves validate each ceiling',()=>{
 const s=boat();
 delete s.repairLimits;delete s.drone.repairLimits;
 s.systems.sonar=47;s.systems.periscope=0;s.drone.camera=0;s.drone.mobility=28;
 const old=restore(save(s));
 assert.equal(old.systems.sonar,47);assert.equal(old.repairLimits.sonar,100);assert.equal(old.repairLimits.periscope,0);
 assert.equal(old.drone.mobility,28);assert.equal(old.drone.repairLimits.mobility,100);assert.equal(old.drone.repairLimits.camera,0);
 for(const mutate of [x=>delete x.repairLimits.planes,x=>x.repairLimits=null,x=>x.drone.repairLimits.camera=101,x=>x.drone.camera=-2]){
  const bad=structuredClone(old);mutate(bad);assert.equal(restore(save(bad)),null);
 }
});

test('separate hull and dockside repair limits apply only to parts struck',()=>{
 const s=boat();s.ships=[];
 hurt(s,2,'collision','rudder');hurt(s,2,'collision','rudder');
 assert.equal(s.repairLimits.hull,72.25);assert.equal(s.repairLimits.rudder,72.25);assert.equal(s.repairLimits.engine,100);
 assert.equal(s.hull,96);const outer=s.outerHull;
 assert.ok(deployDrone(s));damageDrone(s,65,'collision');damageDrone(s,2,'collision');
 assert.deepEqual(s.drone.repairLimits,{hull:72.25,mobility:72.25,buoyancy:72.25,camera:72.25});
 s.drone.mode='stowed';s.drone.camera=0;s.repair=120;
 for(let i=0;i<5;i++)step(s,60);
 assert.equal(s.hull,96);assert.equal(s.outerHull,outer);
 assert.equal(s.drone.hull,72.25);assert.equal(s.drone.camera,0);
});

test('20 percent enables short-range observation and a slower deck station',()=>{
 for(const condition of [19.99,20,50,100]){
  const s=boat();const ship=s.ships[0];Object.assign(ship,{x:s.x,y:s.y+1700,kind:'merchant',hull:100});s.ships=[ship];s.contacts=[];
  s.systems.sonar=s.systems.periscope=s.systems.deckgun=condition;s.scope=true;
  assert.equal(ping(s),condition>=20);assert.equal(s.contacts.length,condition>=50?1:0);
  assert.equal(feedActive(s,'scope'),condition>=20);assert.equal(isVisible(s,ship,null,{...environmentAt(s),opticalRange:4000}),condition>=50);
  const fired=fireDeckGun(s,{bearing:0,elevation:0});
  assert.equal(fired,condition>=20);if(fired)assert.equal(s.gun.cooldown,25/condition);
 }
});

test('propulsion, steering and repairs lose authority at their specified boundaries',()=>{
 for(const health of [0,19,20,50,100]){
  const s=boat();s.ships=[];s.depth=s.targetDepth=30;s.systems.engine=health;s.targetSpeed=-4;step(s,45);
  assert.ok(Math.abs(s.speed+(health<20?0:4*health/100))<.001);
  s.systems.engine=100;s.systems.propeller=health;s.targetSpeed=14;step(s,60);assert.ok(Math.abs(s.speed-(health<20?0:14*health/100))<.001);
  s.speed=s.targetSpeed=0;assert.ok(deployDrone(s));s.drone.mobility=health;s.drone.targetSpeed=-3;s.drone.targetHeading=s.drone.heading+30;
  const heading=s.drone.heading;step(s,4);assert.equal(s.drone.heading===heading,health<20);
  assert.ok(Math.abs(s.drone.speed+(health<20?0:3*health/100))<.001);
  s.drone.mode='stowed';s.drone.camera=30;s.systems.crew=health;s.systems.oxygen=30;s.repair=120;step(s,5);
  assert.equal(s.systems.oxygen>30,health>0);assert.equal(s.drone.camera>30,health>0);
 }
});

test('survey scan and photographs respect the recording instrument',()=>{
 const s=boat('survey');Object.assign(s,{x:s.site.x+50,y:s.site.y,depth:s.site.depth,speed:1});
 s.systems.sonar=20;updateOperation(s,5);assert.equal(s.operation.scan,1);
 s.systems.sonar=19;updateOperation(s,5);assert.equal(s.operation.scan,1);
 Object.assign(s.drone,{mode:'remote',x:s.site.x,y:s.site.y-40,depth:s.site.depth,heading:0,camera:19});
 assert.equal(feedActive(s,'drone'),false);assert.equal(dronePhotograph(s).ok,false);
 s.drone.camera=20;assert.ok(feedActive(s,'drone'));assert.equal(dronePhotograph(s).ok,false);
 s.drone.camera=50;assert.equal(dronePhotograph(s).ok,true);
});

test('sonar damage adds fixed fractures and modulates signal brightness; flooded optics progressively blur',()=>{
 const cracks=health=>{let starts=0;drawSonarGlass({save(){},restore(){},beginPath(){},stroke(){},lineTo(){},moveTo(){starts++;}},600,300,health);return starts;};
 assert.deepEqual([100,80,50,20,0].map(cracks),[0,4,6,10,12]);
 assert.equal(signalOpacity(100,0,0,false),1);
 assert.ok(signalOpacity(25,0,1,false)<signalOpacity(75,0,1,false));
 assert.notEqual(signalOpacity(25,0,1,false),signalOpacity(25,0,3,false));
 assert.equal(signalOpacity(25,0,1,true),signalOpacity(25,0,3,true));
 assert.equal(lensFilter(100),'');assert.match(lensFilter(75),/blur\(1.25px\)/);assert.match(lensFilter(25),/blur\(3.75px\)/);
});


test('a surveillance patrol needs a working receiver within its remaining range',()=>{
 const s=boat();s.depth=s.targetDepth=35;
 const merchant=s.ships[0];Object.assign(merchant,{kind:'merchant',military:false,x:s.x+1000,y:s.y,speed:0});s.ships=[merchant];
 for(const [condition,expected] of [[19,0],[20,0],[50,1]]){
  s.systems.sonar=condition;step(s,1);assert.equal(s.trackTime,expected);
 }
});
