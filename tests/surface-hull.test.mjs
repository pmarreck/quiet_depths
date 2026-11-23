import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {surfaceHull} from '../src/surface-hull.js';
import {surfaceShip} from '../src/surface-ship.js';
import {damageWreck} from '../src/wrecks.js';
import {makeCarrier} from '../src/carrier-model.js';
import {createSubmarine} from '../src/submarine-model.js';
import {SUB_DESIGN as d} from '../src/hull-design.js';
import {founderingPose,submergedDepth,wreckVisible} from '../src/foundering.js';

function mesh(kind){return new T.Mesh(surfaceHull(T,kind),new T.MeshBasicMaterial());}
function firstHit(model,origin,direction){
 model.updateMatrixWorld(true);
 return new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction)).intersectObject(model,false)[0]?.point;
}
test('every surface hull has an outward-facing tapered entrance, flared sides and a rising forefoot',()=>{
 for(const kind of ['merchant','escort','fishing','carrier','launch']){
  const m=mesh(kind);m.geometry.computeBoundingBox();const b=m.geometry.boundingBox,half=(b.max.z-b.min.z)/2;
  const beam=z=>firstHit(m,[100,0,z],[-1,0,0]).x;
  assert.ok(beam(-.8*half)<beam(0)*.66,kind);
  assert.ok(firstHit(m,[100,b.max.y*.45,-half*.80],[-1,0,0]).x>beam(-half*.80),kind);
  const keel=z=>firstHit(m,[0,-100,z],[0,1,0]).y;
  assert.ok(keel(-half*.88)>keel(0),kind);
  assert.ok(firstHit(m,[0,b.max.y*.22,half*2],[0,0,-1]),kind+' stern');
  assert.ok(firstHit(m,[0,0,-half*2],[0,0,1]),kind+' bow');
 }
 const widthRatio=kind=>{const m=mesh(kind);return firstHit(m,[100,0,60],[-1,0,0]).x/firstHit(m,[100,0,0],[-1,0,0]).x;};
 assert.ok(widthRatio('escort')>widthRatio('merchant'));
 const launch=mesh('launch');assert.ok(firstHit(launch,[0,3,0],[0,-1,0]).y<.1,'recessed cockpit floor');
});
test('deck fittings distinguish the three ships and a wreck buckles without altering its sister ship',()=>{
 const merchant=surfaceShip(T,'merchant'),wreck=surfaceShip(T,'merchant'),escort=surfaceShip(T,'escort'),fishing=surfaceShip(T,'fishing');
 for(const [m,name] of [[merchant,'cargo derrick'],[escort,'radar array'],[fishing,'trawl gantry beam']])assert.ok(m.getObjectByName(name));
 const record=m=>Array.from(m.userData.hull.geometry.attributes.position.array);
 const intact=record(merchant);damageWreck(T,wreck,false);
 assert.notDeepEqual(record(wreck),intact);assert.deepEqual(record(merchant),intact);
 assert.ok(wreck.getObjectByName('signal mast').position.y<merchant.getObjectByName('signal mast').position.y);
 assert.equal(wreck.userData.wreck,true);
});

test('both raised masts are physically aft of the hatch and clear the forward bridge view',()=>{
 const boat=createSubmarine(T),eye=new T.Vector3(0,d.bridgeEye,d.bridgeZ);
 boat.updateMatrixWorld(true);
 for(const yaw of [-.4,0,.4]){
  const ray=new T.Raycaster(eye,new T.Vector3(Math.sin(yaw),0,-Math.cos(yaw)),0,10);
  assert.equal(ray.intersectObject(boat).length,0,'forward bridge sightline');
 }
 const scope=new T.Box3().setFromObject(boat.userData.mast);
 const snorkel=new T.Box3().setFromObject(boat.getObjectByName('snorkel'));
 assert.ok(scope.min.z>d.bridgeZ+d.bridgeRailRadius);
 assert.ok(snorkel.min.z>scope.max.z);
 assert.ok(Math.abs(snorkel.getCenter(new T.Vector3()).x)<.01);
});

test('each foundering surface model heels before trimming, exposes just one end, then passes completely underwater',()=>{
 for(const kind of ['merchant','escort','fishing','carrier']){
  const ship=kind==='carrier'?makeCarrier(T):surfaceShip(T,kind),body=ship.userData.body;
  const point=new T.Vector3();
  const profile=drop=>{
   const {pitch,roll}=founderingPose(kind,drop);
   ship.position.y=-drop;ship.rotation.set(pitch,0,roll,'YXZ');ship.updateMatrixWorld(true);
   let top=-Infinity;const ends=[-Infinity,-Infinity],hull=ship.userData.hull;
   body.traverseVisible(part=>{
    const pos=part.geometry?.attributes.position;if(!pos)return;
    for(let i=0;i<pos.count;i++){
     point.fromBufferAttribute(pos,i).applyMatrix4(part.matrixWorld);top=Math.max(top,point.y);
     if(part===hull&&Math.abs(pos.getZ(i))>50){
      const end=pos.getZ(i)<0?0:1;ends[end]=Math.max(ends[end],point.y);
     }
    }
   });
   return {pitch,roll,top,ends};
  };
  const initial=profile(0),listing=profile(.7);
  assert.equal(Math.abs(initial.roll)+Math.abs(initial.pitch),0,kind);
  assert.ok(Math.abs(listing.roll)>.005&&listing.pitch===0,kind);
  assert.ok([3,5,8,12,16,20,24].some(drop=>{
   const {pitch,ends}=profile(drop);
   return Math.abs(pitch)>.1&&Math.min(...ends)<-1&&Math.max(...ends)>1;
  }),kind+' should have one end clear of mean water level');
  const last=submergedDepth(kind);
  assert.ok(profile(last-.1).top>0&&profile(last+.1).top<0,kind+' replay waterline');
  const vessel={kind,hull:0,sunkAt:25,sinkDepth:last+5};
  assert.equal(wreckVisible(vessel,45),false);
  assert.equal(wreckVisible({...vessel,settled:true},45),false);
  assert.equal(wreckVisible({...vessel,settled:true},150),true);
  assert.equal(wreckVisible({...vessel,settled:true,sinkDepth:2},150),false);
 }
});
