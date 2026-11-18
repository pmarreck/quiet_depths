import * as T from './vendor/three.module.js';
import {hash01} from './environment.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const skyFragment=`
varying vec3 vPos;uniform float time;uniform float daylight;uniform float cloud;uniform float twilight;uniform float flash;uniform vec3 sunDir;uniform sampler2D cloudNoise;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float fbm(vec2 p){float n=0.;float a=.5;for(int i=0;i<5;i++){n+=noise(p)*a;p=p*2.03+vec2(7.1,3.7);a*=.5;}return n;}
void main(){vec3 d=normalize(vPos);float h=max(d.y,0.);vec3 top=mix(vec3(.005,.012,.032),vec3(.12,.32,.55),daylight);vec3 horizon=mix(vec3(.022,.038,.065),vec3(.64,.72,.78),daylight);vec3 col=mix(horizon,top,pow(h,.45));
float sunDot=max(dot(d,sunDir),0.);col+=vec3(.75,.28,.06)*twilight*pow(1.-h,7.)*(.3+.7*pow(sunDot,5.));float sun=smoothstep(.99982,.99994,sunDot)*step(-.03,sunDir.y);col=mix(col,vec3(1.,.88,.6),sun);col+=vec3(.2,.12,.05)*pow(sunDot,80.)*daylight;
vec2 stars=vec2(atan(d.x,d.z),asin(d.y))*380.;vec2 cell=floor(stars);float star=step(.9972,hash(cell))*pow(max(0.,1.-length(fract(stars)-.5)*2.),5.);col+=vec3(.6,.74,1.)*star*(1.-daylight)*smoothstep(.02,.3,h)*(.65+.35*sin(time*.7+hash(cell)*20.));
float moon=smoothstep(.99975,.99992,dot(d,-sunDir));col+=vec3(.56,.67,.9)*moon*(1.-daylight);
vec2 uv=d.xz/(.18+max(d.y,0.))*.65+vec2(time*.002,time*.0007);float n=texture2D(cloudNoise,uv*.13).r;float cover=smoothstep(mix(.82,.23,cloud),mix(.94,.56,cloud),n);vec3 cloudCol=mix(vec3(.025,.038,.065),vec3(.43,.48,.52),daylight);cloudCol+=vec3(.7,.8,1.)*flash*.8;col=mix(col,cloudCol,cover*clamp(cloud*1.25,0.,1.));col+=vec3(.45,.55,.7)*flash*(.15+.35*cloud);gl_FragColor=vec4(col,1.);}`;
function cloudTexture(){
 const size=256,data=new Uint8Array(size*size*4),noise=(u,v,p)=>{const x=u*p,y=v*p,ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);const at=(x,y)=>hash01(5150,(x%p)+(y%p)*1024);return(at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let n=0;for(let i=0;i<5;i++)n+=noise(x/size,y/size,4*2**i)*(.5/2**i);const k=(y*size+x)*4;data[k]=data[k+1]=data[k+2]=n*255;data[k+3]=255;}
 const texture=new T.DataTexture(data,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}
export class Atmosphere{
 constructor(scene){
  this.scene=scene;this.strikes=new Map();this.charges=new Map();
  this.uniforms={time:{value:0},daylight:{value:1},cloud:{value:0},twilight:{value:0},flash:{value:0},sunDir:{value:new T.Vector3()},cloudNoise:{value:cloudTexture()}};
  this.sky=new T.Mesh(new T.SphereGeometry(20000,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:this.uniforms,vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:skyFragment}));scene.add(this.sky);
  const geometry=new T.BufferGeometry(),pos=[],seeds=[];for(let i=0;i<1000;i++){const x=(Math.random()-.5)*180,z=(Math.random()-.5)*180,seed=Math.random()*100;pos.push(x,0,z,x+.7,3.6,z);seeds.push(seed,seed);}geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setAttribute('seed',new T.Float32BufferAttribute(seeds,1));
  this.rainUniforms={time:{value:0},speed:{value:30},opacity:{value:0},flash:{value:0}};
  this.rain=new T.LineSegments(geometry,new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:this.rainUniforms,vertexShader:'attribute float seed;uniform float time;uniform float speed;void main(){vec3 p=position;p.y+=mod(seed-time*speed,100.)-35.;p.x+=p.y*.23;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'uniform float opacity;uniform float flash;void main(){gl_FragColor=vec4(vec3(.54,.65,.75)+flash*.25,opacity);}'}));scene.add(this.rain);
  this.blastLight=new T.PointLight(0xa0d9ff,0,250,1.6);scene.add(this.blastLight);
 }
 bolt(strike){
  const group=new T.Group(),points=[];for(let i=0;i<=14;i++){const t=i/14;points.push(new T.Vector3((hash01(strike.seed,i)-.5)*100*t,strike.height*t,(hash01(strike.seed,i+20)-.5)*80*t));}
  const curve=new T.CatmullRomCurve3(points);
  for(const [radius,opacity,color] of [[9,.18,0x739dff],[1.8,1,0xe1eeff]])group.add(new T.Mesh(new T.TubeGeometry(curve,42,radius,4,false),new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,fog:false})));
  group.position.set(strike.x,0,-strike.y);return group;
 }
 remove(group){group.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});this.scene.remove(group);}
 update(s,e,camera,underwater){
  this.sky.visible=!underwater;this.sky.position.copy(camera.position);for(const k of ['daylight','cloud','twilight','flash'])this.uniforms[k].value=e[k];this.uniforms.time.value=s.time;this.uniforms.sunDir.value.set(e.sunDirection.x,e.sunDirection.y,e.sunDirection.z).normalize();
  this.rain.visible=!underwater&&e.rain>.02;this.rain.position.copy(camera.position);this.rainUniforms.time.value=s.time;this.rainUniforms.speed.value=25+e.wind*.35;this.rainUniforms.opacity.value=e.rain*(.18+.1*e.daylight);this.rainUniforms.flash.value=e.flash;
  const visible=new Set();for(const strike of s.lightning){const age=s.time-strike.time;if(age<0||age>1.3)continue;visible.add(strike.id);let group=this.strikes.get(strike.id);if(!group){group=this.bolt(strike);this.strikes.set(strike.id,group);this.scene.add(group);}const pulse=clamp(Math.exp(-age*13)+.75*Math.exp(-(((age-.22)/.05)**2)),0,1);group.visible=!underwater;group.children.forEach((o,i)=>o.material.opacity=pulse*(i===0?.18:1));}
  for(const [id,group] of this.strikes)if(!visible.has(id)){this.remove(group);this.strikes.delete(id);}
  this.blastLight.intensity=0;let flash=0;const liveCharges=new Set();
  for(const charge of s.blasts){liveCharges.add(charge.id);let group=this.charges.get(charge.id);if(!group){group=new T.Group();const can=new T.Mesh(new T.CylinderGeometry(.55,.55,1.6,10),new T.MeshStandardMaterial({color:0x58625b,roughness:.7}));group.add(can);const bubble=new T.Mesh(new T.SphereGeometry(1,18,12),new T.MeshBasicMaterial({color:0xa5cddd,transparent:true,opacity:.5,wireframe:true}));group.add(bubble);group.userData.can=can;group.userData.bubble=bubble;this.charges.set(charge.id,group);this.scene.add(group);}
   const depth=charge.exploded?charge.depth:charge.depth*(1-clamp(charge.delay/charge.totalDelay,0,1));group.position.set(charge.x,-depth,-charge.y);const d=group.position.distanceTo(camera.position);group.visible=underwater&&d<500;group.userData.can.visible=!charge.exploded;group.userData.bubble.visible=charge.exploded;
   if(charge.exploded){group.userData.bubble.scale.setScalar(2+charge.age*13);group.userData.bubble.material.opacity=Math.max(0,.65*(1-charge.age/5));const strength=Math.exp(-charge.age*8)/(1+d/120);if(strength>flash){flash=strength;this.blastLight.position.copy(group.position);this.blastLight.intensity=4000*strength;}}
  }
  for(const [id,group] of this.charges)if(!liveCharges.has(id)){this.remove(group);this.charges.delete(id);}
  return flash;
 }
}
