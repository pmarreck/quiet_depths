import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as controls from '../src/controls.js';
import {createGame} from '../src/sim.js';
import * as environment from '../src/environment.js';
import {save,restore} from '../src/sim.js';
import {launchTorpedo} from '../src/combat.js';
import * as uiGeometry from '../src/ui.js';
import {sonarReading} from '../src/contact-readings.js';
import {countContactRowReads} from './contact-row-probe.mjs';
import {readFile} from 'node:fs/promises';

test('every mission picker port has a browser adapter in the declared direction',async()=>{
 const elm=await readFile(new URL('../elm/MissionPicker.elm',import.meta.url),'utf8');
 const js=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 const declared=[...elm.matchAll(/^port (\w+)\s*:\s*(.+)$/gm)].map(([,name,signature])=>{
  const type=/\b(Cmd|Sub) msg$/.exec(signature);
  assert.ok(type,'unrecognized port signature for '+name);
  return name+'.'+(type[1]==='Cmd'?'subscribe':'send');
 });
 const used=[...js.matchAll(/\bmissionPicker\.ports\.(\w+)\.(\w+)\(/g)].map(([,name,action])=>name+'.'+action);
 assert.ok(declared.length>0);
 assert.deepEqual(new Set(used),new Set(declared));
});

test('refreshing stable contact rows takes linear key reads',async()=>{
 const config=JSON.parse(await readFile(new URL('../profiling.json',import.meta.url)));
 const {sizes,bounds}=config.cases.find(c=>c.name==='contact_rows');
 const samples=sizes.map(size=>countContactRowReads(size,1972));
 assert.ok(samples[0]>0&&sizes.length>=3);
 for(let i=1;i<sizes.length;i++){
  assert.equal(sizes[i],2*sizes[i-1]);
  const growth=samples[i]/samples[i-1];assert.ok(growth>=bounds[0]&&growth<=bounds[1]);
 }
});

test('sonar circles leave room for headers and bearing labels on short and tall screens',()=>{
 assert.equal(typeof uiGeometry.sonarLayout,'function');
 for(const [w,h] of [[320,242],[393,524],[662,221],[600,480],[800,650]]){
  const p=uiGeometry.sonarLayout(w,h,false);assert.ok(p.radius>=40);assert.ok(p.cx-p.radius-20>=0&&p.cx+p.radius+20<=w);assert.ok(p.cy-p.radius-20>=55);assert.ok(p.cy+p.radius+20<=h);
 }
 const tall=uiGeometry.sonarLayout(479,648);
 assert.ok(tall.radius*2>=400,'use the width available beside the unfolded portrait helm');
 assert.ok(tall.cx-tall.radius>=32,'reserve room for three-digit bearings');
});

test('hydrophone peaks wrap across the bow and stay inside the trace',()=>{
 const level=uiGeometry.hydrophoneStrength;
 assert.equal(level([],90),0);
 assert.equal(level([90],90),1);
 assert.ok(level([90],0)<.01);
 assert.equal(level([359],0),level([359],360));
 assert.equal(level([90,90],90),1);
});

test('patrol notices reflect simultaneous current conditions and retire individually',()=>{
 const s=createGame('recon',341);
 Object.assign(s,{time:60,depth:270,alert:70,repair:5,flood:2,lightning:[{x:s.x,y:s.y+1000,time:57}]});
 s.airSupport.status='arming';s.airSupport.launchAt=65;
 const notices=()=>uiGeometry.patrolNotices(s,true,false),ids=()=>notices().map(n=>n.id);
 assert.deepEqual(ids(),['pressure','flood','repair','detection','air','lightning']);
 assert.equal(notices()[0].critical,true);assert.match(notices()[4].text,/5 s/);
 s.airSupport.status='airborne';s.aircraft=[{hull:100,phase:'search'}];assert.equal(notices()[4].text,'Aircraft airborne');
 s.aircraft[0].phase='return';s.time=63;assert.deepEqual(ids(),['pressure','flood','repair','detection']);
 s.depth=30;s.alert=0;s.repair=0;s.flood=0;assert.deepEqual(ids(),[]);
 s.status='lost';s.flood=2;assert.deepEqual(ids(),[]);
});

test('a slider stop detent preserves slow orders beyond half a knot and leaves actual motion alone',()=>{
 const s=createGame('recon',4);s.drone.mode='remote';
 for(const view of ['scope','drone']){
  const vehicle=controls.helmFor(s,view);vehicle.speed=2;
  for(const value of [-.6,-.5,-.1,0,.1,.5,.6]){
   assert.ok(controls.setHelmOrder(s,{view},'speed',controls.throttleDetent(value)));
   assert.equal(vehicle.targetSpeed,Math.abs(value)<=.5?0:value);assert.equal(vehicle.speed,2);
  }
  assert.ok(controls.setHelmOrder(s,{view},'speed',.1));assert.equal(vehicle.targetSpeed,.1);
 }
});

test('a torpedo uses the aged observed track from the current boat position without reading live target truth',()=>{
 const s=createGame('recon',1972);Object.assign(s,{x:1000,y:2000,time:120,depth:12});
 const contact={id:'satellite-track',bearing:0,x:0,y:0,fix:{x:4000,y:1000,time:20,vx:10,vy:10,positionSigma:0,velocitySigma:.2,maneuverSigma:.01}};
 s.contacts=[contact];s.ships=[{id:contact.id,x:-99999,y:-99999,kind:'merchant'}];
 assert.equal(launchTorpedo(s,contact.id),true);assert.ok(Math.abs(s.projectiles.at(-1).orderedHeading-90)<1e-8);
 assert.equal(s.projectiles.at(-1).heading,s.heading,'a shot exits straight through the bow tube');
 const passive={...createGame(),contacts:[{id:'bearing-only',bearing:237}],ships:[]};assert.equal(launchTorpedo(passive,'bearing-only'),true);assert.equal(passive.projectiles.at(-1).orderedHeading,237);
});

test('closing the sonar range magnifies fixed contacts while leaving bearing-only spokes in place',()=>{
 assert.deepEqual(uiGeometry.SONAR_RANGES,[1500,3000,6000]);
 const radius=uiGeometry.sonarRangeFraction;
 assert.equal(radius(750,1500),.5);assert.equal(radius(750,3000),.25);
 assert.equal(radius(3100,3000),null);
 assert.equal(radius(null,1500),.78);assert.equal(radius(null,6000),.78);
 assert.equal(radius(0,1500),0);
});

test('sonar range and bearing use the same recorded point as the chart, including after own-boat movement',()=>{
 const boat={x:300,y:400,time:20};
 const passive={bearing:224,x:0,y:0,range:0};
 assert.deepEqual(sonarReading(boat,passive),{range:null,bearing:224});
 const legacy={...passive,x:300,y:500,range:350};
 assert.deepEqual(sonarReading(boat,legacy),{bearing:0,range:100});
 const ranged={...legacy,fix:{x:380,y:400,time:10,vx:2,vy:0,positionSigma:0,velocitySigma:.2,maneuverSigma:.01}};
 assert.deepEqual(sonarReading(boat,ranged),{bearing:90,range:100});
 assert.deepEqual(sonarReading({...boat,x:450},ranged),{bearing:270,range:50});
 assert.deepEqual(sonarReading({...boat,x:400},ranged),{bearing:224,range:0});
});

test('dragging right in orbit increases yaw, dragging up lowers the viewing angle',()=>{
 const orbit={yaw:0,pitch:0};
 controls.orbitDrag(orbit,50,-10);
 assert.ok(orbit.yaw>0);
 assert.ok(orbit.pitch<0);
});

test('heavy seas increase bounded optical motion while a paused observation stays repeatable',()=>{
 assert.equal(typeof environment.boatSurfacePose,'function');
 const calm=createGame('recon',1972,{timeOfDay:'day',weather:'clear',changing:false}),storm=createGame('recon',1972,{timeOfDay:'day',weather:'storm',changing:false});
 let calmPower=0,stormPower=0;
 for(let t=0;t<60;t+=.25){
  calm.time=storm.time=t;const a=environment.boatSurfacePose(calm),b=environment.boatSurfacePose(storm);
  for(const key of ['pitch','roll']){assert.ok(Number.isFinite(a[key])&&Number.isFinite(b[key]));assert.ok(Math.abs(b[key])<.1);calmPower+=a[key]**2;stormPower+=b[key]**2;}
  assert.deepEqual(environment.boatSurfacePose(storm),b);
 }
 assert.ok(stormPower>calmPower*2);
});
test('corrupted persisted image sources are rejected before gallery rendering',()=>{
 const s=createGame();s.photoArchive=[{id:1,source:'scope',image:'https://example.invalid/tracker',takenAt:0,caption:'corrupt'}];assert.equal(restore(save(s)),null);
});

test('chart can inspect a 100 m recovery area while keeping the zoom anchor invariant',()=>{
 const s=createGame(),chart={x:0,y:0,zoom:1,follow:true},w=393,h=480,anchor={x:113,y:170};
 const before=controls.chartWorldAt(chart,anchor.x,anchor.y,w,h,s);
 controls.zoomChart(chart,10000,anchor.x,anchor.y,w,h,s);
 const after=controls.chartWorldAt(chart,anchor.x,anchor.y,w,h,s);
 assert.ok(chart.zoom>=100);assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<1e-8);
 const scale=controls.chartTransform(chart,w,h,s).scale;assert.ok(100*scale>=300,'100 m occupies most of a phone view');
});
test('scope and binoculars have explicit larger zoom ceilings and shared bounded controls',()=>{
 assert.equal(typeof controls.opticalZoomLimit,'function');
 assert.ok(controls.opticalZoomLimit('scope')>=4);assert.ok(controls.opticalZoomLimit('tower')>=10);
 assert.equal(controls.opticalZoomLimit('drone'),1);
});
test('keyed contact updates retain a pressed target and its listener across changing telemetry',async()=>{
 let ui;try{ui=await import('../src/ui.js');}catch{}assert.ok(ui,'keyed UI updater must exist');
 const container={children:[],insertBefore(node,before){if(node.parentNode){const old=node.parentNode.children;old.splice(old.indexOf(node),1);}const i=before?this.children.indexOf(before):this.children.length;this.children.splice(i,0,node);node.parentNode=this;}};
 let created=0,clicks=0;
 const create=()=>{const node=new EventTarget();node.dataset={};node.serial=++created;node.remove=()=>{if(node.parentNode){const list=node.parentNode.children;list.splice(list.indexOf(node),1);node.parentNode=null;}};return node;};
 const update=(node,item)=>{node.range=item.range;};
 const items=[{id:'a',range:1000},{id:'b',range:2000}];
 ui.reconcileKeyedChildren(container,items,v=>v.id,create,update);
 const pressed=container.children[0];pressed.addEventListener('click',()=>clicks++);
 for(let i=0;i<100;i++)ui.reconcileKeyedChildren(container,items.map(v=>({...v,range:v.range+i})),v=>v.id,create,update);
 assert.equal(container.children[0],pressed);assert.equal(created,2);pressed.dispatchEvent(new Event('click'));assert.equal(clicks,1);
 ui.reconcileKeyedChildren(container,[items[1],items[0]],v=>v.id,create,update);assert.equal(container.children[1],pressed);assert.equal(created,2);
 ui.reconcileKeyedChildren(container,[items[0]],v=>v.id,create,update);assert.equal(container.children.length,1);assert.equal(container.children[0],pressed);
});
test('photo archive preserves captured evidence and bounds persistence without inventing legacy images',async()=>{
 let photos;try{photos=await import('../src/photos.js');}catch{}assert.ok(photos,'photo archive must exist');
 const s=createGame();assert.deepEqual(photos.photoArchive(s),[]);
 const original={source:'scope',image:'data:image/jpeg;base64,QUJD',takenAt:12,caption:'Unknown contact A1',bearing:42};
 const p=photos.recordPhoto(s,original);assert.ok(p);original.caption='changed after shutter';assert.equal(p.caption,'Unknown contact A1');
 for(let i=0;i<100;i++)photos.recordPhoto(s,{...original,takenAt:i});
 const archive=photos.photoArchive(s);assert.ok(archive.length<=24);assert.equal(new Set(archive.map(v=>v.id)).size,archive.length);
 const before=JSON.stringify(archive);assert.equal(photos.recordPhoto(s,{...original,image:'javascript:alert(1)'}),null);assert.equal(JSON.stringify(archive),before);
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(photos.photoArchive(restored),archive);
});
test('an exposure freezes pixels synchronously before a station switch can replace the camera frame',async()=>{
 const photos=await import('../src/photos.js');assert.equal(typeof photos.recordExposure,'function');const s=createGame();let frame='data:image/jpeg;base64,QUJD',reads=0;
 const photograph=photos.recordExposure(s,{source:'scope',takenAt:12,caption:'Shutter frame'},()=>{reads++;return frame;});frame='data:image/jpeg;base64,REVG';
 assert.equal(reads,1);assert.equal(photograph.image,'data:image/jpeg;base64,QUJD');assert.equal(photograph.takenAt,12);assert.equal(photos.photoArchive(s).length,1);
 assert.equal(photos.recordExposure(s,{source:'scope',takenAt:13},()=>null),null);assert.equal(photos.photoArchive(s).length,1);
});
test('loss effects cover every station and remain absent for a successful extraction',async()=>{
 let loss;try{loss=await import('../src/loss.js');}catch{}assert.ok(loss,'terminal presentation model must exist');
 for(const station of ['scope','sonar','chart','drone','tower','gun','photos']){const e=loss.lossPresentation({status:'lost',depth:100},2,station);assert.equal(e.active,true);assert.ok(e.red>0);assert.equal(e.cracks,true);assert.ok(e.bubbles>0);}
 for(const status of ['patrol','won','expired','compromised'])assert.equal(loss.lossPresentation({status},2,'scope').active,false);
});
