import {damageWreck} from './wrecks.js';
import * as T from './vendor/three.module.js';
import {bottom,rad} from './sim.js';
import {feedActive,scopeBearing,cameraEuler,droneCameraPitch,orbitVerticalFov} from './controls.js';
import {environmentAt,SEA_SAMPLE_GLSL,surfaceHeight,scopeEyeHeight,scopeWashed,opticalSway,hash01,boatHeave,waterColumnLight} from './environment.js';
import {Atmosphere} from './atmosphere.js';
import {UnderseaLife} from './undersea.js';
import {FLOOR_WIDTH,FLOOR_SEGMENTS} from './seafloor.js';
import {createSubmarine,renderedScrewAngle} from './submarine-model.js';
import {SUB_DESIGN as D} from './hull-design.js';
import {CombatScene} from './combat-scene.js';
import {tetherPoints} from './tether.js';
const ROV_LAMP_INTENSITY=1100;
const waterVertex=`
uniform float time;uniform vec2 origin;uniform float waveScale;uniform float waveSpeed;
varying vec3 vWorld;
varying vec3 vNormal;
${SEA_SAMPLE_GLSL}
void main(){vec3 p=position;vec3 sea=seaSample(p.xy+origin);p.z=sea.x;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vNormal=normalize(vec3(-sea.y,1.,sea.z));gl_Position=projectionMatrix*viewMatrix*world;}`;
const waterFragment=`
uniform float time;uniform vec3 sunDir;uniform float underwater;uniform float daylight;uniform float cloud;uniform float twilight;uniform float waveScale;uniform float waveSpeed;uniform vec3 fogColor;uniform float fogDensity;uniform float flash;
uniform float underwaterSun;
varying vec3 vWorld;varying vec3 vNormal;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float waveFocus(vec2 p){
 float phase=time*waveSpeed*1.6;
 float a=sin(dot(p,vec2(.53,.19))+phase+sin(p.y*.24)*.8);
 float b=sin(dot(p,vec2(-.33,.71))-phase*.68);
 return 1.-smoothstep(.04,.42,abs(a+.65*b));
}
vec3 underside(vec3 view,vec3 normal){
 float distanceToSurface=length(cameraPosition-vWorld);
 // Snell's window: the sky is visible inside a cone about 49 degrees
 // from the downward-facing surface normal.
 float window=smoothstep(.60,.72,dot(view,-normal));
 float swell=.65+.35*sin(dot(normal.xz,vec2(23.,35.))+vWorld.y*1.4);
 float ripple=sin(dot(vWorld.xz,vec2(.36,.82))+sin(vWorld.x*.71-time)*1.4-time*1.25);
 float exposure=daylight*(1.-.53*cloud);
 vec3 ceiling=mix(vec3(.034,.15,.23),vec3(.20,.49,.66),window);
 ceiling=vec3(.003,.009,.020)+ceiling*exposure*swell*(.87+.13*ripple);
 float visibleThroughWater=exp(-distanceToSurface*.023-pow(distanceToSurface*fogDensity,2.));
 vec3 color=mix(fogColor,ceiling,visibleThroughWater);
 if(underwaterSun>.01){
  vec3 sunRay=refract(-sunDir,vec3(0.,1.,0.),1./1.333);
  float shafts=0.;
  for(int i=0;i<3;i++){
   float fraction=(float(i)+.5)/3.;
   vec3 point=mix(cameraPosition,vWorld,fraction);
   vec2 source=point.xz+sunRay.xz*(min(point.y,0.)/max(-sunRay.y,.2));
   float path=-min(point.y,0.)/max(-sunRay.y,.2)+fraction*distanceToSurface;
   shafts+=waveFocus(source)*exp(-.045*path);
  }
  float surfaceGlints=waveFocus(vWorld.xz*1.8)*window*visibleThroughWater;
  color+=vec3(.045,.21,.31)*underwaterSun*(shafts*.48*(1.-exp(-distanceToSurface*.15))+.38*surfaceGlints);
 }
 return color+vec3(.05,.13,.24)*flash;
}
void main(){vec3 V=normalize(cameraPosition-vWorld);vec3 N=normalize(vNormal);N.x+=sin(vWorld.x*.16+time*1.6)*.035+noise(vWorld.xz*.18+time*.1)*.06;N.z+=sin(vWorld.z*.23-time*1.4)*.045;N=normalize(N);if(underwater>.5){gl_FragColor=linearToOutputTexel(vec4(underside(V,N),1.));return;}float fres=pow(1.-max(dot(V,N),0.),3.);float spec=pow(max(dot(reflect(-sunDir,N),V),0.),90.);vec3 deep=mix(vec3(.005,.014,.026),mix(vec3(.025,.16,.23),vec3(.035,.10,.13),cloud),daylight);vec3 reflection=mix(vec3(.025,.05,.085),mix(vec3(.43,.60,.72),vec3(.27,.34,.39),cloud),daylight);vec3 col=mix(deep,reflection,fres*.85);col+=vec3(1.,.69,.35)*spec*daylight*(1.-cloud*.85);col+=vec3(.2,.075,.025)*twilight*pow(fres,2.)*.4;float band=sin(vWorld.x*.051+vWorld.z*.032+time)*sin(vWorld.z*.08-time*.7);float foam=smoothstep(1.2,1.9,vWorld.y/max(waveScale,.1))*smoothstep(.7,1.,band);col=mix(col,mix(vec3(.07,.11,.14),vec3(.65,.74,.77),daylight),foam*.6);float dist=length(cameraPosition-vWorld);col=mix(col,fogColor,1.-exp(-pow(dist*fogDensity,2.)));col+=vec3(.32,.43,.6)*flash;gl_FragColor=vec4(col,1.);}`;
export class OceanScene{
 constructor(canvas){
  this.THREE=T;this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1));this.renderer.setClearColor(0x687a78);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.scene=new T.Scene();this.scene.fog=new T.FogExp2(0x627475,.00015);this.camera=new T.PerspectiveCamera(38,1,.5,23000);
  this.hemi=new T.HemisphereLight(0xd4d9c8,0x18353e,2);this.scene.add(this.hemi);this.sun=new T.DirectionalLight(0xffd6a0,2.7);this.scene.add(this.sun);this.moon=new T.DirectionalLight(0xb8d3ff,.2);this.scene.add(this.moon);
  this.waterUniforms={time:{value:0},origin:{value:new T.Vector2()},sunDir:{value:new T.Vector3(-.5,.12,-1).normalize()},underwater:{value:0},underwaterSun:{value:0},waveScale:{value:1},waveSpeed:{value:1},daylight:{value:1},cloud:{value:0},twilight:{value:0},fogColor:{value:new T.Color()},fogDensity:{value:.0002},flash:{value:0}};
  const geo=new T.PlaneGeometry(30000,30000,256,256);const wp=geo.attributes.position;for(let i=0;i<wp.count;i++){for(const axis of ['X','Y']){const u=wp['get'+axis](i)/15000;wp['set'+axis](i,Math.sign(u)*15000*Math.pow(Math.abs(u),2.4));}}this.water=new T.Mesh(geo,new T.ShaderMaterial({uniforms:this.waterUniforms,vertexShader:waterVertex,fragmentShader:waterFragment,side:T.DoubleSide}));this.water.rotation.x=-Math.PI/2;this.scene.add(this.water);
  this.atmosphere=new Atmosphere(this.scene);
  const terrainGeo=new T.PlaneGeometry(FLOOR_WIDTH,FLOOR_WIDTH,FLOOR_SEGMENTS,FLOOR_SEGMENTS);const pos=terrainGeo.attributes.position;const colors=[];for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const b=bottom(x,y);pos.setZ(i,-b);const c=new T.Color(b<0?0x414c42:0x264541);c.multiplyScalar(.8+hash01(1983,i)*.3);colors.push(c.r,c.g,c.b);}terrainGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();this.terrain=new T.Mesh(terrainGeo,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));this.terrain.rotation.x=-Math.PI/2;this.scene.add(this.terrain);
  this.ships=new Map();this.own=this.makeSub();this.scene.add(this.own);
  this.caustics={causticTime:{value:0},causticStrength:{value:0}};
  this.own.traverse(part=>{
   if(!part.material?.isMeshStandardMaterial)return;
   part.material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,this.caustics);
    shader.vertexShader='varying vec3 causticPoint;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',
     '#include <worldpos_vertex>\ncausticPoint = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader='varying vec3 causticPoint;\nuniform float causticTime;\nuniform float causticStrength;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>',
     `#include <emissivemap_fragment>
     vec2 ray = causticPoint.xz * 0.66;
     ray += vec2(sin(ray.y * 0.7 + causticTime), sin(ray.x * 0.85 - causticTime)) * 0.55;
     float ridges = abs(sin(ray.x + causticTime * 0.43) + sin(ray.y - causticTime * 0.27));
     float caustic = (1.0 - smoothstep(0.015, 0.27, ridges)) * causticStrength * step(causticPoint.y, 0.0);
     totalEmissiveRadiance += vec3(0.09, 0.22, 0.24) * caustic;`);
   };
  });
  this.life=new UnderseaLife(this.scene,()=>this.makeSub(),ship=>this.makeShip(ship));
  this.combat=new CombatScene(this.scene,this.glowTexture());const cableGeo=new T.BufferGeometry();cableGeo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(48*3),3));this.cable=new T.Line(cableGeo,new T.LineBasicMaterial({color:0x879183,transparent:true,opacity:.8}));this.scene.add(this.cable);
  const bubbles=new T.BufferGeometry(),seeds=[];
  for(let i=0;i<256;i++)seeds.push(hash01(13,i),hash01(19,i),hash01(23,i));
  bubbles.setAttribute('position',new T.Float32BufferAttribute(seeds,3));
  this.bubbleUniforms={strength:{value:0},clock:{value:0},trailLength:{value:0},radius:{value:D.propellerRadius},stern:{value:D.propellerZ}};
  this.bubbles=new T.Points(bubbles,new T.ShaderMaterial({
   transparent:true,depthWrite:false,uniforms:this.bubbleUniforms,
   vertexShader:`
    uniform float strength,clock,trailLength,radius,stern;
    varying float opacity;
    void main(){
     float lifetime=.22+.78*position.z;
     float age=fract(clock*.64/lifetime+position.x);
     float travel=age*lifetime,angle=6.28318*position.y+4.*travel;
     float spread=radius*(.21+.7*position.x)+travel*(.8+1.8*position.z);
     vec3 offset=vec3(cos(angle)*spread,sin(angle)*spread+travel*travel*1.5,stern+.22+travel*trailLength);
     vec4 p=modelViewMatrix*vec4(offset,1.);
     opacity=strength*(1.-smoothstep(.12,1.,age))*(1.-.65*travel);
     gl_PointSize=clamp(180.*strength*(1.-.6*age)/max(.1,-p.z),1.,8.);
     gl_Position=projectionMatrix*p;
    }`,
   fragmentShader:`varying float opacity;
    void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.72,.9,.96,(1.-r)*opacity*.78);}`
  }));
  this.bubbles.frustumCulled=false;this.own.add(this.bubbles);
  this.light=new T.SpotLight(0xd5e5ea,ROV_LAMP_INTENSITY,240,Math.PI/3,.8,2);this.scene.add(this.light,this.light.target);
  const particles=new T.BufferGeometry(),pts=[];for(let i=0;i<800;i++)pts.push((hash01(904,i)-.5)*600,(hash01(905,i)-.5)*220,(hash01(906,i)-.5)*600);particles.setAttribute('position',new T.Float32BufferAttribute(pts,3));this.particles=new T.Points(particles,new T.PointsMaterial({size:.4,color:0x9fc6b2,transparent:true,opacity:.35}));this.scene.add(this.particles);
  const drifting=new T.BufferGeometry();drifting.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(72*3),3));
  this.driftingBubbles=new T.Points(drifting,new T.PointsMaterial({map:this.glowTexture(),size:.55,color:0xc2eaf4,transparent:true,opacity:.55,depthWrite:false}));
  this.driftingBubbles.frustumCulled=false;this.scene.add(this.driftingBubbles);
 }
 mat(color){return new T.MeshStandardMaterial({color,roughness:.86,metalness:.12});}
 box(g,size,pos,mat){const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.position.set(...pos);g.add(m);return m;}
 glowTexture(){if(this.glow)return this.glow;const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const c=canvas.getContext('2d'),gradient=c.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.12,'#ffffffe0');gradient.addColorStop(.4,'#ffffff44');gradient.addColorStop(1,'#ffffff00');c.fillStyle=gradient;c.fillRect(0,0,32,32);this.glow=new T.CanvasTexture(canvas);return this.glow;}
 updateTubeDoors(model,shots,launcher){
  for(const [i,tube] of model.userData.tubes.entries()){
   const side=i*2-1,shot=shots.find(p=>p.tubeSide===side&&p.age<1.8&&(launcher===null?p.owner==='player':p.launcher===launcher));
   tube.rotation.y=shot?-side*1.5*Math.min(1,(1.8-shot.age)*4):0;
  }
 }
 makeShip(ship){
  if(ship.kind==='sub')return this.makeSub();
  const root=new T.Group(),g=new T.Group(),lights=new T.Group(),small=ship.kind==='fishing',escort=ship.kind==='escort';const scale=small?.38:escort?.78:1;root.add(g,lights);root.userData.body=g;root.userData.lights=lights;
  const hullMat=this.mat(escort?0x505f60:0x343b3b),deck=this.mat(0x737969),rust=this.mat(0x6b4633);
  const hull=new T.Mesh(new T.CylinderGeometry(17,14,130,12,14),hullMat);hull.rotation.x=Math.PI/2;hull.scale.x=.8;hull.scale.z=.6;hull.position.y=3;g.add(hull);root.userData.hull=hull;
  this.box(g,[24,6,103],[0,7,0],hullMat);this.box(g,[19,15,21],[0,17,36],deck);this.box(g,[16,5,15],[0,27,37],deck);this.box(g,[4,15,6],[0,29,25],rust);
  for(let i=0;i<4;i++)this.box(g,[18,8,16],[0,13,-36+i*19],i%2?rust:this.mat(0x6b6b53));
  this.box(g,[.8,36,.8],[0,28,-18],deck);this.box(g,[22,.6,.6],[0,38,-18],deck);this.box(g,[.6,24,.6],[0,36,39],deck);
  this.box(g,[15,1,1],[0,43,39],deck);
  const lightMat=new T.MeshBasicMaterial({color:0xffd5a0,toneMapped:false,fog:false});for(let i=0;i<4;i++)this.box(lights,[2,1,1],[-6+i*4,21,47.1],lightMat);
  for(const [x,y,z,color,size] of [[-13,16,-25,0xff5c43,28],[13,16,-25,0x6cff9c,28],[0,43,-18,0xffdda5,40],[0,31,39,0xffd493,34]]){const sprite=new T.Sprite(new T.SpriteMaterial({map:this.glowTexture(),color,transparent:true,depthWrite:false,fog:false,toneMapped:false,blending:T.AdditiveBlending}));sprite.position.set(x,y,z);sprite.scale.set(size,size,1);lights.add(sprite);}
  if(escort){this.box(g,[7,4,8],[0,12,-48],hullMat);this.box(g,[1,1,16],[0,15,-55],hullMat);}
  root.scale.setScalar(scale);return root;
 }
 makeSub(){return createSubmarine(T);}
 resize(w,h){if(this.canvas.width!==Math.floor(w*this.renderer.getPixelRatio())||this.canvas.height!==Math.floor(h*this.renderer.getPixelRatio())){this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}}
 clear(){this.renderer.setClearColor(0x0a171b);this.renderer.clear();}
 render(s,view,zoom,time,orbit,frameSeconds=time){
  if(!feedActive(s,view)){this.clear();return;}
  const orbiting=view==='orbit',e=environmentAt(s),drone=view==='drone',tower=view==='tower',gun=view==='gun',listener=drone?s.drone:s;
  const heave=boatHeave(s,e,time),hullY=heave-s.depth;
  const motionDt=this.motionState===s?time-this.motionTime:0;
  this.motionState=s;this.motionTime=time;
  if(orbiting){
   const offset=orbit.distance*Math.cos(orbit.pitch),x=s.x+offset*Math.sin(orbit.yaw),y=s.y+offset*Math.cos(orbit.yaw);
   const elevation=Math.max(-bottom(x,y)+1,hullY+orbit.distance*Math.sin(orbit.pitch));
   this.camera.position.set(x,elevation,-y);this.camera.lookAt(s.x,hullY,-s.y);
   this.camera.fov=orbitVerticalFov(this.camera.aspect);
   this.light.position.copy(this.camera.position);this.light.target.position.set(s.x,hullY,-s.y);this.particles.position.copy(this.camera.position);
  }
  // Keep the virtual orbit light readable as the camera moves away from the hull.
  this.light.intensity=orbiting?2.8*orbit.distance**2:ROV_LAMP_INTENSITY;
  this.own.visible=drone||tower||gun||orbiting;this.own.position.set(s.x,hullY,-s.y);this.own.rotation.set(s.pitch,-rad(s.heading),0,'YXZ');
  const sway=opticalSway(s,view,time);
  let pose;
  if(drone){
   const d=s.drone,a=rad(d.heading),pitch=droneCameraPitch(d.verticalSpeed),reach=100*Math.cos(pitch);
   this.camera.position.set(d.x,d.depth<.5?.8:-d.depth,-d.y);
   pose=cameraEuler(d.heading,pitch);
   this.light.position.copy(this.camera.position);
   this.light.target.position.set(d.x+Math.sin(a)*reach,this.camera.position.y+100*Math.sin(pitch),-d.y-Math.cos(a)*reach);
   this.particles.position.copy(this.camera.position);
   this.camera.fov=65;
  }
  else if(gun){const a=rad(s.heading);this.camera.position.set(s.x+Math.sin(a)*16,6-s.depth,-s.y-Math.cos(a)*16);pose=cameraEuler(s.heading+s.gun.angle,rad(s.gun.elevation),0);this.camera.fov=55/zoom;}
  else if(tower){
   this.own.localToWorld(this.camera.position.set(0,D.bridgeEye,D.bridgeZ));
   this.camera.rotation.set(s.towerPitch+sway.pitch,-rad(s.towerAngle)-sway.yaw,sway.roll,'YXZ');
   this.camera.quaternion.premultiply(this.own.quaternion);
   this.camera.fov=65/zoom;
  }
  else if(!orbiting){this.camera.position.set(s.x,scopeEyeHeight(s,e),-s.y);pose=cameraEuler(scopeBearing(s)+sway.yaw*180/Math.PI,Math.atan2(-3+Math.sin(time*.3)*1.5,1000)+sway.pitch,sway.roll);this.camera.fov=38/zoom;}
  if(pose)this.camera.rotation.set(pose.x,pose.y,pose.z,pose.order);
  const camera=this.camera.position;
  const cameraDepth=surfaceHeight(camera.x,-camera.z,time,e)-camera.y;
  const underwater=orbiting||drone?cameraDepth>0:tower||gun?false:scopeWashed(s,e);
  const light=underwater?waterColumnLight(cameraDepth,e):null;
  const fog=this.scene.fog.color;
  let ambient,direct;
  if(light){
   fog.setHex(0x040b1c);
   fog.r+=light.red*.025;
   fog.g+=light.green*.24;
   fog.b+=light.blue*.43;
   ambient=.025+.8*(light.red+light.green+2*light.blue)/4;
   direct=.52*light.blue*(1-e.cloud*.8);
  }else{
   fog.setHex(0x061022).lerp(new T.Color(e.cloud>.6?0x526373:0x98b9ce),e.daylight);
   ambient=.15+1.8*e.daylight;
   direct=2.7*e.daylight*(1-e.cloud*.7);
  }
  this.caustics.causticTime.value=time*(.7+e.waveScale*.2);
  this.caustics.causticStrength.value=(light?.direct??0)*.63*Math.exp(-Math.max(0,s.depth)/37);
  this.water.position.set(listener.x,0,-listener.y);
  const water=this.waterUniforms;
  water.time.value=time;
  water.underwater.value=underwater?1:0;
  water.underwaterSun.value=light?.direct??0;
  water.origin.value.set(listener.x,listener.y);
  for(const k of ['waveScale','waveSpeed','daylight','cloud','twilight'])water[k].value=e[k];
  water.fogColor.value.copy(fog);
  water.fogDensity.value=this.scene.fog.density=underwater?.009:1.1/e.opticalRange;
  water.sunDir.value.set(e.sunDirection.x,e.sunDirection.y,e.sunDirection.z).normalize();
  this.renderer.setClearColor(fog);
  this.hemi.intensity=ambient+e.flash*(underwater?.2:2);
  this.sun.intensity=direct;
  this.sun.color.setHex(underwater?0x9ac9ff:0xffd6a0);
  this.hemi.color.setHex(underwater?0xa2c9f0:0xd4d9c8);
  this.sun.position.set(e.sunDirection.x*5000,e.sunDirection.y*5000,e.sunDirection.z*5000);
  this.moon.position.copy(this.sun.position).multiplyScalar(-1);
  this.moon.intensity=(1-e.daylight)*(1-e.cloud*.85)*(underwater?.025:.28);
  this.particles.visible=underwater;this.light.visible=underwater;
  const liveShipIds=new Set(s.ships.map(v=>v.id));for(const [id,mesh] of this.ships)if(!liveShipIds.has(id)){this.scene.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});this.ships.delete(id);}
  for(const ship of s.ships){
   const sub=ship.kind==='sub',sunk=ship.hull<=0;
   let mesh=this.ships.get(ship.id);
   if(mesh?.userData.wreck&&!sunk){this.scene.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});mesh=null;}
   if(!mesh){mesh=this.makeShip(ship);this.ships.set(ship.id,mesh);this.scene.add(mesh);}
   if(sunk&&!mesh.userData.wreck)damageWreck(T,mesh,sub);
   const d=Math.hypot(listener.x-ship.x,listener.y-ship.y),drop=ship.sinkDepth||0;
   mesh.visible=(drone||orbiting||!sub)&&d<(underwater?350:e.opticalRange);
   if(mesh.userData.lights)mesh.userData.lights.visible=!sunk&&!underwater&&e.daylight<.85&&d<e.lightRange;
   if(!underwater&&!sunk&&!sub&&d<e.lightRange&&mesh.userData.body){mesh.visible=true;mesh.userData.body.visible=d<e.opticalRange;}
   else if(mesh.userData.body)mesh.userData.body.visible=true;
   mesh.position.set(ship.x,(sub?-ship.depth:sunk?0:surfaceHeight(ship.x,ship.y,time,e)*.65)-drop,-ship.y);
   mesh.rotation.order='YXZ';mesh.rotation.y=-rad(ship.heading);
   mesh.rotation.z=sunk?Math.min(1.38,.18+drop*.018):Math.sin(time*.8+ship.x)*.012*e.waveScale+Math.min(.35,(ship.flood||0)*.012);
   mesh.rotation.x=sunk?.06:Math.sin(time*.55+ship.y)*.008*e.waveScale;
   if(mesh.userData.prop)mesh.userData.prop.rotation.z=time*ship.speed*.8;
   if(ship.kind==='sub')this.updateTubeDoors(mesh,s.projectiles,ship.id);
  }
  const screw=this.own.userData.prop;
  screw.rotation.z=renderedScrewAngle(screw.rotation.z,s.propRpm,motionDt);
  this.own.userData.foreplanes.rotation.x=-s.planes;this.own.userData.aftplanes.rotation.x=s.planes;this.own.userData.rudder.rotation.y=s.rudder*.5;this.own.userData.mast.visible=s.systems.periscope>0;this.own.userData.gun.visible=!gun;this.own.userData.gun.rotation.y=-rad(s.gun.angle);this.own.userData.gunElevation.rotation.x=rad(s.gun.elevation);
  this.updateTubeDoors(this.own,s.projectiles,null);
  this.own.userData.rescueHatch.rotation.z=s.mission==='undersea-rescue'&&s.operation?.active?1.1:0;
  this.bubbles.visible=s.cavitation>.01;this.bubbleUniforms.strength.value=s.cavitation;
  this.bubbleUniforms.clock.value=time;this.bubbleUniforms.trailLength.value=Math.abs(s.speed)*1.4;
  this.life.update(s,e);this.combat.update(s,e,orbiting);
  const cable=tetherPoints(s,time);this.cable.visible=!!cable.length;if(cable.length){const p=this.cable.geometry.attributes.position;cable.forEach((v,i)=>p.setXYZ(i,v.x,-v.depth+heave*(1-i/(cable.length-1)),-v.y));p.needsUpdate=true;this.cable.geometry.setDrawRange(0,cable.length);this.cable.geometry.computeBoundingSphere();}

  this.driftingBubbles.visible=underwater;
  if(underwater){
   const positions=this.driftingBubbles.geometry.attributes.position;
   const origin=[this.camera.position.x,this.camera.position.y,this.camera.position.z].map(value=>Math.floor(value/80)*80);
   let count=0;
   for(let i=0;i<72;i++){
    const seed=s.patrol.seed+i,cycle=hash01(seed,732)*28,age=(time+cycle)%28;
    if(age>18)continue;
    const x=origin[0]+(hash01(seed,733)-.25)*160+Math.sin(time*.8+i)*.7;
    const y=origin[1]+(hash01(seed,734)-.25)*95+age*.45;
    const z=origin[2]+(hash01(seed,735)-.25)*160+Math.cos(time*.75+i)*.7;
    if(y<surfaceHeight(x,-z,time,e)&&y>-bottom(x,-z))positions.setXYZ(count++,x,y,z);
   }
   positions.needsUpdate=true;this.driftingBubbles.geometry.setDrawRange(0,count);
  }
  this.camera.updateProjectionMatrix();const blastFlash=this.atmosphere.update(s,e,this.camera,underwater,frameSeconds);this.waterUniforms.flash.value=Math.max(blastFlash*.45,e.flash*(underwater?.05:.35));this.renderer.render(this.scene,this.camera);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));this.boltVisible=[...this.atmosphere.strikes.values()].some(group=>group.visible&&group.children[1].material.opacity>.2&&frustum.intersectsObject(group.children[1]));
 }
}
