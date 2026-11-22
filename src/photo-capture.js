import {lensFilter} from './instrument-damage.js';
import {operatingFraction} from './equipment.js';
import {WEATHER,surfaceHeight} from './environment.js';

const MAX_SIDE=640,MAX_CHARACTERS=300000;
const finite=Number.isFinite;
export function captureSize(width,height,maxSide=MAX_SIDE){
 if(!finite(width)||!finite(height)||width<=0||height<=0||!finite(maxSide)||maxSide<1)return null;
 const scale=Math.min(1,maxSide/Math.max(width,height));return{width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export function flipRgbaRows(bytes,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||bytes.length!==width*height*4)throw new RangeError('Invalid photographic pixel buffer');
 const flipped=new Uint8ClampedArray(bytes.length),stride=width*4;
 for(let row=0;row<height;row++)flipped.set(bytes.subarray(row*stride,(row+1)*stride),(height-1-row)*stride);
 return flipped;
}
export function planSatelliteCapture(packet){
 const area=packet?.area;
 if(!area||!['x','y','size'].every(k=>finite(area[k]))||area.size!==10000||!finite(packet.capturedAt)||!Array.isArray(packet.sceneShips))throw new RangeError('Invalid frozen reconnaissance photograph');
 const half=area.size/2,night=!!packet.night;
 const ships=packet.sceneShips.filter(v=>v&&typeof v.id==='string'&&['x','y','heading','speed','hull'].every(k=>finite(v[k]))&&v.hull>0&&v.kind!=='sub'&&Math.abs(v.x-area.x)<=half&&Math.abs(v.y-area.y)<=half).slice(0,256).map(v=>({id:v.id,x:v.x,y:v.y,heading:v.heading,speed:v.speed,hull:v.hull,kind:night?'light':v.kind}));
 return{width:640,height:640,area:{x:area.x,y:area.y,size:area.size},capturedAt:packet.capturedAt,night,ships,coverage:Math.max(0,Math.min(1,packet.coverage??1)),quality:Math.max(0,Math.min(1,packet.quality??1)),weather:{...packet.weather},id:String(packet.photoId||packet.id||'satellite').slice(0,60)};
}
export function satelliteCamera(plan,T){
 const half=plan.area.size/2,camera=new T.OrthographicCamera(-half,half,half,-half,1,30000);
 camera.position.set(plan.area.x,15000,-plan.area.y);camera.up.set(0,0,-1);camera.lookAt(plan.area.x,0,-plan.area.y);camera.updateProjectionMatrix();return camera;
}
function available(o){return !!o?.renderer&&!!o.renderer.getContext()&&!o.renderer.getContext().isContextLost();}
function canvas2d(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Photographic canvas is unavailable');return{canvas,context};}
function encode(canvas){
 let current=canvas;
 for(const side of [640,512,384]){
  if(Math.max(current.width,current.height)>side){const size=captureSize(current.width,current.height,side),next=canvas2d(size.width,size.height);next.context.drawImage(current,0,0,size.width,size.height);current=next.canvas;}
  for(const quality of [.82,.7,.56]){const image=current.toDataURL('image/jpeg',quality);if(/^data:image\/jpeg;base64,/.test(image)&&image.length<MAX_CHARACTERS)return image;}
 }
 return null;
}
function noise(seed){let value=seed|0;return()=>{value=(Math.imul(value,1664525)+1013904223)|0;return(value>>>0)/4294967296;};}
function seedOf(text){let seed=1972;for(const c of String(text))seed=(Math.imul(seed,31)+c.charCodeAt(0))|0;return seed;}
function finish(canvas,context,{seed=1972,grayscale=.32,stamp=''}={}){
 const pixels=context.getImageData(0,0,canvas.width,canvas.height),random=noise(seed),data=pixels.data;
 for(let i=0;i<data.length;i+=4){const luma=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2],grain=(random()-.5)*5;
  for(let channel=0;channel<3;channel++)data[i+channel]=Math.max(0,Math.min(255,data[i+channel]*(1-grayscale)+luma*grayscale+grain));data[i+3]=255;
 }
 context.putImageData(pixels,0,0);context.strokeStyle='rgba(12,15,13,.72)';context.lineWidth=2;context.strokeRect(1,1,canvas.width-2,canvas.height-2);
 if(stamp){context.font='10px ui-monospace,monospace';context.fillStyle='rgba(12,15,13,.76)';context.fillRect(4,canvas.height-20,Math.min(canvas.width-8,stamp.length*6.2+12),15);context.fillStyle='#deded2';context.fillText(stamp,9,canvas.height-9);}
 return encode(canvas);
}
export function captureOptics(o,health=100){
 if(!operatingFraction(health))return null;
 if(!available(o))return null;const source=o.canvas||o.renderer.domElement,size=captureSize(source?.width,source?.height);if(!size)return null;
 const {canvas,context}=canvas2d(size.width,size.height);
 if(health<100&&!('filter' in context)){
  // Older WebKit canvases lack filter. Re-enlarge a reduced exposure to
  // retain the soft detail of the live lens in the archived photograph.
  const scale=1/(1+(100-health)*.09);
  const reduced=canvas2d(Math.max(1,Math.round(size.width*scale)),Math.max(1,Math.round(size.height*scale)));
  reduced.context.drawImage(source,0,0,reduced.canvas.width,reduced.canvas.height);
  context.drawImage(reduced.canvas,0,0,size.width,size.height);
 }else{
  context.filter=lensFilter(health)||'none';
  context.drawImage(source,0,0,size.width,size.height);
  context.filter='none';
 }
 return finish(canvas,context,{seed:source.width*31+source.height});
}
function photoEnvironment(plan){
 const preset=WEATHER[plan.weather.id]||WEATHER.clear,daylight=finite(plan.weather.daylight)?plan.weather.daylight:plan.night?0:1,hour=finite(plan.weather.hour)?plan.weather.hour:plan.night?22:12,angle=(hour-6)*Math.PI/12;
 return{...preset,...plan.weather,daylight,twilight:1-Math.abs(daylight*2-1),sunDirection:{x:Math.cos(angle),y:Math.sin(angle),z:-.32}};
}
function disposeGroup(group){
 const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry&&!o.isSprite)geometries.add(o.geometry);if(o.material)for(const material of Array.isArray(o.material)?o.material:[o.material])materials.add(material);});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();group.removeFromParent();
}

