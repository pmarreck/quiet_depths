import * as T from './vendor/three.module.js';
import {bottom,rad} from './sim.js';
import {feedActive,scopeBearing,cameraEuler} from './controls.js';
import {environmentAt,SEA_SAMPLE_GLSL,surfaceHeight,scopeEyeHeight,scopeWashed} from './environment.js';
import {Atmosphere} from './atmosphere.js';
import {UnderseaLife} from './undersea.js';
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
  this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1));this.renderer.setClearColor(0x687a78);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.scene=new T.Scene();this.scene.fog=new T.FogExp2(0x627475,.00015);this.camera=new T.PerspectiveCamera(38,1,.5,23000);
  this.hemi=new T.HemisphereLight(0xd4d9c8,0x18353e,2);this.scene.add(this.hemi);this.sun=new T.DirectionalLight(0xffd6a0,2.7);this.scene.add(this.sun);this.moon=new T.DirectionalLight(0xb8d3ff,.2);this.scene.add(this.moon);
  this.waterUniforms={time:{value:0},origin:{value:new T.Vector2()},sunDir:{value:new T.Vector3(-.5,.12,-1).normalize()},underwater:{value:0},waveScale:{value:1},waveSpeed:{value:1},daylight:{value:1},cloud:{value:0},twilight:{value:0},fogColor:{value:new T.Color()},fogDensity:{value:.0002},flash:{value:0}};
  const geo=new T.PlaneGeometry(30000,30000,256,256);const wp=geo.attributes.position;for(let i=0;i<wp.count;i++){for(const axis of ['X','Y']){const u=wp['get'+axis](i)/15000;wp['set'+axis](i,Math.sign(u)*15000*Math.pow(Math.abs(u),2.4));}}this.water=new T.Mesh(geo,new T.ShaderMaterial({uniforms:this.waterUniforms,vertexShader:waterVertex,fragmentShader:waterFragment,side:T.DoubleSide}));this.water.rotation.x=-Math.PI/2;this.scene.add(this.water);
  this.atmosphere=new Atmosphere(this.scene);
  const terrainGeo=new T.PlaneGeometry(16000,16000,140,140);const pos=terrainGeo.attributes.position;const colors=[];for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const b=bottom(x,y);pos.setZ(i,-b);const c=new T.Color(b<0?0x414c42:0x264541);c.multiplyScalar(.8+Math.random()*.3);colors.push(c.r,c.g,c.b);}terrainGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();this.terrain=new T.Mesh(terrainGeo,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));this.terrain.rotation.x=-Math.PI/2;this.scene.add(this.terrain);
  this.ships=new Map();this.own=this.makeSub();this.scene.add(this.own);
  this.life=new UnderseaLife(this.scene,()=>this.makeSub(),ship=>this.makeShip(ship));
  const bubbles=new T.BufferGeometry();bubbles.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(256*3),3));this.bubbleUniforms={strength:{value:0}};
  this.bubbles=new T.Points(bubbles,new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:this.bubbleUniforms,vertexShader:'uniform float strength;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(160.*strength/-p.z,1.,8.);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform float strength;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.72,.9,.96,(1.-r)*strength*.7);}'}));this.own.add(this.bubbles);
  this.light=new T.SpotLight(0xc8efdc,120,240,Math.PI/3,.8,1.3);this.scene.add(this.light,this.light.target);
  const particles=new T.BufferGeometry(),pts=[];for(let i=0;i<800;i++)pts.push((Math.random()-.5)*600,(Math.random()-.5)*220,(Math.random()-.5)*600);particles.setAttribute('position',new T.Float32BufferAttribute(pts,3));this.particles=new T.Points(particles,new T.PointsMaterial({size:.4,color:0x9fc6b2,transparent:true,opacity:.35}));this.scene.add(this.particles);
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
 makeSub(){
  const g=new T.Group(),m=this.mat(0x344a4b),trim=this.mat(0x1b2e32),brass=this.mat(0x9d8851);
  const hull=new T.Mesh(new T.CapsuleGeometry(5,55,8,24),m);hull.rotation.x=Math.PI/2;g.add(hull);
  this.box(g,[5,9,12],[0,7,-5],m);this.box(g,[3.5,.5,32],[0,5,0],trim);
  this.box(g,[6.4,.2,13],[0,11.5,-5],trim);
  const mast=new T.Group();this.box(mast,[.16,6,.16],[0,14,-7],trim);this.box(mast,[.4,.3,.2],[.12,17,-7],trim);g.add(mast);g.userData.mast=mast;
  this.box(g,[.3,4,.3],[1,13,-2],trim);this.box(g,[.25,3,.25],[-1,12,-4],trim);
  for(const z of [-22,25]){const pivot=new T.Group();pivot.position.set(0,z<0?1:0,z);for(const side of [-1,1]){const plane=this.box(pivot,[z<0?6.5:7,.35,z<0?3.5:4.5],[side*6.5,0,0],m);plane.rotation.y=side*.12;}g.add(pivot);g.userData[z<0?'foreplanes':'aftplanes']=pivot;}
  const rudder=new T.Group();rudder.position.set(0,0,28);this.box(rudder,[.45,11,4],[0,0,0],m);g.add(rudder);g.userData.rudder=rudder;
  for(const z of [-18,-7,8,20]){const seam=new T.Mesh(new T.TorusGeometry(5.015,.04,4,32),trim);seam.position.z=z;g.add(seam);}
  for(const y of [-5.1,5.1]){const hatch=new T.Mesh(new T.CylinderGeometry(1.15,1.15,.35,16),brass);if(y<0){const hinge=new T.Group();hinge.position.set(-1.15,y,0);hatch.position.x=1.15;hinge.add(hatch);g.add(hinge);g.userData.rescueHatch=hinge;const hole=new T.Mesh(new T.CircleGeometry(1.08,16),this.mat(0x02090c));hole.rotation.x=Math.PI/2;hole.position.y=-5.03;g.add(hole);}else{hatch.position.set(0,y,-17);g.add(hatch);}}
  for(const side of [-1,1])for(let z=-14;z<20;z+=3)this.box(g,[.08,.22,1.3],[side*3.6,3.45,z],trim);
  const shaft=new T.Mesh(new T.CylinderGeometry(.45,.45,5,12),brass);shaft.rotation.x=Math.PI/2;shaft.position.z=33;g.add(shaft);
  const prop=new T.Group();prop.position.z=35.5;const hub=new T.Mesh(new T.SphereGeometry(.8,12,8),brass);hub.scale.z=1.5;prop.add(hub);
  const bladeShape=new T.Shape();bladeShape.moveTo(.5,-.22);bladeShape.quadraticCurveTo(2.8,-1.6,3.7,-.5);bladeShape.quadraticCurveTo(4,.6,2.9,.8);bladeShape.quadraticCurveTo(1.7,.8,.5,.22);
  const geo=new T.ExtrudeGeometry(bladeShape,{depth:.15,bevelEnabled:true,bevelThickness:.07,bevelSize:.06,bevelSegments:1,steps:1,curveSegments:8});
  for(let i=0;i<5;i++){const pivot=new T.Group();pivot.rotation.z=i*Math.PI*2/5;const blade=new T.Mesh(geo,brass);blade.rotation.x=.35;pivot.add(blade);prop.add(pivot);}g.add(prop);g.userData.prop=prop;
  return g;
 }
 resize(w,h){if(this.canvas.width!==Math.floor(w*this.renderer.getPixelRatio())||this.canvas.height!==Math.floor(h*this.renderer.getPixelRatio())){this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}}
 clear(){this.renderer.setClearColor(0x0a171b);this.renderer.clear();}
 render(s,view,zoom,time){
  if(!feedActive(s,view)){this.clear();return;}
  const e=environmentAt(s),drone=view==='drone',tower=view==='tower',underwater=drone?s.drone.depth>1.5:tower?false:scopeWashed(s,e),listener=drone?s.drone:s;
  const fog=new T.Color(underwater?0x0c3339:0x061022);if(!underwater)fog.lerp(new T.Color(e.cloud>.6?0x526373:0x98b9ce),e.daylight);
  this.waterUniforms.time.value=time;this.waterUniforms.underwater.value=underwater?1:0;this.water.position.set(listener.x,0,-listener.y);this.waterUniforms.origin.value.set(listener.x,listener.y);
  for(const k of ['waveScale','waveSpeed','daylight','cloud','twilight'])this.waterUniforms[k].value=e[k];this.waterUniforms.fogColor.value.copy(fog);this.waterUniforms.fogDensity.value=underwater?.009:1.1/e.opticalRange;this.waterUniforms.sunDir.value.set(e.sunDirection.x,e.sunDirection.y,e.sunDirection.z).normalize();
  this.renderer.setClearColor(fog);this.scene.fog.color.copy(fog);this.scene.fog.density=underwater?.009:1.1/e.opticalRange;this.hemi.intensity=(underwater?.18+.45*e.daylight:.15+1.8*e.daylight)+e.flash*(underwater?.2:2);this.sun.intensity=e.daylight*(1-e.cloud*.7)*(underwater?.2:2.7);this.sun.position.set(e.sunDirection.x*5000,e.sunDirection.y*5000,e.sunDirection.z*5000);this.moon.position.copy(this.sun.position).multiplyScalar(-1);this.moon.intensity=(1-e.daylight)*(1-e.cloud*.85)*.28;this.particles.visible=underwater;this.light.visible=underwater;
  const liveShipIds=new Set(s.ships.map(v=>v.id));for(const [id,mesh] of this.ships)if(!liveShipIds.has(id)){this.scene.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});this.ships.delete(id);}
  for(const ship of s.ships){let mesh=this.ships.get(ship.id);if(!mesh){mesh=this.makeShip(ship);this.ships.set(ship.id,mesh);this.scene.add(mesh);}const d=Math.hypot(listener.x-ship.x,listener.y-ship.y);mesh.visible=ship.hull>0&&(drone||ship.kind!=='sub');if(mesh.userData.body){mesh.userData.body.visible=d<(underwater?350:e.opticalRange);mesh.userData.lights.visible=!underwater&&e.daylight<.85&&d<e.lightRange;}mesh.position.set(ship.x,ship.kind==='sub'?-ship.depth:surfaceHeight(ship.x,ship.y,time,e)*.65,-ship.y);mesh.rotation.y=-rad(ship.heading);mesh.rotation.z=Math.sin(time*.8+ship.x)*.012*e.waveScale;mesh.rotation.x=Math.sin(time*.55+ship.y)*.008*e.waveScale;if(mesh.userData.prop)mesh.userData.prop.rotation.z=time*ship.speed*.8;}
  this.own.visible=drone||tower;this.own.position.set(s.x,-s.depth,-s.y);this.own.rotation.set(s.pitch,-rad(s.heading),0,'YXZ');
  this.own.userData.foreplanes.rotation.x=-s.planes;this.own.userData.aftplanes.rotation.x=s.planes;this.own.userData.rudder.rotation.y=s.rudder*.5;this.own.userData.prop.rotation.z=s.propAngle;this.own.userData.mast.visible=s.systems.periscope>0;
  this.own.userData.rescueHatch.rotation.z=s.mission==='undersea-rescue'&&s.operation?.active?1.1:0;
  this.bubbles.visible=s.cavitation>.01;this.bubbleUniforms.strength.value=s.cavitation;
  if(this.bubbles.visible){const p=this.bubbles.geometry.attributes.position;for(let i=0;i<p.count;i++){const life=(time*2+i*.137)%1,angle=i*2.399+time*8,r=2.5+Math.sin(i*7)*.7;p.setXYZ(i,Math.cos(angle)*r*(1+life*.2),Math.sin(angle)*r+life*.4,35.7+life*(2+Math.abs(s.speed)*.3));}p.needsUpdate=true;}
  this.life.update(s,e);
  let pose;
  if(drone){const d=s.drone,a=rad(d.heading);this.camera.position.set(d.x,d.depth<.5?.8:-d.depth,-d.y);pose=cameraEuler(d.heading,-Math.atan2(3,100),0);this.light.position.copy(this.camera.position);this.light.target.position.set(d.x+Math.sin(a)*100,-d.depth-5,-d.y-Math.cos(a)*100);this.particles.position.copy(this.camera.position);this.camera.fov=65;}
  else if(tower){const a=rad(s.heading);this.camera.position.set(s.x+Math.sin(a)*5+Math.cos(a)*3.2,12.9-s.depth+surfaceHeight(s.x,s.y,time,e)*.3,-s.y-Math.cos(a)*5+Math.sin(a)*3.2);pose=cameraEuler(s.heading+s.towerAngle,s.towerPitch,Math.sin(time*.55)*.004*e.waveScale);this.camera.fov=65/zoom;}
  else {this.camera.position.set(s.x,scopeEyeHeight(s,e),-s.y);pose=cameraEuler(scopeBearing(s),Math.atan2(-3+Math.sin(time*.3)*1.5,1000),Math.sin(time*.55)*.005*e.waveScale);this.camera.fov=38/zoom;}
  this.camera.rotation.set(pose.x,pose.y,pose.z,pose.order);
  this.camera.updateProjectionMatrix();const blastFlash=this.atmosphere.update(s,e,this.camera,underwater);this.waterUniforms.flash.value=Math.max(blastFlash*.45,e.flash*(underwater?.05:.35));this.renderer.render(this.scene,this.camera);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));this.boltVisible=[...this.atmosphere.strikes.values()].some(group=>group.visible&&group.children[1].material.opacity>.2&&frustum.intersectsObject(group.children[1]));
 }
}
