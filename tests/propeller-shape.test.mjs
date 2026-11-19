import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createSubmarine} from '../src/submarine-model.js';
import {createGame} from '../src/sim.js';

test('the screw blades twist around an axial disc without a flower-like forward lean',()=>{
 const model=createSubmarine(THREE),prop=model.userData.prop;model.updateMatrixWorld(true);
 const blades=[];prop.traverse(o=>{if(o.isMesh&&o.geometry.type!=='SphereGeometry')blades.push(o);});
 assert.equal(blades.length,5);
 for(const blade of blades){
  const positions=blade.geometry.attributes.position,inner=[],outer=[];
  for(let i=0;i<positions.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(blade.matrixWorld),radius=Math.hypot(p.x,p.y),z=p.z-prop.position.z;
   if(radius>.45&&radius<.8)inner.push(z);if(radius>1.6)outer.push(z);
  }
  assert.ok(inner.length&&outer.length,'each blade reaches from its hub to its tip');
  const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
  assert.ok(Math.abs(mean(inner)-mean(outer))<.12,'radial blade centerline stays in the screw disc, rather than leaning forward');
  const zSpan=Math.max(...outer)-Math.min(...outer);assert.ok(zSpan>.08,'the blade tip has actual screw pitch, rather than a flat petal');
 }
});

test('the propeller shares a neutral hull finish and cross-shaped control surfaces remain ahead of it',()=>{
 const model=createSubmarine(THREE),hull=model.userData.hull,prop=model.userData.prop;model.updateMatrixWorld(true);
 prop.traverse(o=>{if(o.isMesh){assert.ok(o.material.color.equals(hull.material.color));assert.ok(o.material.metalness<=.1,'warm lighting must not turn the dark screw bronze');}});
 for(const part of [model.userData.rudder,model.userData.aftplanes]){
  const box=new THREE.Box3().setFromObject(part);assert.ok(box.max.z<prop.position.z-.2,'rudder and horizontal planes sit ahead of the screw');
 }
 const rudderSize=new THREE.Box3().setFromObject(model.userData.rudder).getSize(new THREE.Vector3());
 assert.ok(rudderSize.y>7&&rudderSize.x<1,'the paired vertical rudder has a thin hydrofoil profile');
});

test('thin stern and sail foils have outward surface normals for lighting and face culling',()=>{
 const model=createSubmarine(THREE);
 for(const [part,vertical] of [[model.userData.foreplanes,false],[model.userData.aftplanes,false],[model.userData.rudder,true]])part.traverse(mesh=>{
  if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;let samples=0;
  for(let i=0;i<p.count;i++){
   const thickness=vertical?p.getX(i):p.getY(i),normal=vertical?n.getX(i):n.getY(i);
   if(Math.abs(p.getZ(i))<.6&&Math.abs(thickness)>.06){assert.ok(thickness*normal>0,'foil faces must face out into the water');samples++;}
  }
  assert.ok(samples>0,'test samples the thick part of the hydrofoil rather than only its edges');
 });
});

test('the ROV cable is attached at both ends, changes with water motion, and stays within a bounded sag',async()=>{
 let module;try{module=await import('../src/tether.js');}catch{}assert.ok(module,'the cable must use shared tested attachment geometry');
 const s=createGame('recon',13,{weather:'storm'});Object.assign(s,{x:113,y:-57,depth:60,heading:47,pitch:.1});Object.assign(s.drone,{mode:'remote',x:145,y:-34,depth:67,heading:220});
 const points=module.tetherPoints(s,0),later=module.tetherPoints(s,1);assert.equal(points.length,48);assert.equal(later.length,48);
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(s.x,-s.depth,-s.y),new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch,-s.heading*Math.PI/180,0,'YXZ')),new THREE.Vector3(1,1,1));
 const anchor=new THREE.Vector3(4.65,-2,0).applyMatrix4(matrix),first=points[0];
 assert.ok(Math.hypot(first.x-anchor.x,first.y+anchor.z,first.depth+anchor.y)<1e-8,'hull endpoint follows heading and pitch exactly');
 const a=s.drone.heading*Math.PI/180,end={x:s.drone.x+Math.cos(a)*.35-Math.sin(a)*1.1,y:s.drone.y-Math.sin(a)*.35-Math.cos(a)*1.1,depth:s.drone.depth+.2};
 const last=points.at(-1);assert.ok(Math.hypot(last.x-end.x,last.y-end.y,last.depth-end.depth)<1e-8,'ROV endpoint sits on the chassis behind the lens');
 assert.deepEqual(points[0],later[0]);assert.deepEqual(points.at(-1),later.at(-1));
 assert.ok(points.some((p,i)=>Math.hypot(p.x-later[i].x,p.y-later[i].y,p.depth-later[i].depth)>.01),'water/current motion changes intermediate cable points');
 for(let i=0;i<points.length;i++){const f=i/(points.length-1),linear=first.depth+(last.depth-first.depth)*f;assert.ok(Math.abs(points[i].depth-linear)<3.2,'no implausibly long vertical drop');}
 s.drone.mode='stowed';assert.deepEqual(module.tetherPoints(s,1),[]);s.drone.mode='lost';assert.deepEqual(module.tetherPoints(s,1),[]);
});
