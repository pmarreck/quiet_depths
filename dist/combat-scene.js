import * as T from './vendor/three.module.js';
import {rad,bottom} from './mechanics.js';
import {surfaceHeight} from './environment.js';
const mat=color=>new T.MeshStandardMaterial({color,roughness:.7,metalness:.2});
const mesh=(parent,geometry,material,position=[0,0,0])=>{const m=new T.Mesh(geometry,material);m.position.set(...position);parent.add(m);return m;};
export class CombatScene{
 constructor(scene,glow){
  this.root=new T.Group();scene.add(this.root);this.glow=glow;this.planes=new Map();this.torpedoes=new Map();this.lastState=null;
  this.tracerGeometry=new T.BufferGeometry();this.tracerGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(192*6),3));this.tracers=new T.LineSegments(this.tracerGeometry,new T.LineBasicMaterial({color:0xffb867,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}));this.root.add(this.tracers);
  this.effects=Array.from({length:64},()=>{const g=new T.Group(),splash=mesh(g,new T.ConeGeometry(1,5,8,1,true),new T.MeshBasicMaterial({color:0xe0f0eb,transparent:true,opacity:.7,side:T.DoubleSide})),flash=new T.Sprite(new T.SpriteMaterial({map:glow,color:0xffb35b,transparent:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}));flash.scale.set(6,6,1);g.add(flash);g.userData={splash,flash};this.root.add(g);return g;});
  const base=new T.Group(),ground=Math.max(0,-bottom(-3200,3400))+3;
  mesh(base,new T.BoxGeometry(26,.8,500),mat(0x515650),[0,ground,0]);for(let z=-220;z<240;z+=35)mesh(base,new T.BoxGeometry(1,.05,12),mat(0xcbc8ab),[0,ground+.45,z]);
  for(let i=0;i<3;i++)mesh(base,new T.BoxGeometry(24,13,30),mat(0x686d59),[55,ground+6,-100+i*45]);base.position.set(-3200,0,-3400);base.rotation.y=-rad(45);this.root.add(base);
 }
 plane(){
  const g=new T.Group(),olive=mat(0x4c5c50),grey=mat(0x919b98);const body=mesh(g,new T.SphereGeometry(1,16,10),olive);body.scale.set(.85,.95,5.5);
  mesh(g,new T.BoxGeometry(15.5,.22,2.6),grey,[0,-.1,-.4]);mesh(g,new T.BoxGeometry(5.2,.18,1.5),olive,[0,.3,4]);
  const tail=mesh(g,new T.BoxGeometry(.18,2.5,2),olive,[0,1,4.2]);tail.rotation.x=.15;
  const canopy=mesh(g,new T.SphereGeometry(1,12,8),new T.MeshStandardMaterial({color:0x69928e,roughness:.25,metalness:.5}),[0,.95,-1]);canopy.scale.set(.65,.65,1.3);
  const prop=new T.Group();prop.position.z=-5.7;mesh(prop,new T.SphereGeometry(.28,8,6),olive);for(let i=0;i<4;i++){const blade=mesh(prop,new T.BoxGeometry(.17,2.8,.08),mat(0x152123));blade.rotation.z=i*Math.PI/2;}g.add(prop);g.userData.prop=prop;
  const bombs=new T.Group();for(const x of [-3.2,3.2]){const b=mesh(bombs,new T.CapsuleGeometry(.22,1.3,4,8),mat(0x30372f),[x,-.65,0]);b.rotation.x=Math.PI/2;}g.add(bombs);g.userData.bombs=bombs;
  const fire=new T.Sprite(new T.SpriteMaterial({map:this.glow,color:0xff6c28,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));fire.scale.set(7,7,1);g.add(fire);g.userData.fire=fire;return g;
 }
 torpedo(){
  const g=new T.Group(),body=mesh(g,new T.CapsuleGeometry(.28,4.6,4,12),mat(0x677b7a));body.rotation.x=Math.PI/2;
  for(const side of [-1,1])mesh(g,new T.BoxGeometry(1,.08,.7),mat(0x253b3d),[side*.45,0,2.1]);
  const positions=new T.Float32BufferAttribute(new Float32Array(80*3),3),geometry=new T.BufferGeometry();geometry.setAttribute('position',positions);
  const wake=new T.Points(geometry,new T.PointsMaterial({map:this.glow,size:4,color:0xe3f0e8,transparent:true,opacity:.8,depthWrite:false}));this.root.add(wake);
  const ring=mesh(g,new T.SphereGeometry(1,16,8),new T.MeshBasicMaterial({color:0x84c8b9,transparent:true,opacity:.1,wireframe:true,depthWrite:false}));g.userData={wake,ring};return g;
 }
 dispose(group){group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group.parent?.remove(group);}
 update(s,e){
  if(this.lastState!==s){for(const p of this.planes.values())this.dispose(p);for(const p of this.torpedoes.values()){this.dispose(p.userData.wake);this.dispose(p);}this.planes.clear();this.torpedoes.clear();this.lastState=s;}
  const ids=new Set();for(const p of s.aircraft){ids.add(p.id);let g=this.planes.get(p.id);if(!g){g=this.plane();this.planes.set(p.id,g);this.root.add(g);}g.position.set(p.x,p.altitude,-p.y);g.rotation.set(0,-rad(p.heading),p.bank||0,'YXZ');g.userData.prop.rotation.z=s.time*40;g.userData.bombs.visible=!p.bombDropped;g.userData.fire.visible=p.hull<=0;}
  for(const [id,g]of this.planes)if(!ids.has(id)){this.dispose(g);this.planes.delete(id);}
  const torpIds=new Set();for(const p of s.projectiles){torpIds.add(p.id);let g=this.torpedoes.get(p.id);if(!g){g=this.torpedo();this.torpedoes.set(p.id,g);this.root.add(g);}g.position.set(p.x,-p.depth,-p.y);g.rotation.y=-rad(p.heading);
   const ring=g.userData.ring;ring.visible=p.age>=4&&p.pingAge<.7;ring.scale.setScalar(1+p.pingAge*45);ring.material.opacity=Math.max(0,.24*(1-p.pingAge/.7));
   const wake=g.userData.wake,positions=wake.geometry.attributes.position,path=p.path.filter(v=>v.depth<=10);path.forEach((v,i)=>positions.setXYZ(i,v.x,surfaceHeight(v.x,v.y,s.time,e)+.12,-v.y));positions.needsUpdate=true;wake.geometry.setDrawRange(0,path.length);wake.geometry.computeBoundingSphere();
  }
  for(const [id,g]of this.torpedoes)if(!torpIds.has(id)){this.dispose(g.userData.wake);this.dispose(g);this.torpedoes.delete(id);}
  let n=0;const positions=this.tracerGeometry.attributes.position;for(const r of s.gunRounds){if(!r.tracer||!r.previous||n>=192)continue;positions.setXYZ(n*2,r.previous.x,r.previous.altitude,-r.previous.y);positions.setXYZ(n*2+1,r.x,r.altitude,-r.y);n++;}positions.needsUpdate=true;this.tracerGeometry.setDrawRange(0,n*2);this.tracerGeometry.computeBoundingSphere();
  this.effects.forEach((g,i)=>{const p=s.impacts[i];g.visible=!!p;if(!p)return;const age=s.time-p.time;g.position.set(p.x,p.altitude,-p.y);g.userData.splash.visible=p.kind==='splash';g.userData.flash.visible=p.kind!=='splash';g.userData.splash.scale.set(1+age,1+age*.5,1+age);g.userData.splash.material.opacity=Math.max(0,.8*(1-age/3));g.userData.flash.material.opacity=Math.max(0,1-age/.6);});
 }
}
