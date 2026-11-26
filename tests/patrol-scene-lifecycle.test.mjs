import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {createGame} from '../src/sim.js';
import {environmentAt} from '../src/environment.js';
import {initialOrbit,orbitVerticalFov} from '../src/controls.js';

// Rebase imports only: the browser vendor directory is copied beside source
// during the build. Exercise the unchanged renderer module under Node/Three.
async function browserModule(file){
 const url=new URL('../src/'+file,import.meta.url);
 const source=(await readFile(url,'utf8')).replace(/from '([^']+)'/g,(_,specifier)=>`from '${new URL(specifier.startsWith('./vendor/')?'../vendor/'+specifier.slice(9):specifier,url).href}'`);
 return import('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL='+file).toString('base64'));
}
const {UnderseaLife}=await browserModule('undersea.js');
const {CombatScene}=await browserModule('combat-scene.js');
const {Atmosphere}=await browserModule('atmosphere.js');

test('torpedoes and depth charges bloom at the impact, fade, and rewind with the patrol clock',()=>{
 const world=new Atmosphere(new THREE.Scene()),camera=new THREE.PerspectiveCamera(),s=createGame('recon',42);
 camera.position.set(15,-35,20);
 s.impacts=[{id:1,x:10,y:10,altitude:-35,time:4,kind:'torpedo'},
            {id:2,x:10,y:10,altitude:0,time:4,kind:'splash'}];
 s.blasts=[{id:1,x:20,y:12,depth:40,kind:'charge',exploded:true,explodedAt:4,delay:0,totalDelay:6,age:0}];
 const show=(time,underwater=true)=>{
  s.time=time;world.update(s,environmentAt(s),camera,underwater,time);
  return world.flashes.filter(g=>g.visible).map(g=>({
   point:g.position.toArray(),width:g.children[0].scale.x,intensity:g.children[0].material.opacity,
   color:g.children[0].material.color.getHex(),core:g.children[1].scale.x
  }));
 };
 assert.deepEqual(show(3.9),[]);
 const start=show(4),opening=show(4.35),tail=show(5);
 assert.deepEqual(opening.map(x=>x.point),[[10,-35,-10],[20,-40,-12]]);
 for(let i=0;i<2;i++){
  assert.ok(opening[i].width>2*start[i].width&&opening[i].core<opening[i].width);
  assert.equal(opening[i].color,0xff600b);assert.ok(tail[i].intensity<opening[i].intensity*.15);
 }
 assert.deepEqual(show(4.35),opening);assert.ok(world.blastLight.intensity>0);
 assert.deepEqual(show(5.2),[]);assert.equal(world.blastLight.intensity,0);
 assert.deepEqual(show(4.2,false),[],'deep flashes stay underwater');
 s.impacts[0].altitude=-2;s.blasts[0].exploded=false;
 const surface=show(4.2,false);assert.equal(surface.length,1);assert.ok(surface[0].point[1]>-2);
});

test('opening orbit frames the stern and the first seconds of an outgoing shot on phone and desktop',()=>{
 for(const heading of [0,82,219,347])for(const aspect of [382/580,393/852,669/867,16/9]){
  const boat={heading,depth:12},orbit=initialOrbit(boat);
  const camera=new THREE.PerspectiveCamera(orbitVerticalFov(aspect),aspect,.5,23000);
  const reach=orbit.distance*Math.cos(orbit.pitch);
  camera.position.set(reach*Math.sin(orbit.yaw),-boat.depth+orbit.distance*Math.sin(orbit.pitch),-reach*Math.cos(orbit.yaw));
  assert.ok(camera.position.y<0,'the submerged boat must be visible through water');
  camera.lookAt(0,-boat.depth,0);camera.updateMatrixWorld();
  const course=heading*Math.PI/180;
  for(const forward of [-35,32,80]){
   const screen=new THREE.Vector3(forward*Math.sin(course),-boat.depth,-forward*Math.cos(course)).project(camera);
   assert.ok(Math.abs(screen.x)<.98&&Math.abs(screen.y)<.98&&Math.abs(screen.z)<1,'stern, bow and outbound shot must be within the frame');
  }
 }
});

