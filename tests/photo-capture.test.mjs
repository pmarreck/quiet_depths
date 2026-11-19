import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {planSatelliteCapture,satelliteCamera,captureSize,flipRgbaRows,captureSatellite,captureOptics} from '../src/photo-capture.js';

function packet(){return{id:'sat-1',area:{x:120,y:-240,size:10000},capturedAt:71,night:false,quality:1,coverage:1,weather:{id:'clear',cloud:.12,daylight:1,hour:12},sceneShips:[{id:'one',x:120,y:-240,heading:30,speed:6,kind:'merchant',hull:100},{id:'two',x:1120,y:1760,heading:130,speed:4,kind:'escort',hull:100}]};}
test('satellite plans use only a frozen surface DTO and never preserve mutable references',()=>{
 const p=packet();p.sceneShips.push({id:'submarine',x:0,y:0,kind:'sub',hull:100},{id:'sunk',x:0,y:0,kind:'merchant',hull:0});
 const before=JSON.stringify(p),plan=planSatelliteCapture(p);assert.equal(JSON.stringify(p),before);assert.deepEqual(plan.ships.map(v=>v.id),['one','two']);
 p.sceneShips[0].x=999999;p.area.x=999999;assert.equal(plan.ships[0].x,120);assert.equal(plan.area.x,120);assert.equal(plan.width,640);assert.equal(plan.height,640);
 const n=planSatelliteCapture({...packet(),night:true});assert.ok(n.ships.every(v=>v.kind==='light'));assert.ok(n.ships.every(v=>!('name'in v)&&!('military'in v)));
});
test('north-up photo coordinates agree with the actual Three.js orthographic projection',()=>{
 const plan=planSatelliteCapture(packet()),camera=satelliteCamera(plan,THREE);camera.updateMatrixWorld();
 for(const [dx,dy]of [[0,0],[1000,2000],[-5000,5000],[5000,-5000],[-2300,-4100]]){
  const point=new THREE.Vector3(plan.area.x+dx,0,-plan.area.y-dy).project(camera),x=(point.x+1)*plan.width/2,y=(1-point.y)*plan.height/2;
  assert.ok(Math.abs(x-(.5+dx/plan.area.size)*640)<1e-8);assert.ok(Math.abs(y-(.5-dy/plan.area.size)*640)<1e-8);
 }
});
test('translation changes the world footprint without changing positions inside the image',()=>{
 const base=packet(),a=planSatelliteCapture(base),ca=satelliteCamera(a,THREE);ca.updateMatrixWorld();
 for(const [dx,dy]of [[100,-300],[-1500,3000],[900,600]]){
  const b=planSatelliteCapture({...base,area:{...base.area,x:base.area.x+dx,y:base.area.y+dy},sceneShips:base.sceneShips.map(v=>({...v,x:v.x+dx,y:v.y+dy}))}),cb=satelliteCamera(b,THREE);cb.updateMatrixWorld();
  for(let i=0;i<a.ships.length;i++){const p=new THREE.Vector3(a.ships[i].x,0,-a.ships[i].y).project(ca),q=new THREE.Vector3(b.ships[i].x,0,-b.ships[i].y).project(cb);assert.ok(p.distanceTo(q)<1e-9);}
 }
});
test('capture dimensions preserve aspect ratio, never upscale, and bound the longest side',()=>{
 for(const width of [1,120,393,640,1280,4000])for(const height of [1,200,282,640,1900]){
  const out=captureSize(width,height);assert.ok(out.width<=640&&out.height<=640&&out.width<=width&&out.height<=height);assert.ok(out.width>=1&&out.height>=1);
  assert.ok(Math.abs(out.width/width-out.height/height)<=Math.max(1/width,1/height));
 }
 for(const [w,h]of [[0,10],[10,0],[NaN,10],[10,Infinity],[-2,10]])assert.equal(captureSize(w,h),null);
});
test('GPU row flipping preserves RGBA bytes and is its own inverse',()=>{
 for(const [width,height]of [[1,1],[3,2],[4,5]]){const input=Uint8Array.from({length:width*height*4},(_,i)=>i%256),before=input.slice(),flipped=flipRgbaRows(input,width,height);assert.deepEqual(input,before);assert.deepEqual([...flipRgbaRows(flipped,width,height)],[...input]);
  for(let x=0;x<width*4;x++)assert.equal(flipped[x],input[(height-1)*width*4+x]);
 }
});
function fakeScene(){
 const world=new THREE.Scene(),water=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial()),terrain=new THREE.Group(),hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight(),moon=new THREE.DirectionalLight(),live=new THREE.Group();
 water.position.set(10,20,30);terrain.visible=false;live.userData.id='live-truth';world.add(water,terrain,hemi,sun,moon,live);world.fog=new THREE.FogExp2(0x223344,.12);
 const uniforms={time:{value:12},origin:{value:new THREE.Vector2(1,2)},daylight:{value:.4},cloud:{value:.3},underwater:{value:1},fogColor:{value:new THREE.Color(0x123456)},fogDensity:{value:.2},sunDir:{value:new THREE.Vector3(1,2,3)},waveScale:{value:1},waveSpeed:{value:1},twilight:{value:0},flash:{value:0}};
 let target={original:true},clear=new THREE.Color(0x212121),alpha=.5,viewport=new THREE.Vector4(3,4,5,6),scissor=new THREE.Vector4(7,8,9,10),test=true;
 const renderer={autoClear:false,getContext:()=>({isContextLost:()=>false}),getRenderTarget:()=>target,setRenderTarget:v=>target=v,getClearColor:out=>out.copy(clear),getClearAlpha:()=>alpha,setClearColor:(v,a=alpha)=>{clear.set(v);alpha=a},getViewport:out=>out.copy(viewport),setViewport:v=>viewport.copy(v),getScissor:out=>out.copy(scissor),setScissor:v=>scissor.copy(v),getScissorTest:()=>test,setScissorTest:v=>test=v,clear(){},render(){assert.equal(live.visible,false,'live meshes must be suppressed');throw new Error('injected GPU failure')},readRenderTargetPixels(){throw new Error('unreachable')}};
 return{THREE,scene:world,water,terrain,hemi,sun,moon,waterUniforms:uniforms,renderer,makeShip:()=>new THREE.Group(),glowTexture:()=>null};
}
function stateOf(o){return{children:o.scene.children.map(c=>({uuid:c.uuid,visible:c.visible})),fog:o.scene.fog,water:o.water.position.toArray(),hemi:o.hemi.intensity,sun:o.sun.position.toArray(),sunIntensity:o.sun.intensity,moon:o.moon.intensity,uniforms:Object.fromEntries(Object.entries(o.waterUniforms).map(([k,v])=>[k,v.value?.toArray?.()??v.value?.getHex?.()??v.value])),target:o.renderer.getRenderTarget(),clear:o.renderer.getClearColor(new THREE.Color()).getHex(),alpha:o.renderer.getClearAlpha(),auto:o.renderer.autoClear,viewport:o.renderer.getViewport(new THREE.Vector4()).toArray(),scissor:o.renderer.getScissor(new THREE.Vector4()).toArray(),scissorTest:o.renderer.getScissorTest()};}
test('failed satellite rendering restores the full scene and renderer state',()=>{
 const ocean=fakeScene(),before=stateOf(ocean),s={ships:[{id:'live-ship',x:999,y:999}],time:999},simulation=JSON.stringify(s);
 assert.throws(()=>captureSatellite(ocean,s,packet()),/injected GPU failure/);assert.deepEqual(stateOf(ocean),before);assert.equal(JSON.stringify(s),simulation);
});
test('lost or absent rendering context returns no photograph and never fabricates one',()=>{
 const ocean=fakeScene();ocean.renderer.getContext=()=>({isContextLost:()=>true});assert.equal(captureSatellite(ocean,{},packet()),null);assert.equal(captureOptics(ocean),null);assert.equal(captureOptics(null),null);
});
test('temporary night lights never dispose the shared sprite geometry used by live ship lights',()=>{
 const shared=new THREE.Sprite().geometry;let disposals=0;const count=()=>disposals++;shared.addEventListener('dispose',count);
 try{const ocean=fakeScene();assert.throws(()=>captureSatellite(ocean,{}, {...packet(),night:true}),/injected GPU failure/);assert.equal(disposals,0);}finally{shared.removeEventListener('dispose',count);}
});
test('satellite illumination uses capture-time solar and opposite lunar directions',()=>{
 const ocean=fakeScene();ocean.sun.position.set(12,34,56);ocean.moon.position.set(78,90,12);
 ocean.renderer.render=()=>{assert.ok(ocean.sun.position.clone().add(ocean.moon.position).length()<1e-9,'lunar direction must not leak the live view time');throw new Error('checked capture lighting');};
 assert.throws(()=>captureSatellite(ocean,{},packet()),/checked capture lighting/);
});
test('an empty GPU readback returns no image and still restores the scene',()=>{
 const ocean=fakeScene(),before=stateOf(ocean);ocean.renderer.render=()=>{};ocean.renderer.readRenderTargetPixels=()=>{};
 assert.equal(captureSatellite(ocean,{},packet()),null);assert.deepEqual(stateOf(ocean),before);
});
test('a satellite exposure isolates sea appearance and releases its temporary material even on GPU failure',()=>{
 const ocean=fakeScene(),live=ocean.water.material;let disposed=false;
 ocean.renderer.render=()=>{assert.notEqual(ocean.water.material,live);ocean.water.material.addEventListener('dispose',()=>disposed=true);throw new Error('isolated sea exposure');};
 assert.throws(()=>captureSatellite(ocean,{},packet()),/isolated sea exposure/);assert.equal(ocean.water.material,live);assert.equal(disposed,true);
});
