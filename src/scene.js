import * as T from './vendor/three.module.js';
import {bottom,rad} from './sim.js';
import {feedActive,scopeBearing,cameraEuler,droneCameraPitch} from './controls.js';
import {environmentAt,SEA_SAMPLE_GLSL,surfaceHeight,scopeEyeHeight,scopeWashed,opticalSway,hash01} from './environment.js';
import {Atmosphere} from './atmosphere.js';
import {UnderseaLife} from './undersea.js';
import {createSubmarine} from './submarine-model.js';
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
uniform float time;uniform vec3 sunDir;uniform float underwater;uniform float daylight;uniform float cloud;uniform float twilight;uniform float waveScale;uniform vec3 fogColor;uniform float fogDensity;uniform float flash;
varying vec3 vWorld;varying vec3 vNormal;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
void main(){vec3 V=normalize(cameraPosition-vWorld);vec3 N=normalize(vNormal);N.x+=sin(vWorld.x*.16+time*1.6)*.035+noise(vWorld.xz*.18+time*.1)*.06;N.z+=sin(vWorld.z*.23-time*1.4)*.045;N=normalize(N);float fres=pow(1.-max(dot(V,N),0.),3.);float spec=pow(max(dot(reflect(-sunDir,N),V),0.),90.);vec3 deep=mix(vec3(.005,.014,.026),mix(vec3(.025,.16,.23),vec3(.035,.10,.13),cloud),daylight);vec3 reflection=mix(vec3(.025,.05,.085),mix(vec3(.43,.60,.72),vec3(.27,.34,.39),cloud),daylight);vec3 col=mix(deep,reflection,fres*.85);col+=vec3(1.,.69,.35)*spec*daylight*(1.-cloud*.85);col+=vec3(.2,.075,.025)*twilight*pow(fres,2.)*.4;float band=sin(vWorld.x*.051+vWorld.z*.032+time)*sin(vWorld.z*.08-time*.7);float foam=smoothstep(1.2,1.9,vWorld.y/max(waveScale,.1))*smoothstep(.7,1.,band);col=mix(col,mix(vec3(.07,.11,.14),vec3(.65,.74,.77),daylight),foam*.6);float dist=length(cameraPosition-vWorld);if(underwater>.5)col=mix(vec3(.006,.03,.045),vec3(.05,.17,.18),max(dot(V,-N),0.));col=mix(col,fogColor,1.-exp(-pow(dist*fogDensity,2.)));col+=vec3(.32,.43,.6)*flash;gl_FragColor=vec4(col,1.);}`;
export class OceanScene{
 constructor(canvas){
  this.THREE=T;this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1));this.renderer.setClearColor(0x687a78);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.scene=new T.Scene();this.scene.fog=new T.FogExp2(0x627475,.00015);this.camera=new T.PerspectiveCamera(38,1,.5,23000);
  this.hemi=new T.HemisphereLight(0xd4d9c8,0x18353e,2);this.scene.add(this.hemi);this.sun=new T.DirectionalLight(0xffd6a0,2.7);this.scene.add(this.sun);this.moon=new T.DirectionalLight(0xb8d3ff,.2);this.scene.add(this.moon);
  this.waterUniforms={time:{value:0},origin:{value:new T.Vector2()},sunDir:{value:new T.Vector3(-.5,.12,-1).normalize()},underwater:{value:0},waveScale:{value:1},waveSpeed:{value:1},daylight:{value:1},cloud:{value:0},twilight:{value:0},fogColor:{value:new T.Color()},fogDensity:{value:.0002},flash:{value:0}};
  const geo=new T.PlaneGeometry(30000,30000,256,256);const wp=geo.attributes.position;for(let i=0;i<wp.count;i++){for(const axis of ['X','Y']){const u=wp['get'+axis](i)/15000;wp['set'+axis](i,Math.sign(u)*15000*Math.pow(Math.abs(u),2.4));}}this.water=new T.Mesh(geo,new T.ShaderMaterial({uniforms:this.waterUniforms,vertexShader:waterVertex,fragmentShader:waterFragment,side:T.DoubleSide}));this.water.rotation.x=-Math.PI/2;this.scene.add(this.water);
  this.atmosphere=new Atmosphere(this.scene);
  const terrainGeo=new T.PlaneGeometry(16000,16000,140,140);const pos=terrainGeo.attributes.position;const colors=[];for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const b=bottom(x,y);pos.setZ(i,-b);const c=new T.Color(b<0?0x414c42:0x264541);c.multiplyScalar(.8+Math.random()*.3);colors.push(c.r,c.g,c.b);}terrainGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();this.terrain=new T.Mesh(terrainGeo,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));this.terrain.rotation.x=-Math.PI/2;this.scene.add(this.terrain);
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
  const bubbles=new T.BufferGeometry();bubbles.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(256*3),3));this.bubbleUniforms={strength:{value:0}};
  this.bubbles=new T.Points(bubbles,new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:this.bubbleUniforms,vertexShader:'uniform float strength;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(160.*strength/-p.z,1.,8.);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform float strength;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.72,.9,.96,(1.-r)*strength*.7);}'}));this.own.add(this.bubbles);
  this.light=new T.SpotLight(0xd5e5ea,ROV_LAMP_INTENSITY,240,Math.PI/3,.8,2);this.scene.add(this.light,this.light.target);
  const particles=new T.BufferGeometry(),pts=[];for(let i=0;i<800;i++)pts.push((Math.random()-.5)*600,(Math.random()-.5)*220,(Math.random()-.5)*600);particles.setAttribute('position',new T.Float32BufferAttribute(pts,3));this.particles=new T.Points(particles,new T.PointsMaterial({size:.4,color:0x9fc6b2,transparent:true,opacity:.35}));this.scene.add(this.particles);
  const drifting=new T.BufferGeometry();drifting.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(72*3),3));
  this.driftingBubbles=new T.Points(drifting,new T.PointsMaterial({map:this.glowTexture(),size:.55,color:0xc2eaf4,transparent:true,opacity:.55,depthWrite:false}));
  this.driftingBubbles.frustumCulled=false;this.scene.add(this.driftingBubbles);
 }
 mat(color){return new T.MeshStandardMaterial({color,roughness:.86,metalness:.12});}
 box(g,size,pos,mat){const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.position.set(...pos);g.add(m);return m;}
 glowTexture(){if(this.glow)return this.glow;const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const c=canvas.getContext('2d'),gradient=c.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.12,'#ffffffe0');gradient.addColorStop(.4,'#ffffff44');gradient.addColorStop(1,'#ffffff00');c.fillStyle=gradient;c.fillRect(0,0,32,32);this.glow=new T.CanvasTexture(canvas);return this.glow;}
 makeShip(ship){
  if(ship.kind==='sub')return this.makeSub();
  const root=new T.Group(),g=new T.Group(),lights=new T.Group(),small=ship.kind==='fishing',escort=ship.kind==='escort';const scale=small?.38:escort?.78:1;root.add(g,lights);root.userData.body=g;root.userData.lights=lights;
  const hullMat=this.mat(escort?0x505f60:0x343b3b),deck=this.mat(0x737969),rust=this.mat(0x6b4633);
  const hull=new T.Mesh(new T.CylinderGeometry(17,14,130,8,1),hullMat);hull.rotation.x=Math.PI/2;hull.scale.x=.8;hull.scale.z=.6;hull.position.y=3;g.add(hull);
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
 render(s,view,zoom,time,orbit){
  if(!feedActive(s,view)){this.clear();return;}
  const orbiting=view==='orbit',e=environmentAt(s),drone=view==='drone',tower=view==='tower',gun=view==='gun',listener=drone?s.drone:s;
  if(orbiting){
   const offset=orbit.distance*Math.cos(orbit.pitch),x=s.x+offset*Math.sin(orbit.yaw),y=s.y+offset*Math.cos(orbit.yaw);
   const elevation=Math.max(-bottom(x,y)+1,-s.depth+orbit.distance*Math.sin(orbit.pitch));
   this.camera.position.set(x,elevation,-y);this.camera.lookAt(s.x,-s.depth,-s.y);this.camera.fov=56;
   this.light.position.copy(this.camera.position);this.light.target.position.set(s.x,-s.depth,-s.y);this.particles.position.copy(this.camera.position);
  }
  // Keep the virtual orbit light readable as the camera moves away from the hull.
  this.light.intensity=orbiting?2.8*orbit.distance**2:ROV_LAMP_INTENSITY;
  const underwater=orbiting?this.camera.position.y<surfaceHeight(this.camera.position.x,-this.camera.position.z,time,e):drone?s.drone.depth>1.5:tower||gun?false:scopeWashed(s,e);
  this.caustics.causticTime.value=time*(.7+e.waveScale*.2);
  this.caustics.causticStrength.value=underwater?.34*e.daylight*(1-e.cloud*.85)*Math.exp(-s.depth/37):0;
  const fog=new T.Color(underwater?0x0c3339:0x061022);if(!underwater)fog.lerp(new T.Color(e.cloud>.6?0x526373:0x98b9ce),e.daylight);
  this.waterUniforms.time.value=time;this.waterUniforms.underwater.value=underwater?1:0;this.water.position.set(listener.x,0,-listener.y);this.waterUniforms.origin.value.set(listener.x,listener.y);
  for(const k of ['waveScale','waveSpeed','daylight','cloud','twilight'])this.waterUniforms[k].value=e[k];this.waterUniforms.fogColor.value.copy(fog);this.waterUniforms.fogDensity.value=underwater?.009:1.1/e.opticalRange;this.waterUniforms.sunDir.value.set(e.sunDirection.x,e.sunDirection.y,e.sunDirection.z).normalize();
  this.renderer.setClearColor(fog);this.scene.fog.color.copy(fog);this.scene.fog.density=underwater?.009:1.1/e.opticalRange;this.hemi.intensity=(underwater?.18+.45*e.daylight:.15+1.8*e.daylight)+e.flash*(underwater?.2:2);this.sun.intensity=e.daylight*(1-e.cloud*.7)*(underwater?.2:2.7);this.sun.position.set(e.sunDirection.x*5000,e.sunDirection.y*5000,e.sunDirection.z*5000);this.moon.position.copy(this.sun.position).multiplyScalar(-1);this.moon.intensity=(1-e.daylight)*(1-e.cloud*.85)*.28;this.particles.visible=underwater;this.light.visible=underwater;
  const liveShipIds=new Set(s.ships.map(v=>v.id));for(const [id,mesh] of this.ships)if(!liveShipIds.has(id)){this.scene.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});this.ships.delete(id);}
  for(const ship of s.ships){let mesh=this.ships.get(ship.id);if(!mesh){mesh=this.makeShip(ship);this.ships.set(ship.id,mesh);this.scene.add(mesh);}const d=Math.hypot(listener.x-ship.x,listener.y-ship.y);mesh.visible=(ship.hull>0||ship.sunkAt!==undefined&&(ship.sinkDepth||0)<50)&&(drone||ship.kind!=='sub');if(mesh.userData.body){mesh.userData.body.visible=d<(underwater?350:e.opticalRange);mesh.userData.lights.visible=!underwater&&e.daylight<.85&&d<e.lightRange;}mesh.position.set(ship.x,ship.kind==='sub'?-ship.depth:surfaceHeight(ship.x,ship.y,time,e)*.65-(ship.sinkDepth||0),-ship.y);mesh.rotation.y=-rad(ship.heading);mesh.rotation.z=Math.sin(time*.8+ship.x)*.012*e.waveScale+(ship.flood?Math.min(.35,ship.flood*.012):0);mesh.rotation.x=Math.sin(time*.55+ship.y)*.008*e.waveScale;if(mesh.userData.prop)mesh.userData.prop.rotation.z=time*ship.speed*.8;}
  this.own.visible=drone||tower||gun||orbiting;this.own.position.set(s.x,-s.depth,-s.y);this.own.rotation.set(s.pitch,-rad(s.heading),0,'YXZ');
  this.own.userData.foreplanes.rotation.x=-s.planes;this.own.userData.aftplanes.rotation.x=s.planes;this.own.userData.rudder.rotation.y=s.rudder*.5;this.own.userData.prop.rotation.z=s.propAngle;this.own.userData.mast.visible=s.systems.periscope>0;this.own.userData.gun.visible=!gun;this.own.userData.gun.rotation.y=-rad(s.gun.angle);this.own.userData.gunElevation.rotation.x=rad(s.gun.elevation);
  this.own.userData.rescueHatch.rotation.z=s.mission==='undersea-rescue'&&s.operation?.active?1.1:0;
  this.bubbles.visible=s.cavitation>.01;this.bubbleUniforms.strength.value=s.cavitation;
  if(this.bubbles.visible){const p=this.bubbles.geometry.attributes.position;for(let i=0;i<p.count;i++){const life=(time*2+i*.137)%1,angle=i*2.399+time*8,r=D.propellerRadius*(.55+Math.sin(i*7)*.15);p.setXYZ(i,Math.cos(angle)*r*(1+life*.2),Math.sin(angle)*r+life*.4,D.propellerZ+.2+life*(2+Math.abs(s.speed)*.3));}p.needsUpdate=true;}
  this.life.update(s,e);this.combat.update(s,e);
  const cable=tetherPoints(s,time);this.cable.visible=!!cable.length;if(cable.length){const p=this.cable.geometry.attributes.position;cable.forEach((v,i)=>p.setXYZ(i,v.x,-v.depth,-v.y));p.needsUpdate=true;this.cable.geometry.setDrawRange(0,cable.length);this.cable.geometry.computeBoundingSphere();}

  const sway=opticalSway(s,view,time);this.sun.color.setHex(underwater?0xbad8dd:0xffd6a0);this.hemi.color.setHex(underwater?0xc1d6dc:0xd4d9c8);
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
  else if(tower){const a=rad(s.heading);this.camera.position.set(s.x+Math.sin(a)*5+Math.cos(a)*3.2,12.9-s.depth+surfaceHeight(s.x,s.y,time,e)*.3,-s.y-Math.cos(a)*5+Math.sin(a)*3.2);pose=cameraEuler(s.heading+s.towerAngle+sway.yaw*180/Math.PI,s.towerPitch+sway.pitch,sway.roll);this.camera.fov=65/zoom;}
  else if(!orbiting){this.camera.position.set(s.x,scopeEyeHeight(s,e),-s.y);pose=cameraEuler(scopeBearing(s)+sway.yaw*180/Math.PI,Math.atan2(-3+Math.sin(time*.3)*1.5,1000)+sway.pitch,sway.roll);this.camera.fov=38/zoom;}
  if(pose)this.camera.rotation.set(pose.x,pose.y,pose.z,pose.order);
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
  this.camera.updateProjectionMatrix();const blastFlash=this.atmosphere.update(s,e,this.camera,underwater);this.waterUniforms.flash.value=Math.max(blastFlash*.45,e.flash*(underwater?.05:.35));this.renderer.render(this.scene,this.camera);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));this.boltVisible=[...this.atmosphere.strikes.values()].some(group=>group.visible&&group.children[1].material.opacity>.2&&frustum.intersectsObject(group.children[1]));
 }
}
