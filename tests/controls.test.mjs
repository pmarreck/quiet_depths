import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGame,step,deployDrone,save,restore,bearing} from '../src/sim.js';
import {relativeBearing,scopeBearing,feedActive,setHelmOrder,applyHelmKeys,steerDrone,droneCameraPitch,cameraEuler,chartTransform,chartWorldAt,panChart,zoomChart} from '../src/controls.js';
import {actionForKey,shortcutBindings,shortcutConflict} from '../src/shortcuts.js';
const live={view:'scope',paused:false,modal:false};
test('submarine keyboard orders change requests, never teleport actual controls',()=>{
 const s=createGame(),before={heading:s.heading,depth:s.depth,speed:s.speed};
 applyHelmKeys(s,live,new Set(['KeyW','KeyD','KeyC']),.2);
 assert.ok(s.targetSpeed>before.speed);assert.ok(s.targetHeading>before.heading);assert.ok(s.targetDepth>before.depth);
 assert.deepEqual({heading:s.heading,depth:s.depth,speed:s.speed},before);
 s.scope=false;step(s,1);assert.ok(s.heading>before.heading&&s.heading<=before.heading+1.7+1e-9);assert.ok(s.depth>before.depth&&s.depth<=before.depth+.7+1e-9);assert.ok(s.speed>before.speed&&s.speed<=before.speed+.35+1e-9);
});
test('paused, modal and terminal controls cannot change orders',()=>{
 for(const context of [{...live,paused:true},{...live,modal:true}]){const s=createGame(),before=save(s);applyHelmKeys(s,context,new Set(['KeyW','KeyD','Space','KeyC']),.2);for(const axis of ['heading','depth','speed'])assert.equal(setHelmOrder(s,context,axis,90),false);assert.equal(save(s),before);}
 const s=createGame();s.status='won';assert.equal(setHelmOrder(s,live,'heading',90),false);
});
test('space requests shallower water; C requests deeper; limits hold',()=>{
 const s=createGame();applyHelmKeys(s,live,new Set(['Space']),.2);assert.ok(s.targetDepth<12);applyHelmKeys(s,live,new Set(['KeyC']),.4);assert.ok(s.targetDepth>12);
 for(let i=0;i<1000;i++)applyHelmKeys(s,live,new Set(['Space','KeyS']),.2);assert.equal(s.targetDepth,0);assert.equal(s.targetSpeed,-4);
});
test('inactive optics and drone cannot provide feeds; drone helm cannot change the sub',()=>{
 const s=createGame();s.scope=false;assert.equal(feedActive(s,'scope'),false);s.scope=true;s.depth=30;assert.equal(feedActive(s,'scope'),false);assert.equal(feedActive(s,'drone'),false);
 const ctx={...live,view:'drone'};assert.equal(setHelmOrder(s,ctx,'heading',90),false);s.speed=s.targetSpeed=0;assert.ok(deployDrone(s));assert.equal(feedActive(s,'drone'),true);
 const h=s.heading,v=s.speed,d=s.depth;applyHelmKeys(s,ctx,new Set(['rovPitchDown','rovRight','rovFaster']),.2);assert.equal(s.heading,h);assert.equal(s.speed,v);assert.equal(s.depth,d);assert.ok(s.drone.targetSpeed>0);assert.notEqual(s.drone.targetHeading,s.drone.heading);assert.ok(s.drone.nosePitch<0);
 const heading=s.drone.heading;step(s,.25);assert.ok(Math.abs(relativeBearing(s.drone.heading,heading))<=3.01);assert.notEqual(s.drone.speed,s.drone.targetSpeed);
});
test('dragging the ROV feed steers only the ROV and keeps its separate speed order',()=>{
 const s=createGame();
 s.speed=s.targetSpeed=0;
 assert.ok(deployDrone(s));
 const context={...live,view:'drone'},d=s.drone;
 d.heading=d.targetHeading=358;
 const boatOrders=[s.targetHeading,s.targetDepth,s.targetSpeed],startDepth=d.depth;
 assert.equal(setHelmOrder(s,context,'speed',2.5),true);
 steerDrone(s,context,50,40);
 assert.ok(d.targetHeading<90,'a right drag turns starboard through north');
 assert.ok(d.nosePitch<0,'a down drag pitches the nose toward the seabed');
 assert.deepEqual([d.heading,d.depth,d.speed],[358,startDepth,0]);
 assert.equal(d.targetSpeed,2.5);
 steerDrone(s,context,-50,-40);
 assert.ok(Math.abs(d.targetHeading-358)<1e-9);
 assert.ok(Math.abs(d.targetDepth-startDepth)<1e-9);
 assert.ok(Math.abs(d.nosePitch)<1e-9);
 steerDrone(s,context,0,-99999);
 assert.equal(d.nosePitch,60);
 assert.deepEqual([s.targetHeading,s.targetDepth,s.targetSpeed],boatOrders);
 for(const blocked of [live,{...context,paused:true},{...context,modal:true}]){
  const before=save(s);
  steerDrone(s,blocked,40,40);
  assert.equal(save(s),before);
 }
 d.mode='return';
 const before=save(s);
 steerDrone(s,context,40,40);
 assert.equal(save(s),before);
});
test('ROV keyboard and swipes use the same inversion, hover attitude, thrust and all-stop',()=>{
 for(const inverted of [false,true]){
  const s=createGame('survey',47);s.speed=s.targetSpeed=0;assert.ok(deployDrone(s));
  const d=s.drone,ctx={...live,view:'drone',invertRovPitch:inverted},keys=shortcutBindings();
  const press=(...codes)=>applyHelmKeys(s,ctx,new Set(codes.map(code=>actionForKey(keys,code,'drone'))),.5);
  const depth=d.depth,heading=d.heading,subOrders=[s.targetDepth,s.targetHeading,s.targetSpeed];
  press('KeyW','KeyA');const up=d.nosePitch;assert.ok(inverted?up<0:up>0);assert.equal(d.targetHeading,(heading+350)%360);
  press('KeyS','KeyD');assert.ok(Math.abs(d.nosePitch)<1e-8);assert.ok(Math.abs(d.targetHeading-heading)<1e-8);
  steerDrone(s,ctx,0,-60);assert.ok(Math.abs(d.nosePitch-up)<1e-8);
  step(s,.5);assert.equal(d.depth,depth);assert.equal(d.speed,0);
  press('ArrowUp');step(s,2);assert.ok(inverted?d.depth>depth:d.depth<depth);
  press('Space','ArrowUp');assert.equal(d.targetSpeed,0);assert.equal(d.targetHeading,d.heading);assert.equal(d.targetDepth,d.depth);assert.equal(d.nosePitch,up);
  step(s,3);assert.equal(d.speed,0);press('ArrowDown');assert.ok(d.targetSpeed<0);
  assert.deepEqual([s.targetDepth,s.targetHeading,s.targetSpeed],subOrders);
  assert.equal(restore(save(s)).drone.nosePitch,up);
  const old=JSON.parse(save(s));delete old.drone.nosePitch;assert.equal(restore(JSON.stringify(old)).drone.nosePitch,null);
 }
});
test('ROV shortcuts can be remapped independently and legacy shared choices survive',()=>{
 const base=shortcutBindings(),custom=shortcutBindings({...base,rovPitchUp:'KeyI',rovLeft:'KeyQ'});
 assert.equal(actionForKey(custom,'KeyW','scope'),'KeyW');assert.equal(actionForKey(custom,'KeyW','drone'),undefined);
 assert.equal(actionForKey(custom,'KeyI','drone'),'rovPitchUp');assert.equal(actionForKey(custom,'KeyQ','drone'),'rovLeft');
 assert.equal(shortcutConflict(base,'rovFaster','KeyC'),undefined);
 assert.equal(shortcutConflict(base,'rovFaster','KeyF'),'KeyF');
 const migrated=shortcutBindings({KeyF:'ArrowUp',KeyW:'KeyI'});
 for(const view of ['scope','drone'])assert.equal(actionForKey(migrated,'ArrowUp',view),'KeyF');
 assert.equal(actionForKey(migrated,'KeyI','scope'),'KeyW');assert.equal(actionForKey(migrated,migrated.rovFaster,'drone'),'rovFaster');
 assert.deepEqual(shortcutBindings(migrated),migrated);
});
test('the ROV feed tilts in the direction of vertical movement and levels out when stopped',()=>{
 const level=droneCameraPitch(0);
 assert.ok(droneCameraPitch(1)<level);
 assert.ok(droneCameraPitch(-1)>0);
 assert.ok(Math.abs(droneCameraPitch(5))<Math.PI/4);
});
test('periscope bearing follows the hull while preserving its relative angle',()=>{
 const s=createGame();s.scopeAngle=155;const a=scopeBearing(s);s.heading=(s.heading+37)%360;assert.equal(relativeBearing(scopeBearing(s),a),37);assert.equal(s.scopeAngle,155);
});
test('every azimuth retains upright camera orientation (external matrix oracle)',()=>{
 for(let h=0;h<720;h++){const p=cameraEuler(h,-.012,.004),camera=new THREE.PerspectiveCamera();camera.rotation.set(p.x,p.y,p.z,p.order);const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),forward=new THREE.Vector3();camera.getWorldDirection(forward);assert.ok(up.y>.99,`up at ${h}`);assert.ok(forward.y<0,`pitch at ${h}`);assert.ok(Math.abs(forward.x-Math.sin(h*Math.PI/180)*Math.cos(.012))<.0001);}
});
test('heading-up sonar bearings rotate with the boat and preserve relative geometry',()=>{
 for(let h=0;h<360;h++){assert.equal(relativeBearing(h,h),0);assert.equal(relativeBearing((h+90)%360,h),90);assert.equal(relativeBearing((h+180)%360,h),180);assert.equal(relativeBearing((h+270)%360,h),270);}
});
test('chart world/screen round trips, pan and cursor-anchored zoom (metamorphic)',()=>{
 const boat={x:140,y:-890},chart={x:0,y:0,zoom:1,follow:true},w=800,h=600;
 for(const zoom of [.25,1,3,6]){chart.zoom=zoom;const t=chartTransform(chart,w,h,boat);for(const p of [{x:0,y:0},{x:3000,y:-2400}]){const screen={x:t.cx+p.x*t.scale,y:t.cy-p.y*t.scale};const back=chartWorldAt(chart,screen.x,screen.y,w,h,boat);assert.ok(Math.hypot(back.x-p.x,back.y-p.y)<1e-8);}}
 const cursor={x:231,y:193},before=chartWorldAt(chart,cursor.x,cursor.y,w,h,boat);zoomChart(chart,.5,cursor.x,cursor.y,w,h,boat);const after=chartWorldAt(chart,cursor.x,cursor.y,w,h,boat);assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<1e-8);assert.equal(chart.follow,false);
 const t=chartTransform(chart,w,h,boat);panChart(chart,50,-30,w,h,boat);const q=chartTransform(chart,w,h,boat);assert.ok(Math.abs(q.cx-t.cx-50)<1e-8);assert.ok(Math.abs(q.cy-t.cy+30)<1e-8);
});
test('extraction requires surfacing inside the pickup circle',()=>{
 const s=createGame();s.phase='extract';s.x=s.home.x;s.y=s.home.y;s.depth=s.targetDepth=12;s.speed=s.targetSpeed=0;step(s,.25);assert.equal(s.status,'patrol');s.depth=s.targetDepth=0;step(s,.25);assert.equal(s.status,'won');
});
test('legacy saves gain drone orders and a hull-relative scope without losing the patrol',()=>{
 const s=createGame();delete s.scopeAngle;for(const k of ['speed','targetSpeed','targetDepth','targetHeading'])delete s.drone[k];const old=JSON.stringify(s),r=restore(old);assert.ok(r);assert.equal(r.scopeAngle,0);assert.equal(r.drone.targetSpeed,0);assert.equal(r.drone.targetDepth,r.drone.depth);assert.equal(r.drone.targetHeading,r.drone.heading);
});
test('drone inertia and orders preserve time batching invariance',()=>{
 for(const dt of [1,5,20]){const a=createGame();a.scope=false;a.speed=a.targetSpeed=0;assert.ok(deployDrone(a));a.drone.targetHeading=20;a.drone.targetSpeed=8;a.drone.targetDepth=45;const b=structuredClone(a);step(a,dt);for(let i=0;i<dt*4;i++)step(b,.25);for(const k of ['x','y','speed','heading','depth','battery'])assert.ok(Math.abs(a.drone[k]-b.drone[k])<1e-8,k);}
});
