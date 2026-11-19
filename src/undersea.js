import * as T from './vendor/three.module.js';
import {bottom,rad,clamp} from './mechanics.js';
import {hash01,surfaceHeight} from './environment.js';

const material=(color)=>new T.MeshStandardMaterial({color,roughness:.72});
function ellipsoid(group,size,position,mat){const mesh=new T.Mesh(new T.SphereGeometry(1,12,8),mat);mesh.scale.set(...size);mesh.position.set(...position);group.add(mesh);return mesh;}
function fin(group,points,mat){const shape=new T.Shape();shape.moveTo(...points[0]);for(const p of points.slice(1))shape.lineTo(...p);shape.closePath();const m=new T.Mesh(new T.ShapeGeometry(shape),mat);group.add(m);return m;}
function swimmer(color=0x486f79,whale=false){
 const g=new T.Group(),m=material(color);ellipsoid(g,[whale?2.6:.7,whale?2.4:.6,whale?8:2.6],[0,0,0],m);
 const tail=new T.Group();tail.position.z=whale?7:2.5;g.add(tail);const blade=fin(tail,[[0,0],[-1.8,.8],[0,-.3],[1.8,.8]],m);blade.rotation.x=whale?Math.PI/2:0;
 const dorsal=fin(g,[[0,0],[0,1.6],[2,0]],m);dorsal.rotation.y=Math.PI/2;dorsal.position.set(0,.4,.2);
 for(const side of [-1,1]){const f=fin(g,[[0,0],[side*(whale?4:1.7),-.5],[0,-1.1]],m);f.rotation.x=Math.PI/2;f.position.set(0,-.2,-1);}
 g.userData.tail=tail;return g;
}
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
  const fishGeo=new T.ConeGeometry(.5,2,5);fishGeo.rotateX(Math.PI/2);this.fish=new T.InstancedMesh(fishGeo,material(0x85b7b3),160);this.fish.instanceMatrix.setUsage(T.DynamicDrawUsage);this.root.add(this.fish);this.dummy=new T.Object3D();
  this.animals=Array.from({length:4},(_,i)=>{const a=swimmer(i===3?0x4e6975:0x658e96,i===3);this.root.add(a);return a;});
  this.divers=Array.from({length:3},()=>{const d=diver();this.root.add(d);return d;});
  this.launches=Array.from({length:2},()=>{const g=new T.Group();const boat=new T.Mesh(new T.CapsuleGeometry(1,4,4,8),material(0xb77942));boat.rotation.x=Math.PI/2;boat.scale.y=.5;g.add(boat);for(const x of [-.5,.5])ellipsoid(g,[.3,.7,.3],[x,1,0],material(0xd5b67e));this.root.add(g);return g;});
  this.staticRoot=new T.Group();this.root.add(this.staticRoot);this.site=null;
 }
 reset(s){
  for(const child of [...this.staticRoot.children]){child.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});this.staticRoot.remove(child);}
  this.anchor={x:s.site?.x??s.x,y:s.site?.y??s.y};this.lastState=s;
  if(s.site){this.site=s.site.kind==='surface'?this.makeShip({kind:'fishing'}):this.makeSub();this.site.position.set(s.site.x,-s.site.depth,-s.site.y);this.site.rotation.set(.04,-rad(s.site.heading),.18);this.staticRoot.add(this.site);
   const rust=material(0x705343);this.site.traverse(o=>{if(o.isMesh){o.material=rust;}});
   if(s.site.kind==='wreck'){const mast=new T.Mesh(new T.CylinderGeometry(.4,.7,25,8),rust);mast.rotation.z=.5;mast.position.set(0,11,0);this.site.add(mast);const chest=new T.Mesh(new T.BoxGeometry(2,1.5,1.4),material(0xa18b53));chest.position.set(6,-1,4);this.site.add(chest);}
  }
  for(let i=0;i<35;i++){const angle=hash01(91,i)*Math.PI*2,r=45+hash01(92,i)*200,x=this.anchor.x+Math.sin(angle)*r,y=this.anchor.y+Math.cos(angle)*r,depth=bottom(x,y);
   const rock=new T.Mesh(new T.DodecahedronGeometry(1,0),material(i%3?0x496561:0x7c7060));rock.scale.set(1+hash01(93,i)*4,1+hash01(94,i)*2,1+hash01(95,i)*4);rock.position.set(x,-depth+rock.scale.y*.4,-y);rock.rotation.y=angle;this.staticRoot.add(rock);
   if(i%3===0){const kelp=new T.Group();for(let j=0;j<4;j++){const stem=new T.Mesh(new T.CylinderGeometry(.12,.3,7+j,5),material(0x426a4f));stem.position.set(j*.5,(7+j)/2,0);stem.rotation.z=(j-2)*.15;kelp.add(stem);}kelp.position.set(x+4,-depth,-y);this.staticRoot.add(kelp);}
  }
  for(let i=0;i<3;i++){const oct=new T.Group(),m=material(0x9b657d);ellipsoid(oct,[.8,1.1,.8],[0,.6,0],m);for(let j=0;j<8;j++){const a=j*Math.PI/4,pts=[new T.Vector3(0,.3,0),new T.Vector3(Math.sin(a),.1,Math.cos(a)),new T.Vector3(Math.sin(a)*2,.15,Math.cos(a)*2)];oct.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),8,.13,4),m));}const x=this.anchor.x-25+i*28,y=this.anchor.y+25;oct.position.set(x,-bottom(x,y)+1,-y);this.staticRoot.add(oct);}
 }
 update(s,env){
  if(this.lastState!==s)this.reset(s);const t=s.time,a=this.anchor,focusDepth=Math.min(80,bottom(a.x,a.y)-15);
  for(let i=0;i<160;i++){const school=Math.floor(i/20),seed=i%20,angle=t*.08+school*1.8,r=24+school*13,cx=a.x+Math.sin(angle)*r,cy=a.y+Math.cos(angle)*r;
   this.dummy.position.set(cx+(hash01(42,i)-.5)*18+Math.sin(t+i)*.4,-focusDepth+school*4+(hash01(43,i)-.5)*5,-cy+(hash01(44,i)-.5)*17);this.dummy.rotation.set(0,-angle-Math.PI/2,Math.sin(t*3+seed)*.08);this.dummy.scale.set(.6,.7,1+hash01(45,i));this.dummy.updateMatrix();this.fish.setMatrixAt(i,this.dummy.matrix);}
  this.fish.instanceMatrix.needsUpdate=true;
  this.animals.forEach((animal,i)=>{const angle=t*(i===3?.008:.025)+i*2,r=i===3?145:50+i*24;animal.position.set(a.x+Math.sin(angle)*r,-Math.min(50+i*9,bottom(a.x,a.y)-20),-a.y-Math.cos(angle)*r);animal.rotation.y=-angle-Math.PI/2;animal.userData.tail.rotation.y=Math.sin(t*(i===3?.8:2.2))*.3;});
  if(this.site&&s.site.kind==='surface'){this.site.position.y=-s.site.depth+surfaceHeight(s.site.x,s.site.y,t,env)*.5;this.site.rotation.z=.15+s.time*.00015;}
  const rescue=s.operation&&s.mission!=='survey',active=rescue&&s.operation.active,under=s.mission==='undersea-rescue';
  this.divers.forEach((d,i)=>{d.visible=!!active&&under;if(!d.visible)return;const phase=((s.operation.assessment+i*3)%18)/18,f=phase<.5?phase*2:2-phase*2,arc=Math.sin(f*Math.PI)*2;
   const start=new T.Vector3(s.x,-s.depth-5.8,-s.y),end=new T.Vector3(s.site.x,-s.site.depth+2,-s.site.y);d.position.lerpVectors(start,end,f);d.position.y-=arc;d.lookAt(phase<.5?end:start);d.rotateY(Math.PI);d.userData.passenger.visible=phase>.5&&s.operation.remaining>0;d.userData.legs.forEach((leg,j)=>leg.rotation.x=Math.sin(t*5+j*Math.PI+i)*.35);});
  this.launches.forEach((boat,i)=>{boat.visible=!!active&&!under;if(!boat.visible)return;const phase=((s.operation.assessment+i*9)%18)/18,f=phase<.5?phase*2:2-phase*2;boat.position.set(s.x+(s.site.x-s.x)*f,surfaceHeight(s.x,s.y,t,env)*.6,-s.y-(s.site.y-s.y)*f);boat.rotation.y=-Math.atan2(s.site.x-s.x,s.site.y-s.y)+(phase<.5?0:Math.PI);});
 }
}