// Frame just this boat with an independent orbit camera. A save from sonar or
// a dark station still has a recognizable portrait and reveals no contacts.
export function captureSlotPortrait(o,s){
 if(!available(o))return '';
 const T=o.THREE,r=o.renderer,width=240,height=104;
 const world=new T.Scene(),boat=o.makeSub(),camera=new T.PerspectiveCamera(32,width/height,.1,200);
 const target=new T.WebGLRenderTarget(width,height);
 target.texture.colorSpace=T.SRGBColorSpace;
 const previous=r.getRenderTarget(),viewport=r.getViewport(new T.Vector4()),scissor=r.getScissor(new T.Vector4()),scissorTest=r.getScissorTest();
 const clear=r.getClearColor(new T.Color()),alpha=r.getClearAlpha();
 try{
  world.background=new T.Color(s.depth<5?0x375d68:0x183c4b);
  boat.rotation.x=s.pitch;
  boat.userData.mast.visible=s.systems.periscope>0;
  boat.userData.gun.rotation.y=-s.gun.angle*Math.PI/180;
  boat.userData.foreplanes.rotation.x=-s.planes;boat.userData.aftplanes.rotation.x=s.planes;
  const sun=new T.DirectionalLight(0xffe8bf,3.2);sun.position.set(28,50,-36);
  world.add(boat,new T.HemisphereLight(0xd4ebf0,0x497180,2.6),sun);
  camera.position.set(56,19,-14);camera.lookAt(0,2,0);
  r.setRenderTarget(target);r.setScissorTest(false);r.setViewport(0,0,width,height);r.render(world,camera);
  const bytes=new Uint8Array(width*height*4);r.readRenderTargetPixels(target,0,0,width,height,bytes);
  const {canvas,context}=canvas2d(width,height),image=context.createImageData(width,height);
  image.data.set(flipRgbaRows(bytes,width,height));context.putImageData(image,0,0);
  return canvas.toDataURL('image/jpeg',.8);
 }finally{
  r.setRenderTarget(previous);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);
  r.setClearColor(clear,alpha);target.dispose();disposeGroup(boat);
 }
}
function clouds(canvas,context,plan){
 if(plan.coverage>=.99)return;
 const layer=canvas2d(canvas.width,canvas.height),c=layer.context,random=noise(seedOf(plan.id)+41),opacity=.2+(1-plan.coverage)*.7;
 // Detected returns get small clear apertures. Omitted ships were never in the
 // rendered graph, so neither a clear gap nor photo contrast can reveal them.
 c.fillStyle=`rgba(194,197,190,${opacity*.35})`;c.fillRect(0,0,canvas.width,canvas.height);
 for(let i=0;i<30;i++){const x=random()*canvas.width,y=random()*canvas.height,r=45+random()*130,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(209,211,204,${opacity})`);g.addColorStop(1,'rgba(209,211,204,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
 c.globalCompositeOperation='destination-out';for(const ship of plan.ships){const x=(.5+(ship.x-plan.area.x)/plan.area.size)*canvas.width,y=(.5-(ship.y-plan.area.y)/plan.area.size)*canvas.height,r=14,g=c.createRadialGradient(x,y,3,x,y,r);g.addColorStop(0,'rgba(0,0,0,.9)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}c.globalCompositeOperation='source-over';context.drawImage(layer.canvas,0,0);
}
export function captureSatellite(o,s,packet){
 if(!available(o))return null;
 const T=o.THREE;if(!T)throw new Error('Photographic renderer namespace is unavailable');
 const plan=planSatelliteCapture(packet),world=o.scene,renderer=o.renderer,environment=photoEnvironment(plan),camera=satelliteCamera(plan,T),group=new T.Group();
 const visibility=new Map(world.children.map(child=>[child,child.visible])),fog=world.fog,background=world.background,position=o.water.position.clone(),liveWater=o.water.material;
 // The low-altitude wave mesh aliases badly over a 10 km orthographic frame.
 // Individual waves are below the plate's resolution; use their mean sea tone.
 const photoWater=new T.MeshBasicMaterial({color:plan.night?0x070b0e:0x344047,side:T.DoubleSide});
 const uniforms=Object.fromEntries(Object.entries(o.waterUniforms).map(([key,u])=>[key,u.value?.clone?.()??u.value]));
 const lights=[o.hemi,o.sun,o.moon].filter(Boolean).map(light=>({light,intensity:light.intensity,position:light.position.clone()}));
 const previous={target:renderer.getRenderTarget(),clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest()};
 const target=new T.WebGLRenderTarget(plan.width,plan.height,{format:T.RGBAFormat,type:T.UnsignedByteType,depthBuffer:true,stencilBuffer:false});target.texture.colorSpace=T.SRGBColorSpace;
 try{
  o.water.material=photoWater;
  const keep=new Set([o.water,o.terrain,o.hemi,o.sun,o.moon]);for(const child of world.children)child.visible=keep.has(child);world.fog=null;world.background=null;world.add(group);
  o.water.position.set(plan.area.x,0,-plan.area.y);
  const setUniform=(key,value)=>{const u=o.waterUniforms[key];if(!u)return;if(u.value?.set&&Array.isArray(value))u.value.set(...value);else u.value=value;};
  setUniform('origin',[plan.area.x,plan.area.y]);setUniform('time',plan.capturedAt);setUniform('underwater',0);setUniform('flash',0);setUniform('fogDensity',0);
  for(const key of ['daylight','cloud','twilight','waveScale','waveSpeed'])setUniform(key,environment[key]);setUniform('sunDir',[environment.sunDirection.x,environment.sunDirection.y,environment.sunDirection.z]);
  if(o.hemi)o.hemi.intensity=.18+1.8*environment.daylight;
  if(o.sun){o.sun.intensity=environment.daylight*(1-environment.cloud*.7)*2.7;o.sun.position.set(environment.sunDirection.x*5000,environment.sunDirection.y*5000,environment.sunDirection.z*5000);}
  if(o.moon){o.moon.intensity=(1-environment.daylight)*.28;o.moon.position.set(-environment.sunDirection.x*5000,-environment.sunDirection.y*5000,-environment.sunDirection.z*5000);}
  for(const ship of plan.ships){
   let model;
   if(plan.night||ship.kind==='light'){model=new T.Sprite(new T.SpriteMaterial({map:o.glowTexture(),color:0xf2f0d8,transparent:true,depthWrite:false,toneMapped:false}));model.scale.set(35,35,1);}
   else{model=o.makeShip(ship);if(model.userData.lights)model.userData.lights.visible=false;model.rotation.y=-ship.heading*Math.PI/180;}
   model.position.set(ship.x,surfaceHeight(ship.x,ship.y,plan.capturedAt,environment)*.65+1,-ship.y);group.add(model);
  }
  renderer.setRenderTarget(target);renderer.setViewport(new T.Vector4(0,0,plan.width,plan.height));renderer.setScissorTest(false);renderer.setClearColor(plan.night?0x060a0d:0x81979b,1);renderer.autoClear=true;renderer.clear();renderer.render(world,camera);
  if(!available(o))return null;
  const bytes=new Uint8Array(plan.width*plan.height*4);renderer.readRenderTargetPixels(target,0,0,plan.width,plan.height,bytes);if(!available(o))return null;
  let rendered=false;for(let i=3;i<bytes.length;i+=4)if(bytes[i]){rendered=true;break;}if(!rendered)return null;
  const {canvas,context}=canvas2d(plan.width,plan.height),image=context.createImageData(plan.width,plan.height);image.data.set(flipRgbaRows(bytes,plan.width,plan.height));context.putImageData(image,0,0);clouds(canvas,context,plan);
  const elapsed=Math.floor(plan.capturedAt),stamp=`1972 / ${plan.id.toUpperCase()} / T+${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
  return finish(canvas,context,{seed:seedOf(plan.id),grayscale:.96,stamp});
 }finally{
  o.water.material=liveWater;photoWater.dispose();
  disposeGroup(group);target.dispose();for(const [child,visible]of visibility)child.visible=visible;world.fog=fog;world.background=background;o.water.position.copy(position);
  for(const [key,value]of Object.entries(uniforms)){const uniform=o.waterUniforms[key];if(uniform.value?.copy&&value?.clone)uniform.value.copy(value);else uniform.value=value;}
  for(const entry of lights){entry.light.intensity=entry.intensity;entry.light.position.copy(entry.position);}
  renderer.setRenderTarget(previous.target);renderer.setClearColor(previous.clear,previous.alpha);renderer.autoClear=previous.autoClear;renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);
 }
}
