import {blastCloud,animateCloud,detonationFlash} from './blast-cloud.ts';
import * as T from './vendor/three.module.js';
import {WakeRibbons} from './surface-wake.ts';
import {hash01,surfaceHeight} from './environment.ts';
import {chargeAltitude} from './combat.ts';
import type {Environment} from './environment.ts';
import type {World} from './patrol-world.ts';

// What the sky, weather, wake and blast effects read from the patrol.
export type Skies = Pick<World, 'time' | 'lightning' | 'impacts' | 'blasts' | 'shells'> & Parameters<WakeRibbons['update']>[0];
type Strike = World['lightning'][number];
type Uniform<V> = {value: V};
type Disposable = T.Object3D & {geometry?: T.BufferGeometry; material?: T.Material | T.Material[]};
type WakeMesh = T.Mesh<T.BufferGeometry, T.ShaderMaterial>;
const clamp=(n: number,a: number,b: number)=>Math.max(a,Math.min(b,n));
const skyFragment=`
varying vec3 vPos;uniform float time;uniform float daylight;uniform float cloud;uniform float twilight;uniform float flash;uniform float mist;uniform vec3 strikeDir;uniform vec3 sunDir;uniform vec3 moonDir;uniform float lunarCos;uniform float clearLight;uniform float starTime;uniform sampler2D cloudNoise;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float fbm(vec2 p){float n=0.;float a=.5;for(int i=0;i<5;i++){n+=noise(p)*a;p=p*2.03+vec2(7.1,3.7);a*=.5;}return n;}
void main(){vec3 d=normalize(vPos);float h=max(d.y,0.);vec3 top=mix(vec3(.005,.012,.032),vec3(.12,.32,.55),daylight);vec3 horizon=mix(vec3(.022,.038,.065),vec3(.64,.72,.78),daylight);vec3 col=mix(horizon,top,pow(h,.45));
float sunDot=max(dot(d,sunDir),0.);col+=vec3(.75,.28,.06)*twilight*pow(1.-h,7.)*(.3+.7*pow(sunDot,5.));float sun=smoothstep(.99982,.99994,sunDot)*step(-.03,sunDir.y);col=mix(col,vec3(1.,.88,.6),sun*clearLight);col+=vec3(.2,.12,.05)*pow(sunDot,80.)*daylight;
vec2 stars=vec2(atan(d.x,d.z),asin(d.y))*380.;vec2 cell=floor(stars);float seed=hash(cell);
float star=step(.9977,seed)*(1.-smoothstep(.13,.53,length(fract(stars)-.5)));
col+=vec3(.38,.48,.63)*star*(1.-daylight)*smoothstep(.02,.3,h)*clearLight*(.96+.04*sin(starTime*.30+seed*3000.));
float alignment=dot(d,moonDir);
if(alignment>.99983 && d.y>0.){
 vec3 disc=(d-alignment*moonDir)/.016;
 float r2=dot(disc,disc),rim=1.-smoothstep(.88,1.,r2);
 vec3 towardSun=sunDir-dot(sunDir,moonDir)*moonDir;
 float normalLight=dot(disc,towardSun/max(.0001,length(towardSun)))*sqrt(max(0.,1.-lunarCos*lunarCos))-sqrt(max(0.,1.-r2))*lunarCos;
 col+=vec3(.72,.79,.94)*rim*smoothstep(-.035,.035,normalLight)*clearLight*(1.-.6*daylight);
}
vec2 uv=d.xz/(.18+max(d.y,0.))*.65+vec2(time*.002,time*.0007);float n=texture2D(cloudNoise,uv*.13).r;float cover=smoothstep(mix(.82,.23,cloud),mix(.94,.56,cloud),n);vec3 cloudCol=mix(vec3(.025,.038,.065),vec3(.43,.48,.52),daylight);cloudCol+=vec3(.7,.8,1.)*flash*.8;col=mix(col,cloudCol,cover*clamp(cloud*1.25,0.,1.));col=mix(col,vec3(.61,.66,.65),mist*(1.-smoothstep(.01,.3,h))*.85);col+=vec3(.45,.55,.7)*flash*(.15+.35*cloud);col+=vec3(.70,.78,1.)*flash*pow(max(0.,dot(d,strikeDir)),120.)*cloud;gl_FragColor=vec4(col,1.);}`;
function cloudTexture(): T.DataTexture {
 const size=256,data=new Uint8Array(size*size*4),noise=(u: number,v: number,p: number)=>{const x=u*p,y=v*p,ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);const at=(x: number,y: number)=>hash01(5150,(x%p)+(y%p)*1024);return(at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let n=0;for(let i=0;i<5;i++)n+=noise(x/size,y/size,4*2**i)*(.5/2**i);const k=(y*size+x)*4;data[k]=data[k+1]=data[k+2]=n*255;data[k+3]=255;}
 const texture=new T.DataTexture(data,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}
// A strip of foam on either side of each old surface crossing. The samples
// stay in world coordinates after a turn, stop or dive.
function wakeMesh(): WakeMesh {
 const ribbons=new WakeRibbons(),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(ribbons.positions,3).setUsage(T.DynamicDrawUsage));
 geometry.setAttribute('foam',new T.BufferAttribute(ribbons.foam,1).setUsage(T.DynamicDrawUsage));
 geometry.setIndex(new T.BufferAttribute(ribbons.indices,1).setUsage(T.DynamicDrawUsage));
 geometry.setDrawRange(0,0);
 const material=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,uniforms:{light:{value:1}},
  vertexShader:'attribute float foam; varying float alpha; varying vec2 at; void main(){alpha=foam;at=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'varying float alpha; varying vec2 at; uniform float light; void main(){float ripples=.65+.35*sin(at.x*2.3+sin(at.y*1.8));gl_FragColor=vec4(vec3(.58,.78,.80)*light,alpha*ripples);}'});
 const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.userData.ribbons=ribbons;return mesh;
}
function updateWake(mesh: WakeMesh,s: Skies,e: Environment,underwater: boolean){
 const g=mesh.geometry,count=underwater?0:(mesh.userData.ribbons as WakeRibbons).update(s,e);
 g.setDrawRange(0,count);mesh.visible=count>0;
 if(!mesh.visible)return;
 if(g.index)g.index.needsUpdate=true;
 g.attributes.position.needsUpdate=g.attributes.foam.needsUpdate=true;
 mesh.material.uniforms.light.value=.12+.83*e.daylight+.2*e.moonLight;
}
export class Atmosphere{
 wake: WakeMesh; scene: T.Object3D; strikes: Map<number, T.Group>; charges: Map<number, T.Group>; seenStrikes: Set<number>;
 lastFrameTime: number | null; lastState: Skies | null;
 uniforms: {time: Uniform<number>; daylight: Uniform<number>; cloud: Uniform<number>; twilight: Uniform<number>; mist: Uniform<number>; strikeDir: Uniform<T.Vector3>;
  flash: Uniform<number>; sunDir: Uniform<T.Vector3>; moonDir: Uniform<T.Vector3>; lunarCos: Uniform<number>; clearLight: Uniform<number>; starTime: Uniform<number>; cloudNoise: Uniform<T.Texture>};
 sky: T.Mesh; rainUniforms: {time: Uniform<number>; speed: Uniform<number>; opacity: Uniform<number>; flash: Uniform<number>}; rain: T.LineSegments;
 glow: T.Texture | null; flashes: T.Group[]; blastLight: T.PointLight; shellVisuals: T.Group[];
 constructor(scene: T.Object3D,glow: T.Texture | null=null){
  this.wake=wakeMesh();scene.add(this.wake);this.scene=scene;this.strikes=new Map();this.charges=new Map();this.seenStrikes=new Set();this.lastFrameTime=null;this.lastState=null;
  this.uniforms={time:{value:0},daylight:{value:1},cloud:{value:0},twilight:{value:0},mist:{value:0},strikeDir:{value:new T.Vector3(0,1,0)},flash:{value:0},sunDir:{value:new T.Vector3()},moonDir:{value:new T.Vector3()},lunarCos:{value:1},clearLight:{value:1},starTime:{value:0},cloudNoise:{value:cloudTexture()}};
  this.sky=new T.Mesh(new T.SphereGeometry(20000,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:this.uniforms,vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:skyFragment}));scene.add(this.sky);
  const geometry=new T.BufferGeometry(),pos: number[]=[],seeds: number[]=[];for(let i=0;i<1000;i++){const x=(hash01(901,i)-.5)*180,z=(hash01(902,i)-.5)*180,seed=hash01(903,i)*100;pos.push(x,0,z,x+.7,3.6,z);seeds.push(seed,seed);}geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setAttribute('seed',new T.Float32BufferAttribute(seeds,1));
  this.rainUniforms={time:{value:0},speed:{value:30},opacity:{value:0},flash:{value:0}};
  this.rain=new T.LineSegments(geometry,new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:this.rainUniforms,vertexShader:'attribute float seed;uniform float time;uniform float speed;void main(){vec3 p=position;p.y+=mod(seed-time*speed,100.)-35.;p.x+=p.y*.23;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'uniform float opacity;uniform float flash;void main(){gl_FragColor=vec4(vec3(.54,.65,.75)+flash*.25,opacity);}'}));scene.add(this.rain);
  this.glow=glow;this.flashes=[];
  this.blastLight=new T.PointLight(0xff872f,0,180,2);scene.add(this.blastLight);
  this.shellVisuals=Array.from({length:12},()=>{const group=new T.Group(),shell=new T.Mesh(new T.SphereGeometry(1.4,6,4),new T.MeshBasicMaterial({color:0xffdda4,toneMapped:false})),splash=blastCloud(T);group.add(shell,splash);group.userData={shell,splash};scene.add(group);return group;});
 }
 bolt(strike: Strike): T.Group {
  const group=new T.Group(),points: T.Vector3[]=[];for(let i=0;i<=14;i++){const t=i/14;points.push(new T.Vector3((hash01(strike.seed,i)-.5)*100*t,strike.height*t,(hash01(strike.seed,i+20)-.5)*80*t));}
  const curve=new T.CatmullRomCurve3(points);
  for(const [radius,opacity,color] of [[38,.24,0x739dff],[10,1,0xe1eeff]] as const){const mat=new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,fog:false,blending:T.AdditiveBlending});if(radius===10)mat.color.multiplyScalar(3);group.add(new T.Mesh(new T.TubeGeometry(curve,42,radius,4,false),mat));}
  for(let j=0;j<3;j++){const start=points[6+j*2],end=start.clone().add(new T.Vector3((j%2?1:-1)*(120+j*65),-210,60-j*70)),mid=start.clone().lerp(end,.55).add(new T.Vector3(35,45,-20));group.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([start,mid,end]),10,2.5,3),new T.MeshBasicMaterial({color:0xc6e0ff,transparent:true,opacity:.8,depthWrite:false,toneMapped:false,fog:false})));}
  group.position.set(strike.x,strike.altitude??0,-strike.y);return group;
 }
 remove(group: T.Object3D){group.traverse(node=>{const o=node as Disposable;o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});this.scene.remove(group);}
 updateFlashes(s: Skies,e: Environment,camera: T.Camera,underwater: boolean){
  let used=0,strongest=0;
  this.blastLight.intensity=0;
  const draw=(x: number,y: number,altitude: number,age: number)=>{
   const pulse=detonationFlash(age,surfaceHeight(x,y,s.time,e)-altitude,underwater);
   if(!pulse)return;
   const distance=Math.hypot(x-camera.position.x,altitude+pulse.lift-camera.position.y,-y-camera.position.z);
   const brightness=pulse.intensity*Math.exp(-distance*(underwater?.008:.00065));
   if(brightness<.01)return;
   let group=this.flashes[used++];
   if(!group){
    group=new T.Group();
    // An orange halo stays legible against white spray; the smaller core adds light.
    for(const [color,blending] of [[0xff600b,T.NormalBlending],[0xffd57a,T.AdditiveBlending]] as const){
     const sprite=new T.Sprite(new T.SpriteMaterial({map:this.glow,color,transparent:true,depthWrite:false,
      toneMapped:false,fog:false,blending}));
     sprite.renderOrder=2;group.add(sprite);
    }
    this.flashes.push(group);this.scene.add(group);
   }
   group.visible=true;group.position.set(x,altitude+pulse.lift,-y);
   const [halo,core]=group.children as T.Sprite[];
   halo.scale.setScalar(pulse.diameter);halo.material.opacity=brightness;
   core.scale.setScalar(pulse.diameter*.40);core.material.opacity=brightness*brightness;
   const weight=brightness/(1+distance/120);
   if(weight>strongest){
    strongest=weight;this.blastLight.position.copy(group.position);this.blastLight.intensity=5200*pulse.intensity;
   }
  };
  for(const p of s.impacts)if(p.kind==='torpedo')draw(p.x,p.y,p.altitude,s.time-p.time);
  for(const b of s.blasts)if(b.exploded)draw(b.x,b.y,-b.depth,b.explodedAt===undefined?b.age:s.time-b.explodedAt);
  for(let i=used;i<this.flashes.length;i++)this.flashes[i].visible=false;
 }
 update(s: Skies,e: Environment,camera: T.Camera,underwater: boolean,frameSeconds: number): number {
  if(this.lastState!==s){for(const group of this.strikes.values())this.remove(group);for(const group of this.charges.values())this.remove(group);this.strikes.clear();this.charges.clear();this.seenStrikes.clear();this.lastFrameTime=null;this.lastState=s;}
  const visualDt=clamp(frameSeconds-(this.lastFrameTime??frameSeconds),0,.25);this.lastFrameTime=frameSeconds;
  updateWake(this.wake,s,e,underwater);this.sky.visible=!underwater;this.sky.position.copy(camera.position);for(const k of ['daylight','cloud','twilight','flash'] as const)this.uniforms[k].value=e[k];this.uniforms.starTime.value=frameSeconds;this.uniforms.clearLight.value=e.clearLight;this.uniforms.lunarCos.value=Math.cos(e.cycle*2*Math.PI);
  this.uniforms.moonDir.value.set(e.moonDirection.x,e.moonDirection.y,e.moonDirection.z).normalize();this.uniforms.time.value=s.time;this.uniforms.sunDir.value.set(e.sunDirection.x,e.sunDirection.y,e.sunDirection.z).normalize();
  this.uniforms.mist.value=e.fog??0;
  const recent=s.lightning.at(-1);
  if(recent)this.uniforms.strikeDir.value.set(recent.x,recent.height+(recent.altitude??0),-recent.y).sub(camera.position).normalize();
  this.rain.visible=!underwater&&e.rain>.02;this.rain.position.copy(camera.position);this.rainUniforms.time.value=s.time;this.rainUniforms.speed.value=25+e.wind*.35;this.rainUniforms.opacity.value=e.rain*(.18+.1*e.daylight);this.rainUniforms.flash.value=e.flash;
  const visible=new Set<number>();let boltFlash=0;for(const strike of s.lightning){const age=s.time-strike.time;if(age<0||age>20)continue;let group=this.strikes.get(strike.id);if(!group){if(this.seenStrikes.has(strike.id))continue;group=this.bolt(strike);group.userData.age=0;this.seenStrikes.add(strike.id);this.strikes.set(strike.id,group);this.scene.add(group);}group.userData.age+=visualDt;const displayAge=group.userData.age;if(displayAge>1.4)continue;visible.add(strike.id);const pulse=clamp(Math.exp(-displayAge*6)+.85*Math.exp(-(((displayAge-.25)/.08)**2))+.55*Math.exp(-(((displayAge-.55)/.1)**2)),0,1);group.visible=!underwater;(group.children as T.Mesh<T.TubeGeometry, T.MeshBasicMaterial>[]).forEach((o,i)=>o.material.opacity=pulse*(i===0?.24:1));boltFlash=Math.max(boltFlash,pulse);}
  this.uniforms.flash.value=Math.max(e.flash,boltFlash);this.rainUniforms.flash.value=Math.max(e.flash,boltFlash);
  for(const [id,group] of this.strikes)if(!visible.has(id)){this.remove(group);this.strikes.delete(id);}
  this.updateFlashes(s,e,camera,underwater);
  const liveCharges=new Set<number>();
  this.shellVisuals.forEach((group,i)=>{const p=s.shells[i];group.visible=!!p;if(!p)return;const f=clamp(1-p.delay/p.total,0,1);group.position.set(p.fromX+(p.x-p.fromX)*f,12*(1-f)+Math.sin(f*Math.PI)*80,-p.fromY-(p.y-p.fromY)*f);group.userData.shell.visible=p.delay>0;group.userData.splash.visible=p.delay<=0;if(p.delay<=0){const age=-p.delay;group.position.y=2;animateCloud(group.userData.splash,age,8,true,p.fromX);}});
  for(const charge of s.blasts){liveCharges.add(charge.id);let group=this.charges.get(charge.id);if(!group){group=new T.Group();const can=new T.Mesh(new T.CylinderGeometry(.55,.55,1.6,10),new T.MeshStandardMaterial({color:0x58625b,roughness:.7}));group.add(can);const bubble=blastCloud(T);group.add(bubble);
   const trailGeo=new T.BufferGeometry();trailGeo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(48*3),3));
   const trail=new T.Points(trailGeo,new T.PointsMaterial({map:this.glow,size:.75,color:0xc3eaff,transparent:true,opacity:.64,depthWrite:false}));group.add(trail);
   const plume=blastCloud(T);group.add(plume);
   group.userData={can,bubble,trail,plume};this.charges.set(charge.id,group);this.scene.add(group);}
   const altitude=chargeAltitude(charge);group.position.set(charge.x,altitude,-charge.y);const d=group.position.distanceTo(camera.position);
   const plumeAge=charge.age-charge.depth/65,surfaceBlast=!underwater&&charge.exploded&&charge.depth<105&&plumeAge>=0&&plumeAge<2.8;
   group.visible=(surfaceBlast||(underwater?altitude<=1:altitude>=-2))&&d<(underwater?500:3000);
   group.userData.can.visible=!charge.exploded;group.userData.bubble.visible=charge.exploded&&underwater;
   const plume=group.userData.plume;plume.visible=surfaceBlast;
   if(surfaceBlast){plume.position.y=surfaceHeight(charge.x,charge.y,s.time,e)-altitude+1;animateCloud(plume,plumeAge,24-charge.depth*.12,true,charge.id);}
   const trail=group.userData.trail;
   trail.visible=underwater&&altitude<0;
   if(trail.visible){
    const positions=trail.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
     const a=i*2.399+s.time*.7,h=i*.55,spread=charge.exploded?charge.age*(.6+i*.08):.55+h*.035;
     positions.setXYZ(i,Math.cos(a)*spread,Math.min(-altitude,h+(charge.exploded?charge.age*4:0)),Math.sin(a)*spread);
    }
    positions.needsUpdate=true;trail.geometry.computeBoundingSphere();
   }
   if(charge.exploded){const bubbleCloud=group.userData.bubble;animateCloud(bubbleCloud,charge.age,25,false,charge.id,true);bubbleCloud.visible&&=underwater;}
  }
  for(const [id,group] of this.charges)if(!liveCharges.has(id)){this.remove(group);this.charges.delete(id);}
  return underwater?0:boltFlash;
 }
}
