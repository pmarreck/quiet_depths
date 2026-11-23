import {fleetShotPose} from './fleet-action.js';
import {blastCloud,animateCloud} from './blast-cloud.js';
import {periodJet} from './carrier-model.js';
import * as T from './vendor/three.module.js';
import {rad,bottom} from './mechanics.js';
import {surfaceHeight} from './environment.js';
import {renderedScrewAngle,screwBlade} from './submarine-model.js';
const TORPEDO_BLADES=3;
const BUBBLE_OPACITY=.9;
const mat=color=>new T.MeshStandardMaterial({color,roughness:.7,metalness:.2});
const mesh=(parent,geometry,material,position=[0,0,0])=>{const m=new T.Mesh(geometry,material);m.position.set(...position);parent.add(m);return m;};
export class CombatScene{
 constructor(scene,glow){
  this.root=new T.Group();scene.add(this.root);this.glow=glow;this.planes=new Map();this.torpedoes=new Map();this.lastState=null;
  this.tracerGeometry=new T.BufferGeometry();this.tracerGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(192*6),3));this.tracers=new T.LineSegments(this.tracerGeometry,new T.LineBasicMaterial({color:0xffb867,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}));this.root.add(this.tracers);
  this.effects=Array.from({length:64},()=>{const g=new T.Group(),splash=blastCloud(T),cloud=blastCloud(T),flash=new T.Sprite(new T.SpriteMaterial({map:glow,color:0xffb35b,transparent:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending}));flash.scale.set(6,6,1);g.add(flash,splash,cloud);g.userData={splash,cloud,flash};this.root.add(g);return g;});
  const base=new T.Group(),ground=Math.max(0,-bottom(-3200,3400))+3;
  mesh(base,new T.BoxGeometry(26,.8,500),mat(0x515650),[0,ground,0]);for(let z=-220;z<240;z+=35)mesh(base,new T.BoxGeometry(1,.05,12),mat(0xcbc8ab),[0,ground+.45,z]);
  for(let i=0;i<3;i++)mesh(base,new T.BoxGeometry(24,13,30),mat(0x686d59),[55,ground+6,-100+i*45]);base.position.set(-3200,0,-3400);base.rotation.y=-rad(45);this.root.add(base);
 }
 plane(fighter=false){
  const jet=periodJet(T,fighter);
  const fire=new T.Sprite(new T.SpriteMaterial({map:this.glow,color:0xff6c28,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  fire.scale.set(7,7,1);jet.add(fire);jet.userData.fire=fire;return jet;
 }
 torpedo(){
  const g=new T.Group(),body=mesh(g,new T.CapsuleGeometry(.28,4.6,4,12),mat(0xaab9b6));body.rotation.x=Math.PI/2;
  for(const side of [-1,1])mesh(g,new T.BoxGeometry(1,.08,.7),mat(0x253b3d),[side*.45,0,2.1]);
  const metal=mat(0x9c9074),blade=screwBlade(T);
  const shaft=mesh(g,new T.CylinderGeometry(.075,.075,.44,10),metal,[0,0,2.65]);shaft.rotation.x=Math.PI/2;
  const screws=[1,-1].map((hand,i)=>{
   const rotor=new T.Group();rotor.position.z=2.61+i*.18;
   rotor.scale.set(.17,.17,hand*.17);rotor.rotation.z=i*Math.PI/TORPEDO_BLADES;
   for(let j=0;j<TORPEDO_BLADES;j++)mesh(rotor,blade,metal).rotation.z=j*2*Math.PI/TORPEDO_BLADES;
   g.add(rotor);return rotor;
  });
  const positions=new T.Float32BufferAttribute(new Float32Array(80*3),3),geometry=new T.BufferGeometry();geometry.setAttribute('position',positions);
  const wake=new T.Points(geometry,new T.PointsMaterial({map:this.glow,size:4,color:0xe3f0e8,transparent:true,opacity:.8,depthWrite:false}));this.root.add(wake);
  const bubblesGeometry=new T.BufferGeometry();bubblesGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(240*3),3));
  const bubbles=new T.Points(bubblesGeometry,new T.PointsMaterial({map:this.glow,size:2,color:0xd5f0ef,transparent:true,opacity:BUBBLE_OPACITY,depthWrite:false}));this.root.add(bubbles);
  const shell=new T.MeshBasicMaterial({color:0xa1d2c9,transparent:true,opacity:0,depthWrite:false});
  // A grazing view catches more of the shell. The center stays almost clear.
  shell.onBeforeCompile=shader=>{
   shader.vertexShader='varying float facing;\n'+shader.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\nfacing = abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));');
   shader.fragmentShader='varying float facing;\n'+shader.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\ndiffuseColor.a *= .18 + .82 * pow(1. - clamp(facing, 0., 1.), 1.4);');
  };
  const ring=mesh(g,new T.SphereGeometry(1,48,32),shell);g.userData={wake,bubbles,ring,screws};return g;
 }
 dispose(group){group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group.parent?.remove(group);}
 removeTorpedo(group){this.dispose(group.userData.wake);this.dispose(group.userData.bubbles);this.dispose(group);}
 updateTrail(group,path,time,e){
  const {wake,bubbles}=group.userData;
  const foamPositions=wake.geometry.attributes.position,bubblePositions=bubbles.geometry.attributes.position;
  let foam=0,under=0;
  for(let n=0;n<path.length;n++){
   const point=path[n],previous=path[n-1]??point;
   const age=Math.max(0,time-point.time);
   if(age>23)continue;
   const surface=surfaceHeight(point.x,point.y,time,e);
   const belowSurface=surface+point.depth;
   if(belowSurface>=0&&belowSurface<=5)foamPositions.setXYZ(foam++,point.x,surface+.12,-point.y);
   if(age>12)continue;
   for(let i=0;i<3;i++){
    // Spread the bubbles along the recorded course, including around bends.
    const fraction=i/3,x=point.x+(previous.x-point.x)*fraction,y=point.y+(previous.y-point.y)*fraction;
    const bubbleAge=age+(point.time-previous.time)*fraction,phase=point.time*8+i*2;
    const depth=point.depth+(previous.depth-point.depth)*fraction,altitude=-depth+bubbleAge*(.45+i*.13);
    if(altitude>=surfaceHeight(x,y,time,e))continue;
    bubblePositions.setXYZ(under++,x+Math.sin(phase+bubbleAge)*(.3+bubbleAge*.2),altitude,-y+Math.cos(phase+bubbleAge)*(.3+bubbleAge*.2));
   }
  }
  for(const [points,count] of [[wake,foam],[bubbles,under]]){
   points.geometry.attributes.position.needsUpdate=true;points.geometry.setDrawRange(0,count);points.geometry.computeBoundingSphere();
  }
 }
 update(s,e,orbiting=false,time=s.time){
  if(this.lastState!==s){for(const p of this.planes.values())this.dispose(p);for(const p of this.torpedoes.values())this.removeTorpedo(p);this.planes.clear();this.torpedoes.clear();this.lastState=s;}
  const ids=new Set();for(const p of s.aircraft){ids.add(p.id);let g=this.planes.get(p.id);if(!g){g=this.plane(s.mission==='big-kahuna');this.planes.set(p.id,g);this.root.add(g);}g.position.set(p.x,p.altitude,-p.y);g.rotation.set(0,-rad(p.heading),p.bank||0,'YXZ');g.userData.fire.visible=p.hull<=0;}
  for(const [id,g]of this.planes)if(!ids.has(id)){this.dispose(g);this.planes.delete(id);}
  const volleys=s.battle?.volleys??(s.convoy?.shot?[s.convoy.shot]:[]);
  const shots=volleys.filter(v=>v.underwater).map(v=>{
   const p=fleetShotPose(v,s.time),path=[];
   for(let i=Math.max(0,Math.ceil((p.age-10)*3));i/3<p.age;i++)path.push(fleetShotPose(v,v.launched+i/3));
   path.push(p);return {...p,path,pingAge:99};
  });
  const torpIds=new Set();for(const p of shots.length?[...s.projectiles,...shots]:s.projectiles){torpIds.add(p.id);let g=this.torpedoes.get(p.id);if(!g){g=this.torpedo();this.torpedoes.set(p.id,g);this.root.add(g);}g.position.set(p.x,-p.depth,-p.y);g.rotation.set(p.pitch,-rad(p.heading),0,'YXZ');
   const [front,rear]=g.userData.screws,elapsed=p.age-(g.userData.lastAge??p.age);
   front.rotation.z=renderedScrewAngle(front.rotation.z,720,elapsed,TORPEDO_BLADES);
   rear.rotation.z=Math.PI/TORPEDO_BLADES-front.rotation.z;g.userData.lastAge=p.age;
   const ring=g.userData.ring,duration=.38,pinging=p.age>=4&&p.pingAge>=0&&p.pingAge<duration;
   const launchDuration=.7;
   ring.visible=pinging||(orbiting&&p.age<launchDuration);
   if(ring.visible){
    const phase=pinging?p.pingAge/duration:p.age/launchDuration;
    ring.scale.setScalar(pinging?1+22*phase:1.6+1.5*phase);
    ring.material.opacity=(pinging?.105:.085)*(1-phase)**1.35;
   }
   g.userData.path=p.path;this.updateTrail(g,p.path,s.time,e);
  }
  for(const [id,g]of this.torpedoes)if(!torpIds.has(id)){
   g.visible=false;g.userData.retiredAt??=s.time;
   const fade=Math.max(0,1-(s.time-g.userData.retiredAt)/10);
   if(!fade){this.removeTorpedo(g);this.torpedoes.delete(id);continue;}
   g.userData.wake.material.opacity=.8*fade;g.userData.bubbles.material.opacity=BUBBLE_OPACITY*fade;
   this.updateTrail(g,g.userData.path,s.time,e);
  }
  let n=0;const positions=this.tracerGeometry.attributes.position;
  for(const r of s.gunRounds){if(!r.tracer||!r.previous||n>=192)continue;positions.setXYZ(n*2,r.previous.x,r.previous.altitude,-r.previous.y);positions.setXYZ(n*2+1,r.x,r.altitude,-r.y);n++;}
  for(const v of volleys){
   if(v.underwater)continue;
   const f=(s.time-v.launched)/(v.arrives-v.launched);
   if(n>=192||f<0||f>1)continue;
   const arc=v.from.altitude>0&&v.to.altitude>0?18:0;
   for(const [i,t] of [Math.max(0,f-.06),f].entries()){
    positions.setXYZ(n*2+i,v.from.x+(v.to.x-v.from.x)*t,v.from.altitude+(v.to.altitude-v.from.altitude)*t+4*arc*t*(1-t),-v.from.y-(v.to.y-v.from.y)*t);
   }
   n++;
  }
  positions.needsUpdate=true;this.tracerGeometry.setDrawRange(0,n*2);this.tracerGeometry.computeBoundingSphere();
  this.effects.forEach((g,i)=>{
   const p=s.impacts[i];g.visible=!!p;if(!p)return;
   const age=time-p.time,{splash,cloud,flash}=g.userData;
   const water=surfaceHeight(p.x,p.y,s.time,e),depth=water-p.altitude;
   const big=p.kind==='cookoff',collapse=p.kind==='collapse',gun=p.kind==='splash',major=big||collapse||p.kind==='torpedo'||p.kind==='vapor';
   const extent=big?34:collapse?25:major?19:5;
   g.position.set(p.x,p.altitude,-p.y);
   animateCloud(cloud,age,extent,false,p.id,p.kind==='torpedo');cloud.visible&&=!gun;
   splash.position.y=depth;
   animateCloud(splash,age-Math.max(0,depth)/65,extent*.95,true,p.id);
   splash.visible&&=gun||major&&depth<16;
   flash.visible=!gun&&p.kind!=='torpedo';flash.material.color.setHex(collapse?0xb9f5ff:0xffb35b);
   flash.scale.setScalar(extent*(.4+1.8*Math.exp(-age*3)));
   flash.material.opacity=Math.exp(-age*5);
  });
 }
}
