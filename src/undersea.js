import {shelfOutcrops} from './coast.js';
import * as T from './vendor/three.module.js';
import {createSwimmer} from './marine-life.js';
import {surfaceHull} from './surface-hull.js';
import {schoolFishShape} from './school-fish.js';
import {bottom,rad,clamp,capsuleContact} from './mechanics.js';
import {hash01,surfaceHeight} from './environment.js';
import {floorSurface} from './seafloor.js';
import {founderingPose} from './foundering.js';

const material=(color)=>new T.MeshStandardMaterial({color,roughness:.72});
const up=new T.Vector3(0,1,0),groundNormal=new T.Vector3();
function groundOnChart(seed,object,x,north,yaw=0,lift=0){
 const {height,slopeX,slopeZ}=floorSurface(x,north,seed);
 groundNormal.set(-slopeX,1,-slopeZ).normalize();
 object.position.set(x,height,-north).addScaledVector(groundNormal,lift);
 object.quaternion.setFromUnitVectors(up,groundNormal);
 object.rotateY(yaw);
}
function avoidBoat(position,boat,size){
 if(Math.abs(position.x-boat.x)>70||Math.abs(position.z+boat.y)>70)return;
 const clearance=25+size;
 const hit=capsuleContact({x:position.x,y:-position.z,depth:-position.y},boat,28,16,clearance-16);
 if(!hit)return;
 const push=hit.penetration*hit.penetration/clearance;
 position.x+=hit.nx*push;position.y-=hit.nd*push;position.z-=hit.ny*push;
}
function ellipsoid(group,size,position,mat){const mesh=new T.Mesh(new T.SphereGeometry(1,12,8),mat);mesh.scale.set(...size);mesh.position.set(...position);group.add(mesh);return mesh;}
function diver(){
 const g=new T.Group(),suit=material(0x18292e),tank=material(0xd1b95e),skin=material(0xbd9b7d);
 ellipsoid(g,[.23,.24,.7],[0,0,0],suit);ellipsoid(g,[.2,.2,.22],[0,0,-.85],skin);ellipsoid(g,[.18,.2,.5],[0,.25,0],tank);
 const mask=new T.Mesh(new T.BoxGeometry(.3,.15,.08),material(0x9be8e0));mask.position.set(0,.03,-1.04);g.add(mask);
 const legs=[];for(const side of [-1,1]){const leg=new T.Group();leg.position.set(side*.17,0,.5);ellipsoid(leg,[.11,.12,.4],[0,0,.25],suit);const foot=new T.Mesh(new T.BoxGeometry(.22,.06,.5),tank);foot.position.z=.7;leg.add(foot);g.add(leg);legs.push(leg);ellipsoid(g,[.08,.09,.48],[side*.35,0,-.2],suit);}
 const passenger=new T.Group();ellipsoid(passenger,[.22,.22,.65],[0,-.5,0],material(0xba8e59));ellipsoid(passenger,[.19,.19,.22],[0,-.5,-.8],skin);g.add(passenger);g.userData.passenger=passenger;
 g.userData.legs=legs;return g;
}
export class UnderseaLife{
 constructor(scene,makeSub,makeShip){
  this.scene=scene;this.makeSub=makeSub;this.makeShip=makeShip;this.root=new T.Group();scene.add(this.root);this.lastState=null;
  const shape=schoolFishShape(),fishGeo=new T.BufferGeometry(),count=160;
  fishGeo.setAttribute('position',new T.Float32BufferAttribute(shape.positions,3));
  fishGeo.setAttribute('color',new T.Float32BufferAttribute(shape.colors,3));
  fishGeo.setIndex(shape.indices);fishGeo.computeVertexNormals();
  fishGeo.setAttribute('beatPhase',new T.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>hash01(104,i)*Math.PI*2),1));
  const fishSkin=new T.MeshStandardMaterial({vertexColors:true,roughness:.62,side:T.DoubleSide});
  this.swimClock={value:0};
  fishSkin.onBeforeCompile=shader=>{
   shader.uniforms.swimClock=this.swimClock;
   shader.vertexShader='uniform float swimClock; attribute float beatPhase;\n'+shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\ntransformed.x += .18 * smoothstep(-.1,1.,position.z) * sin(swimClock*6. + beatPhase - position.z*2.8);');
  };
  this.fish=new T.InstancedMesh(fishGeo,fishSkin,count);this.fish.instanceMatrix.setUsage(T.DynamicDrawUsage);this.root.add(this.fish);this.dummy=new T.Object3D();this.fish.frustumCulled=false;
  this.animals=Array.from({length:4},(_,i)=>{const a=createSwimmer(T,i===3);this.root.add(a);return a;});
  this.divers=Array.from({length:3},()=>{const d=diver();this.root.add(d);return d;});
  this.launches=Array.from({length:2},()=>{
   const g=new T.Group();
   g.add(new T.Mesh(surfaceHull(T,'launch'),new T.MeshStandardMaterial({vertexColors:true,roughness:.82})));
   for(const z of [-1,1]){const seat=new T.Mesh(new T.BoxGeometry(1.7,.1,.32),material(0x805e47));seat.position.set(0,.37,z);g.add(seat);}
   for(const [x,z] of [[-.3,-1],[.3,1]])ellipsoid(g,[.27,.54,.28],[x,.86,z],material(0xd5b67e));
   this.root.add(g);return g;
  });
  this.staticRoot=new T.Group();this.root.add(this.staticRoot);this.site=null;
 }
 reset(s){
  const ground=(...args)=>groundOnChart(s.environment?.chartSeed,...args);
  for(const child of [...this.staticRoot.children]){child.traverse(o=>{o.geometry?.dispose();if(o.isInstancedMesh)o.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});this.staticRoot.remove(child);}
  this.site=null;this.lastTime=null;this.fishPositions=[];this.anchor={x:s.site?.x??s.x,y:s.site?.y??s.y};this.lastState=s;
  if(s.site){this.site=s.site.kind==='sub'?this.makeSub():this.makeShip({kind:s.site.kind==='wreck'?'merchant':'fishing',wreck:s.site.kind==='wreck'});this.site.position.set(s.site.x,-s.site.depth,-s.site.y);this.site.rotation.set(.04,-rad(s.site.heading),.18);this.staticRoot.add(this.site);
   if(s.site.kind!=='surface'){const rust=material(0x705343);this.site.traverse(o=>{if(o.isMesh){o.material=rust;}});}
   if(s.site.kind==='wreck'){this.site.scale.setScalar(.5);const chest=new T.Mesh(new T.BoxGeometry(2,1.5,1.4),material(0xa18b53));chest.position.set(6,-1,4);this.site.add(chest);}
  }
  const gravel=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),material(0x73766a),140);
  const sponges=new T.InstancedMesh(new T.CylinderGeometry(.34,.23,1,8,1,true),new T.MeshStandardMaterial({color:0xa77d60,roughness:1,side:T.DoubleSide}),35);
  const piece=new T.Object3D(),seed=s.patrol.seed;
  for(let i=0;i<35;i++){const angle=hash01(91,i)*Math.PI*2,r=12+hash01(92,i)*210,x=this.anchor.x+Math.sin(angle)*r,y=this.anchor.y+Math.cos(angle)*r;
   const rock=new T.Mesh(new T.DodecahedronGeometry(1,0),material(i%3?0x496561:0x7c7060));rock.scale.set(1+hash01(93,i)*4,1+hash01(94,i)*2,1+hash01(95,i)*4);ground(rock,x,y,angle,rock.scale.y*.4);this.staticRoot.add(rock);
   for(let j=0;j<4;j++){
    const k=i*4+j,size=.25+hash01(seed,3*k)*.9;piece.scale.set(size*1.6,size*.65,size);
    ground(piece,x+(hash01(seed,3*k+1)-.5)*18,y+(hash01(seed,3*k+2)-.5)*18,j*2.4,size*.2);
    piece.updateMatrix();gravel.setMatrixAt(k,piece.matrix);
   }
   const h=.45+hash01(seed,i+600);piece.scale.set(1,h,1);
   ground(piece,x+2.3*Math.cos(i),y+3.5,angle,h*.48);piece.updateMatrix();sponges.setMatrixAt(i,piece.matrix);
   if(i%3===0){const kelp=new T.Group();for(let j=0;j<4;j++){const stem=new T.Mesh(new T.CylinderGeometry(.12,.3,7+j,5),material(0x426a4f));stem.position.set(j*.5,(7+j)/2,0);stem.rotation.z=(j-2)*.15;kelp.add(stem);}ground(kelp,x+4,y);this.staticRoot.add(kelp);}
  }
  this.staticRoot.add(gravel,sponges);
  if(s.site)for(const outcrop of shelfOutcrops(s.site,seed)){
   const rock=new T.Mesh(new T.DodecahedronGeometry(1,0),material(0x62675c));
   rock.scale.set(outcrop.width,outcrop.height,outcrop.length);
   ground(rock,outcrop.x,outcrop.y,-rad(outcrop.heading));this.staticRoot.add(rock);
  }
  for(let i=0;i<3;i++){const oct=new T.Group(),m=material(0x9b657d);ellipsoid(oct,[.8,1.1,.8],[0,.6,0],m);for(let j=0;j<8;j++){const a=j*Math.PI/4,pts=[new T.Vector3(0,.3,0),new T.Vector3(Math.sin(a),.1,Math.cos(a)),new T.Vector3(Math.sin(a)*2,.15,Math.cos(a)*2)];oct.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),8,.13,4),m));}const x=this.anchor.x-25+i*28,y=this.anchor.y+25;oct.name='Octopus';ground(oct,x,y,hash01(seed,i)*Math.PI*2,-.04);this.staticRoot.add(oct);}
 }
 update(s,env){
  if(this.lastState!==s)this.reset(s);const t=s.time,a=this.anchor,focusDepth=Math.min(80,bottom(a.x,a.y,s.environment?.chartSeed)-15);
  const elapsed=this.lastTime===null?0:Math.max(0,t-this.lastTime);this.lastTime=t;
  this.swimClock.value=t;
  for(let i=0;i<this.fish.count;i++){const school=Math.floor(i/20),seed=i%20,angle=t*.08+school*1.8,r=24+school*13,cx=a.x+Math.sin(angle)*r,cy=a.y+Math.cos(angle)*r;
   this.dummy.position.set(cx+(hash01(42,i)-.5)*18+Math.sin(t+i)*.4,-focusDepth+school*4+(hash01(43,i)-.5)*5,-cy+(hash01(44,i)-.5)*17);const position=this.dummy.position,previous=this.fishPositions[i];
   avoidBoat(position,s,1);
   if(!previous){this.fishPositions[i]={x:position.x,y:position.y,z:position.z,yaw:-angle-Math.PI/2,pitch:0};}
   else if(elapsed>0){
    const dx=position.x-previous.x,dy=position.y-previous.y,dz=position.z-previous.z;
    if(Math.hypot(dx,dy,dz)>.00001){previous.yaw=Math.atan2(-dx,-dz);previous.pitch=Math.atan2(dy,Math.hypot(dx,dz));}
    Object.assign(previous,{x:position.x,y:position.y,z:position.z});
   }
   const track=this.fishPositions[i];this.dummy.rotation.set(track.pitch,track.yaw,Math.sin(t*3+seed)*.08,'YXZ');this.dummy.scale.set(.6,.7,1+hash01(45,i));this.dummy.updateMatrix();this.fish.setMatrixAt(i,this.dummy.matrix);}
  this.fish.instanceMatrix.needsUpdate=true;
  this.animals.forEach((animal,i)=>{
   const whale=i===3,rate=whale?.008:.025,r=whale?145:50+i*24;
   const place=(position,time)=>{
    const angle=time*rate+i*2;
    position.set(a.x+Math.sin(angle)*r,-Math.min(50+i*9,bottom(a.x,a.y,s.environment?.chartSeed)-20),-a.y-Math.cos(angle)*r);
    avoidBoat(position,s,whale?8:3);
   };
   place(animal.position,t);const ahead=this.dummy.position;place(ahead,t+.15);ahead.sub(animal.position);
   animal.rotation.set(Math.atan2(ahead.y,Math.hypot(ahead.x,ahead.z)),Math.atan2(-ahead.x,-ahead.z),0,'YXZ');
   if(whale)animal.userData.tail.rotation.x=Math.sin(t*.85)*.22;
   else animal.userData.tail.rotation.y=Math.sin(t*2.2+i)*.33;
  });
  if(this.site)this.site.position.set(s.site.x,-s.site.depth,-s.site.y);
  if(this.site&&s.site.kind==='surface'){
   const {pitch,roll,wave}=founderingPose('fishing',s.site.depth);
   this.site.position.y+=wave*surfaceHeight(s.site.x,s.site.y,t,env)*.5;
   this.site.rotation.set(pitch,-rad(s.site.heading),roll,'YXZ');
  }
  const rescue=s.operation&&s.mission!=='survey',active=rescue&&s.operation.active,under=s.mission==='undersea-rescue';
  this.divers.forEach((d,i)=>{d.visible=!!active&&under;if(!d.visible)return;const phase=((s.operation.assessment+i*3)%18)/18,f=phase<.5?phase*2:2-phase*2,arc=Math.sin(f*Math.PI)*2;
   const start=new T.Vector3(s.x,-s.depth-5.8,-s.y),end=new T.Vector3(s.site.x,-s.site.depth+2,-s.site.y);d.position.lerpVectors(start,end,f);d.position.y-=arc;d.lookAt(phase<.5?end:start);d.rotateY(Math.PI);d.userData.passenger.visible=phase>.5&&s.operation.remaining>0;d.userData.legs.forEach((leg,j)=>leg.rotation.x=Math.sin(t*5+j*Math.PI+i)*.35);});
  this.launches.forEach((boat,i)=>{boat.visible=!!active&&!under;if(!boat.visible)return;const phase=((s.operation.assessment+i*9)%18)/18,f=phase<.5?phase*2:2-phase*2;boat.position.set(s.x+(s.site.x-s.x)*f,surfaceHeight(s.x,s.y,t,env)*.6,-s.y-(s.site.y-s.y)*f);boat.rotation.y=-Math.atan2(s.site.x-s.x,s.site.y-s.y)+(phase<.5?0:Math.PI);});
 }
}
