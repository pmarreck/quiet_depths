import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {createGame} from '../src/sim.js';
import {environmentAt} from '../src/environment.js';

// Rebase imports only: the browser vendor directory is copied beside source
// during the build. Exercise the unchanged renderer module under Node/Three.
async function browserModule(file){
 const url=new URL('../src/'+file,import.meta.url);
 const source=(await readFile(url,'utf8')).replace(/from '([^']+)'/g,(_,specifier)=>`from '${new URL(specifier.startsWith('./vendor/')?'../vendor/'+specifier.slice(9):specifier,url).href}'`);
 return import('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL='+file).toString('base64'));
}
const {UnderseaLife}=await browserModule('undersea.js');
const {CombatScene}=await browserModule('combat-scene.js');

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