test('submerged torpedo bubbles fill the gap between consecutive trail samples',()=>{
 const combat=new CombatScene(new THREE.Scene(),null),s=createGame('recon',42);
 s.time=2;
 const path=[{x:0,y:0,depth:42,time:1.75},{x:6,y:0,depth:42,time:2}];
 s.projectiles=[{id:1,x:6,y:0,depth:42,heading:90,pitch:0,age:2,pingAge:99,path}];
 combat.update(s,environmentAt(s));
 const trail=combat.torpedoes.get(1).userData.bubbles.geometry;
 const x=Array.from({length:trail.drawRange.count},(_,i)=>trail.attributes.position.getX(i));
 assert.ok(x.some(v=>v>1&&v<3)&&x.some(v=>v>3&&v<5),'the wake must cross the space between samples');
});

test('the orbit locator marks either side from launch and freezes with the shot',()=>{
 const combat=new CombatScene(new THREE.Scene(),null),s=createGame('recon',42),env=environmentAt(s);
 s.projectiles=['player','enemy'].map((owner,id)=>({id,owner,x:id*30,y:40,depth:20,heading:0,pitch:0,age:.6,pingAge:99,path:[]}));
 combat.update(s,env,true);
 for(const model of combat.torpedoes.values()){
  const ring=model.userData.ring;assert.ok(ring.visible&&ring.material.depthTest);
  const radius=ring.scale.x;assert.ok(radius>1&&radius<4);
  combat.update(s,env,true);assert.equal(ring.scale.x,radius);
 }
 combat.update(s,env,false);
 for(const model of combat.torpedoes.values())assert.equal(model.userData.ring.visible,false);
});

test('an actual seeker ping paints a faint smooth expanding surface and goes dark between pulses',()=>{
 const combat=new CombatScene(new THREE.Scene(),null),s=createGame('recon',42),env=environmentAt(s);
 s.projectiles=['player','enemy'].map((owner,id)=>({id,owner,x:id*30,y:0,depth:32,heading:12,pitch:0,age:8,pingAge:.02,path:[]}));
 combat.update(s,env,true);
 for(const g of combat.torpedoes.values()){
  const r=g.userData.ring;assert.ok(r.visible&&r.material.transparent&&r.material.depthTest&&!r.material.depthWrite);
  assert.equal(r.material.wireframe,false);assert.ok(r.geometry.parameters.widthSegments>=32);
  assert.ok(r.material.opacity>0&&r.material.opacity<=.11);g.userData.earlySize=r.scale.x;g.userData.earlyOpacity=r.material.opacity;
 }
 for(const p of s.projectiles)p.pingAge=.26;combat.update(s,env,false);
 for(const g of combat.torpedoes.values()){
  const r=g.userData.ring;assert.ok(r.visible&&r.scale.x>g.userData.earlySize&&r.material.opacity<g.userData.earlyOpacity);
 }
 for(const p of s.projectiles)p.pingAge=.4;combat.update(s,env,true);
 for(const g of combat.torpedoes.values())assert.equal(g.userData.ring.visible,false);
});

test('rain geometry is reproducible and a paused frame holds the lightning display clock',()=>{
 const make=()=>new Atmosphere(new THREE.Scene());
 const a=make(),b=make(),s=createGame('survey',712,{weather:'rain'});
 assert.deepEqual(a.rain.geometry.attributes.position.array,b.rain.geometry.attributes.position.array);
 assert.deepEqual(a.rain.geometry.attributes.seed.array,b.rain.geometry.attributes.seed.array);
 s.lightning=[{id:1,seed:9,x:0,y:0,height:800,time:0}];
 const e=environmentAt(s),camera=new THREE.PerspectiveCamera();
 const render=(o,now)=>o.update(s,e,camera,false,now);
 assert.equal(render(a,10),render(b,30));
 s.time=2;const next=render(a,10.125);
 assert.equal(next,render(b,30.125));assert.equal(next,render(a,10.125));assert.ok(next>0&&next<1);
});

