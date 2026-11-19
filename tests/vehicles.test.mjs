import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,deployDrone,recallDrone,dropDepthCharge,save,restore,bottom} from '../src/sim.js';
import {propellerState,separation} from '../src/mechanics.js';
import {damageDrone,damageSystem} from '../src/systems.js';
import {feedActive} from '../src/controls.js';
import * as THREE from '../vendor/three.module.js';
import {capsuleContact,rad} from '../src/mechanics.js';

test('inspection drone can deploy at 180 m, but not while the submarine is fast',()=>{
 const s=createGame();s.depth=s.targetDepth=180;s.speed=s.targetSpeed=0;
 assert.equal(deployDrone(s),true);
 const fast=createGame();fast.speed=fast.targetSpeed=7;assert.equal(deployDrone(fast),false);
});
test('drone cannot travel through the pressure hull',()=>{
 const s=createGame();s.scope=false;s.heading=s.targetHeading=0;s.depth=s.targetDepth=60;s.speed=s.targetSpeed=0;deployDrone(s);
 Object.assign(s.drone,{x:s.x+7,y:s.y,depth:60,targetDepth:60,heading:270,targetHeading:270,speed:10,targetSpeed:10});
 step(s,2);assert.ok(s.drone.x-s.x>=5.6,'solid hull must stop the crossing');assert.ok(s.drone.hull<100,'impact must damage the drone');
});
test('link loss at more than 100 meters is permanent for this patrol',()=>{
 const s=createGame();s.speed=s.targetSpeed=0;deployDrone(s);s.drone.x=s.x+101;s.drone.y=s.y;s.drone.depth=s.depth;
 step(s,.25);assert.equal(s.drone.mode,'lost');s.drone.x=s.x;assert.equal(deployDrone(s),false);
});
test('stowed drone recharges gradually, using boat energy',()=>{
 const s=createGame(),control=structuredClone(s);s.drone.battery=50;
 step(s,20);step(control,20);assert.ok(s.drone.battery>50&&s.drone.battery<100);assert.ok(s.battery<control.battery);
});
test('100 m control radius includes depth, and cannot be bypassed by return mode',()=>{
 for(const mode of ['remote','return']){const s=createGame();s.speed=s.targetSpeed=0;deployDrone(s);Object.assign(s.drone,{x:s.x,y:s.y,depth:s.depth+101,mode});step(s,.25);assert.equal(s.drone.mode,'lost');}
});
test('battery alarm occurs once at 10%; exhausted drone cannot be relaunched',()=>{
 const s=createGame();s.speed=s.targetSpeed=0;deployDrone(s);s.drone.battery=10.001;step(s,.25);assert.ok(s.drone.lowAlarm);assert.equal(s.events.filter(e=>e.text.includes('BATTERY 10%')).length,1);step(s,3);assert.equal(s.events.filter(e=>e.text.includes('BATTERY 10%')).length,1);s.drone.battery=.001;step(s,.25);assert.equal(s.drone.mode,'lost');assert.equal(deployDrone(s),false);
});
test('drone pressure damage is independent of boat receipt and survives saving',()=>{
 const s=createGame();s.ships=[];s.speed=s.targetSpeed=0;s.depth=s.targetDepth=60;deployDrone(s);s.drone.x=s.x+85;s.drone.y=s.y;s.drone.depth=s.depth;
 dropDepthCharge(s,{x:s.drone.x,y:s.drone.y,depth:60,delay:.25});step(s,.75);assert.ok(s.drone.hull<30);const health=s.drone.hull,r=restore(save(s));assert.ok(r);step(r,.5);assert.equal(r.drone.hull,health);
});
test('onboard charging and repairs cost finite time; diesel supplies charging directly',()=>{
 const a=createGame(),b=structuredClone(a);for(const s of [a,b]){s.drone.battery=40;s.drone.hull=30;s.drone.camera=20;s.speed=s.targetSpeed=0;}b.engine='diesel';step(a,30);step(b,30);
 assert.ok(a.drone.hull>30&&a.drone.hull<100);assert.ok(a.drone.camera>20&&a.drone.camera<100);assert.equal(a.drone.battery,b.drone.battery);assert.ok(a.battery<92&&b.battery>92);
});
test('ballast moves an all-stop boat and a damaged ballast system cannot do the same',()=>{
 const a=createGame(),b=structuredClone(a);for(const s of [a,b]){s.ships=[];s.speed=s.targetSpeed=0;s.depth=60;s.targetDepth=80;}b.systems.ballast=0;step(a,30);step(b,30);assert.ok(a.depth>65);assert.equal(b.depth,60);assert.ok(a.planes===0&&a.ballast>0);assert.ok(a.depth<80);
});
test('depth convergence is stable in both directions across speeds without teleporting',()=>{
 for(const speed of [0,3,10])for(const target of [30,95]){const s=createGame();s.ships=[];s.speed=s.targetSpeed=speed;s.depth=60;s.targetDepth=target;step(s,.25);assert.ok(Math.abs(s.depth-60)<.1);for(let t=0;t<4;t++)step(s,60);assert.ok(Math.abs(s.depth-target)<1,`${speed} kn -> ${target}: ${s.depth}`);}
});
test('flooding exceeding pumps adds water, reduces buoyancy and can sink the boat',()=>{
 const s=createGame();s.ships=[];s.speed=s.targetSpeed=0;s.depth=s.targetDepth=90;s.flood=20;for(let t=0;t<5&&s.status==='patrol';t++)step(s,60);assert.equal(s.status,'lost');assert.ok(s.water>12);assert.ok(s.events.some(e=>e.text.includes('FLOODING ALARM')));
});
test('periscope loss is permanent; tower blanks as soon as the boat dives',()=>{
 const s=createGame();damageSystem(s,'periscope',100);assert.equal(s.scope,false);assert.equal(feedActive(s,'scope'),false);s.depth=0;assert.equal(feedActive(s,'tower'),true);s.depth=1.001;assert.equal(feedActive(s,'tower'),false);s.repair=120;step(s,30);assert.equal(s.systems.periscope,0);
});
test('a surface hull collision damages the boat and shears its mast',()=>{
 const s=createGame();s.depth=s.targetDepth=12;s.speed=s.targetSpeed=0;s.ships=[{...s.ships[2],x:s.x,y:s.y,heading:0,speed:15,alert:100}];step(s,.25);assert.ok(s.hull<100);assert.equal(s.systems.periscope,0);
});
test('prop RPM is proportional to signed boat speed; hydrostatic depth suppresses cavitation',()=>{
 assert.equal(propellerState(0,0).rpm,0);assert.equal(propellerState(8,20).rpm,2*propellerState(4,20).rpm);assert.equal(propellerState(-4,20).rpm,-propellerState(4,20).rpm);
 for(const speed of [4,8,12,17]){let last=1;for(let depth=0;depth<=280;depth+=5){const p=propellerState(speed,depth);assert.ok(p.cavitation<=last);last=p.cavitation;}}
 assert.ok(propellerState(12,5).cavitation>propellerState(12,180).cavitation);
});
test('drone damage has functional mobility, buoyancy and camera costs',()=>{
 const s=createGame();s.speed=s.targetSpeed=0;deployDrone(s);damageDrone(s,50,'test pressure wave');assert.equal(s.drone.hull,50);assert.ok(s.drone.mobility<100&&s.drone.buoyancy<100&&s.drone.camera<100);s.drone.targetSpeed=10;step(s,20);assert.ok(s.drone.speed<10);assert.ok(separation(s,s.drone)<=100||s.drone.mode==='lost');
});
test('pre-systems patrols migrate intact; corrupted subsystem data is rejected',()=>{
 const s=createGame();delete s.systems;for(const k of ['water','ballast','verticalSpeed','planes','rudder','pitch','propAngle','collisionCooldown','floodAlarm','towerAngle','towerPitch','cavitation','propRpm','site','operation','shells'])delete s[k];for(const k of ['hull','camera','mobility','buoyancy','verticalSpeed','collisionCooldown','lowAlarm','lostReason'])delete s.drone[k];assert.ok(restore(save(s)));const b=createGame();b.systems.rudder=null;assert.equal(restore(save(b)),null);
});
test('capsule collision distance agrees with Three.js nearest-segment geometry across headings',()=>{
 for(let heading=0;heading<360;heading+=3)for(const pitch of [-.12,0,.12]){const a=rad(heading),body={x:38,y:-19,depth:65,heading,pitch},axis=new THREE.Vector3(Math.sin(a)*Math.cos(pitch),Math.cos(a)*Math.cos(pitch),-Math.sin(pitch)),center=new THREE.Vector3(body.x,body.y,body.depth),start=center.clone().addScaledVector(axis,-27.5),end=center.clone().addScaledVector(axis,27.5),line=new THREE.Line3(start,end);
  for(let i=0;i<30;i++){const p={x:body.x+Math.sin(i*1.7)*35,y:body.y+Math.cos(i*.8)*35,depth:body.depth+Math.sin(i)*7},point=new THREE.Vector3(p.x,p.y,p.depth),oracle=5.7-point.distanceTo(line.closestPointToPoint(point,true,new THREE.Vector3())),hit=capsuleContact(p,body);assert.equal(!!hit,oracle>0);if(hit){assert.ok(Math.abs(hit.penetration-oracle)<1e-9);assert.ok(Math.abs(Math.hypot(hit.nx,hit.ny,hit.nd)-1)<1e-9);}}
 }
});
test('a sinking boat inside extraction cannot become a victory',()=>{
 const s=createGame();s.phase='extract';s.x=s.home.x;s.y=s.home.y;s.depth=s.targetDepth=0;s.water=70;s.speed=s.targetSpeed=0;step(s,.25);assert.equal(s.status,'lost');
});
test('damaged engines, rudders, sonar and repair crew have observable costs',()=>{
 const healthy=createGame(),damaged=structuredClone(healthy);for(const s of [healthy,damaged]){s.ships=[];s.depth=s.targetDepth=60;s.targetSpeed=14;s.targetHeading=150;s.hull=70;s.flood=2;s.repair=120;}
 Object.assign(damaged.systems,{engine:25,rudder:10,sonar:0,crew:5});step(healthy,60);step(damaged,60);assert.ok(damaged.speed<healthy.speed);assert.ok(Math.abs(damaged.heading-32)<Math.abs(healthy.heading-32));assert.ok(damaged.hull<healthy.hull);assert.ok(damaged.flood>healthy.flood);
});
