// Immutable particle paths sampled by event age. Replay can seek without
// advancing an emitter or consuming the patrol's random stream.
const vertex = `
 uniform float age, extent, spray, seed;
 attribute float grain;
 varying float density, fleck, heat;
 void main(){
   float angle=6.2831853*position.x+seed;
   float height=2.*position.y-1.;
   float radial=sqrt(max(0.,1.-height*height));
   float life=clamp(age/(1.7+1.3*grain),0.,1.);
   float spread=(.07+.93*(1.-exp(-3.3*life)))*(.25+.75*position.z);
   vec3 offset=vec3(cos(angle)*radial,height,sin(angle)*radial)*spread;
   offset.y+=life*life*.85;
   if(spray>.5){
     float jet=floor(position.x*9.);
     angle=jet*.69813+.35*(grain-.5)+seed;
     float outward=(.04+life*(.2+.8*position.z));
     if(grain<.22)outward=.08+sqrt(life)*(.80+.12*position.z);
     offset=vec3(cos(angle)*outward,max(0.,life*((1.8+2.*position.y)-3.8*life)),sin(angle)*outward);
     if(grain<.22)offset.y=.015+.045*position.y;
   }
   vec4 eye=modelViewMatrix*vec4(offset*extent,1.);
   gl_Position=projectionMatrix*eye;
   float width=extent*(.07+.18*grain)*(1.+life);
   if(spray>.5)width*=grain>.33 ? .36 : .75;
   gl_PointSize=clamp(width*430./max(1.,-eye.z),1.5,85.);
   density=(1.-smoothstep(.3,1.,life))*(.32+.48*grain);
   fleck=grain;heat=exp(-age*5.)*(1.-spray);
 }`;
const fragment = `
 varying float density, fleck, heat;
 uniform float spray, ignition;
 void main(){
   vec2 uv=2.*gl_PointCoord-1.;
   float r=length(uv);
   float scallop=.06*sin(uv.x*13.+fleck*42.)+.07*sin(uv.y*11.-uv.x*3.+fleck*8.);
   float edge=1.-smoothstep(.45,1.,r+scallop);
   float relief=sin(uv.y*9.+uv.x*3.+fleck*19.)*.06+(1.-r)*.18;
   if(edge*density<.015)discard;
   vec3 tint=mix(vec3(.13,.26,.32),vec3(.66,.84,.84),clamp(fleck+.14*uv.y+relief,0.,1.));
   if(spray>.5)tint=mix(vec3(.44,.65,.70),vec3(.90,.96,.93),clamp(fleck+relief,0.,1.));
   tint=mix(tint,vec3(1.,.77,.44),heat);
   vec3 ember=mix(vec3(.65,.045,.004),vec3(1.,.25,.019),fleck);
   gl_FragColor=vec4(mix(tint,ember,ignition),edge*density);
   #include <colorspace_fragment>
 }`;

interface Geometry {setAttribute(name:string, attr:object):unknown}
interface Cloud {
  visible:boolean;frustumCulled:boolean;
  material:{uniforms:Record<string,{value:number}>};
}
interface Kit {
  BufferGeometry:new()=>Geometry;
  Float32BufferAttribute:new(values:number[], size:number)=>object;
  ShaderMaterial:new(settings:object)=>object;
  Points:new(geo:Geometry,material:object)=>Cloud;
}

export function blastCloud(T: Kit){
  const count=240,positions:number[]=[],grain:number[]=[];
  let rng=2791;
  const next=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<count;i++){positions.push(next(),next(),next());grain.push(next());}
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('grain',new T.Float32BufferAttribute(grain,1));
  const material=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,
    uniforms:{age:{value:0},extent:{value:1},spray:{value:0},seed:{value:0},ignition:{value:0}}});
  const cloud=new T.Points(geo,material);cloud.frustumCulled=false;
  return cloud;
}

export function animateCloud(cloud: Cloud, age:number, extent:number, spray:boolean, seed:number, ignited=false){
  const u=cloud.material.uniforms;
  cloud.visible=age>=0&&age<3;
  u.age.value=age;u.extent.value=extent;u.spray.value=spray?1:0;u.seed.value=seed*2.39996;
  u.ignition.value=ignited?Math.max(0,Math.min(1,(.95-age)/.53)):0;
}

// Sample from the detonation time so a paused frame or replay sees the same light.
export function detonationFlash(age:number, depth:number, underwater:boolean) {
  const duration=1.15;
  if(age<0||age>=duration)return null;
  const transmission=underwater?1:Math.max(0,1-Math.max(0,depth)/16)**2;
  if(transmission===0)return null;
  const fade=Math.max(0,(age-.12)/(duration-.12));
  return {
    diameter:12+86*(1-Math.exp(-age*3.7)),
    intensity:transmission*(1-fade*fade*(3-2*fade)),
    lift:underwater||depth<0?0:depth+.8
  };
}
