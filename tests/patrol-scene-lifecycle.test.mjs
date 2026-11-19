import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {createGame} from '../src/sim.js';
import {environmentAt} from '../src/environment.js';

// Rebase imports only: the browser vendor directory is copied beside source
// during the build. Exercise the unchanged renderer module under Node/Three.
const sourceUrl=new URL('../src/undersea.js',import.meta.url);
const source=(await readFile(sourceUrl,'utf8')).replace(/from '([^']+)'/g,(_,specifier)=>`from '${new URL(specifier.startsWith('./vendor/')?'../vendor/'+specifier.slice(9):specifier,sourceUrl).href}'`);
const {UnderseaLife}=await import('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=quiet-depths-undersea.js').toString('base64'));

test('successive patrols replace their casualty scenery and keep updating when the next mission has no site',()=>{
 const scene=new THREE.Scene(),casualty=()=>{const group=new THREE.Group();group.name='casualty';return group;},life=new UnderseaLife(scene,casualty,casualty);
 for(const mission of ['surface-rescue','recon','survey','intercept','undersea-rescue','shadow']){
  const s=createGame(mission,1972,{timeOfDay:'day',weather:'clear',changing:false});
  for(let i=0;i<3;i++){s.time=i;assert.doesNotThrow(()=>life.update(s,environmentAt(s)),mission);}
  assert.equal(life.staticRoot.children.filter(node=>node.name==='casualty').length,s.site?1:0,mission);
  assert.ok(life.fish.instanceMatrix.array.every(Number.isFinite));
 }
});
