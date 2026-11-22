import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {surfaceHull} from '../src/surface-hull.js';
import {surfaceShip} from '../src/surface-ship.js';
import {damageWreck} from '../src/wrecks.js';

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