test('both sides have submerged torpedo meshes with counter-rotating screws and lingering trails',()=>{
 const combat=new CombatScene(new THREE.Scene(),null),s=createGame('recon',42),env=environmentAt(s);
 s.projectiles=['enemy','player'].map((owner,id)=>({
  id,owner,x:7,y:100*id,depth:30,heading:0,pitch:0,age:4,pingAge:1,path:[{x:7,y:100*id,depth:30,time:s.time}]
 }));
 combat.update(s,env);
 for(const shot of s.projectiles){
  const model=combat.torpedoes.get(shot.id),[front,rear]=model.userData.screws;
  assert.deepEqual(model.position.toArray(),[shot.x,-shot.depth,-shot.y]);
  assert.ok(model.visible&&model.parent===combat.root);assert.equal(model.userData.bubbles.geometry.drawRange.count,3);
  assert.ok(front.position.z>2.5&&rear.position.z>front.position.z);
  for(const screw of [front,rear]){
   const size=new THREE.Box3().setFromObject(screw).getSize(new THREE.Vector3());
   assert.ok(screw.children.length>=3&&size.x>.4&&size.x<.8&&size.z<.15);
  }
  assert.ok(front.scale.z*rear.scale.z<0,'opposite blade pitch');
  shot.age+=.01;
 }
 combat.update(s,env);
 for(const model of combat.torpedoes.values()){
  const [front,rear]=model.userData.screws,originalRear=Math.PI/3;
  assert.ok(front.rotation.z>0&&rear.rotation.z<originalRear);
  assert.ok(Math.abs(front.rotation.z+rear.rotation.z-originalRear)<1e-8);
  const angle=front.rotation.z;combat.update(s,env);assert.equal(front.rotation.z,angle);
 }
 s.projectiles=[];combat.update(s,env);
 for(const model of combat.torpedoes.values()){assert.equal(model.visible,false);assert.equal(model.userData.bubbles.parent,combat.root);}
 s.time+=11;combat.update(s,env);assert.equal(combat.torpedoes.size,0);
});

test('successive patrols replace their casualty scenery and keep updating when the next mission has no site',()=>{
 const scene=new THREE.Scene(),casualty=()=>{const group=new THREE.Group();group.name='casualty';return group;},life=new UnderseaLife(scene,casualty,casualty);
 for(const mission of ['surface-rescue','recon','survey','intercept','undersea-rescue','shadow']){
  const s=createGame(mission,1972,{timeOfDay:'day',weather:'clear',changing:false});
  for(let i=0;i<3;i++){s.time=i;assert.doesNotThrow(()=>life.update(s,environmentAt(s)),mission);}
  assert.equal(life.staticRoot.children.filter(node=>node.name==='casualty').length,s.site?1:0,mission);
  assert.ok(life.fish.instanceMatrix.array.every(Number.isFinite));
 }
});

test('fish stay outside the hull and sail as the boat crosses a school; whale and shark tails beat on different axes',()=>{
 const world=new THREE.Scene(),life=new UnderseaLife(world,()=>new THREE.Group(),()=>new THREE.Group());
 const s=createGame('recon',21);Object.assign(s,{x:0,y:0,depth:75,heading:90});life.update(s,environmentAt(s));
 const point=new THREE.Vector3(),rot=new THREE.Quaternion(),scale=new THREE.Vector3(),matrix=new THREE.Matrix4();
 const line=new THREE.Line3(),nearest=new THREE.Vector3();let close=0;
 for(let frame=1;frame<65;frame++){
  s.time=frame*.2;s.x=20*Math.sin(s.time*.3);s.y=24;s.depth=78;
  life.update(s,environmentAt(s));
  line.start.set(s.x-27.5,-s.depth,-s.y);line.end.set(s.x+27.5,-s.depth,-s.y);
  for(let i=0;i<life.fish.count;i++){
   life.fish.getMatrixAt(i,matrix);matrix.decompose(point,rot,scale);
   const clearance=point.distanceTo(line.closestPointToPoint(point,true,nearest));
   assert.ok(clearance>17);if(clearance<22)close++;
  }
 }
 assert.ok(close>100,'school repeatedly passes through the area occupied by the boat');
 const whale=life.animals.find(a=>a.name==='Humpback whale'),shark=life.animals.find(a=>a.name==='Reef shark');
 assert.ok(whale.userData.tail.rotation.x!==0&&whale.userData.tail.rotation.y===0);
 assert.ok(shark.userData.tail.rotation.y!==0&&shark.userData.tail.rotation.x===0);
});

test('octopus arms sit against the sloping triangles of the displayed seabed',async()=>{
 const {FLOOR_WIDTH,FLOOR_SEGMENTS}=await import('../src/seafloor.js');
 const geometry=new THREE.PlaneGeometry(FLOOR_WIDTH,FLOOR_WIDTH,FLOOR_SEGMENTS,FLOOR_SEGMENTS);
 const p=geometry.attributes.position,{bottom}=await import('../src/mechanics.js');
 for(let i=0;i<p.count;i++)p.setZ(i,-bottom(p.getX(i),p.getY(i)));
 const floor=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld();
 const life=new UnderseaLife(new THREE.Scene(),()=>new THREE.Group(),()=>new THREE.Group());
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
 for(const mission of ['survey','recon']){
  life.reset(createGame(mission,8234));life.root.updateMatrixWorld(true);
  const octopuses=life.staticRoot.children.filter(child=>child.name==='Octopus');
  assert.equal(octopuses.length,3);
  for(const octopus of octopuses){
   const arms=octopus.children.filter(child=>child.geometry.type==='TubeGeometry');
   assert.equal(arms.length,8);
   for(const arm of arms){
    const tip=arm.localToWorld(arm.geometry.parameters.path.getPoint(1));
    ray.set(new THREE.Vector3(tip.x,500,tip.z),down);
    const hit=ray.intersectObject(floor)[0];assert.ok(hit);
    assert.ok(Math.abs(tip.y-hit.point.y)<.20,'arm tip touches the rendered face within its tube thickness');
   }
  }
 }
});

test('the humpback stroke travels through its visible torso before reaching the tail',()=>{
 const world=new THREE.Scene(),life=new UnderseaLife(world,()=>new THREE.Group(),()=>new THREE.Group());
 const s=createGame('recon',73);s.x=450;s.y=-900;
 const whale=life.animals.find(a=>a.name==='Humpback whale');
 let torso;whale.traverse(o=>{if(o.isMesh&&o.material.vertexColors&&(!torso||o.geometry.attributes.position.count>torso.geometry.attributes.position.count))torso=o;});
 const positions=torso.geometry.attributes.position;
 const samples=[-.41,.08,.24,.31].map(z=>{
  let closest=0;for(let i=1;i<positions.count;i++)if(Math.abs(positions.getZ(i)-z)<Math.abs(positions.getZ(closest)-z))closest=i;
  return closest;
 });
 function shape(time){
  s.time=time;life.update(s,environmentAt(s));world.updateMatrixWorld(true);
  return samples.map(i=>{const p=torso.getVertexPosition(i,new THREE.Vector3());return whale.worldToLocal(torso.localToWorld(p)).y*whale.scale.y;});
 }
 const frames=Array.from({length:49},(_,i)=>shape(i*.18));
 const span=col=>Math.max(...frames.map(f=>f[col]))-Math.min(...frames.map(f=>f[col]));
 assert.ok(span(0)<.10,'head should stay steady');
 assert.ok(span(1)>.12&&span(2)>.65&&span(3)>1.2,'the back must flex over the stroke, even excluding the separate tail mesh');
 const peak=col=>frames.slice(0,24).reduce((best,f,i)=>f[col]>frames[best][col]?i:best,0);
 assert.notEqual(peak(1),peak(3),'maximum flex should travel down the torso');
 const sample=shape(3.5);assert.deepEqual(shape(3.5),sample);shape(7);assert.deepEqual(shape(3.5),sample);
});
