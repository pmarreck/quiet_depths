import {surfaceMotion,wavePhaseAt,surfaceHeight,WAVE_COMPONENTS,hash01,boatPoint} from './surface-motion.js';
import {SUB_DESIGN as D} from './hull-design.js';
export {wavePhaseAt,surfaceHeight,WAVE_COMPONENTS,hash01};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export const DAY_SECONDS=2880; // One environmental day in 48 simulated minutes.
export const WEATHER=Object.freeze({
 clear:{name:'Clear',cloud:.12,rain:0,storm:0,waveScale:.55,waveSpeed:.75,wind:9,visibility:1},
 cloudy:{name:'Cloudy',cloud:.82,rain:0,storm:0,waveScale:1,waveSpeed:1,wind:22,visibility:.82},
 rain:{name:'Rain',cloud:.95,rain:.6,storm:0,waveScale:1.45,waveSpeed:1.2,wind:38,visibility:.65},
 storm:{name:'Storm',cloud:1,rain:1,storm:1,waveScale:2.6,waveSpeed:1.55,wind:65,visibility:.46}
});
export const TIMES=Object.freeze({dawn:{name:'Dawn',hour:6},day:{name:'Day',hour:12},dusk:{name:'Dusk',hour:18},night:{name:'Night',hour:22}});
export function makeEnvironment(seed=19830604,options={}){
 return{startHour:options.timeOfDay==='random'?Object.values(TIMES)[Math.floor(hash01(seed,750)*4)].hour:TIMES[options.timeOfDay]?.hour??18,startWeather:options.weather==='random'?Object.keys(WEATHER)[Math.floor(hash01(seed,751)*4)]:WEATHER[options.weather]?options.weather:'clear',changing:options.changing!==false,seed:seed>>>0};
}
export function environmentAt(s){
 const cfg=s.environment||makeEnvironment(),time=s.time||0,ids=Object.keys(WEATHER),slot=Math.floor(time/300);
 const idAt=n=>n<=0?cfg.startWeather:ids[Math.floor(hash01(cfg.seed,n)*ids.length)];
 const a=WEATHER[idAt(cfg.changing?slot-1:0)],b=WEATHER[idAt(cfg.changing?slot:0)],blend=slot>0&&cfg.changing?smooth(0,75,time%300):0,e={};
 for(const k of ['cloud','rain','storm','waveScale','waveSpeed','wind','visibility'])e[k]=mix(a[k],b[k],blend);
 if(s.wavePhase!==undefined){e.sampledAt=time;e.wavePhase=s.wavePhase;}
 e.weather=(blend<.5?a:b).name;e.weatherId=blend<.5?idAt(cfg.changing?slot-1:0):idAt(cfg.changing?slot:0);
 e.hour=((cfg.startHour+time*24/DAY_SECONDS)%24+24)%24;const angle=(e.hour-6)*Math.PI/12;
 e.sunAltitude=Math.sin(angle);e.daylight=smooth(-.14,.18,e.sunAltitude);e.twilight=1-Math.abs(e.daylight*2-1);
 e.phase=e.daylight<.12?'Night':e.daylight>.9?'Day':e.hour<12?'Dawn':'Dusk';
 e.sunDirection={x:Math.cos(angle),y:Math.sin(angle),z:-.32};
 e.opticalRange=(3900+2600*e.daylight)*e.visibility;
 e.subVisualRange=(1800+3700*e.daylight)*e.visibility;
 e.lightRange=(7000-1000*e.daylight)*(.65+.35*e.visibility);
 e.seaState=e.waveScale<.7?2:e.waveScale<1.2?3:e.waveScale<1.8?4:6;
 e.flash=0;for(const strike of s.lightning||[]){const age=time-strike.time;if(age>=0&&age<.75){const pulse=Math.exp(-age*13)+.75*Math.exp(-(((age-.22)/.05)**2));const d=Math.hypot(strike.x-s.x,strike.y-s.y);e.flash=Math.max(e.flash,pulse/(1+d/14000));}}
 return e;
}

// Visual approximation of clear seawater. Attenuation is exponential in
// meters, with blue retaining about 1% of surface daylight at 200 m.
export function waterColumnLight(depth,e){
 const meters=Math.max(0,depth),diffuse=e.daylight*(1-.52*e.cloud);
 return {
  red:diffuse*Math.exp(-.12*meters),
  green:diffuse*Math.exp(-.045*meters),
  blue:diffuse*Math.exp(-.023*meters),
  direct:e.daylight*Math.sqrt(Math.max(0,e.sunAltitude))*(1-e.cloud)**2
 };
}

export const SEA_GLSL='float sea(vec2 p){return waveScale*('+WAVE_COMPONENTS.map(w=>`sin(p.x*${w.kx.toFixed(3)}+p.y*${w.ky.toFixed(3)}+wavePhase*${w.omega.toFixed(3)})*${w.amplitude.toFixed(3)}`).join('+')+');}';
export const SEA_SAMPLE_GLSL='vec3 seaSample(vec2 p){vec3 s=vec3(0.);'+WAVE_COMPONENTS.map((w,i)=>`float phase${i}=p.x*${w.kx.toFixed(3)}+p.y*${w.ky.toFixed(3)}+wavePhase*${w.omega.toFixed(3)};s+=${w.amplitude.toFixed(3)}*vec3(sin(phase${i}),cos(phase${i})*${w.kx.toFixed(3)},cos(phase${i})*${w.ky.toFixed(3)});`).join('')+'return s*waveScale;}';
export function boatSurfacePose(s,e=environmentAt(s),time=s.time){return surfaceMotion(s,e,time);}
export function scopePosition(pose){return boatPoint(pose,{forward:-D.scopeZ,down:-D.scopeEye});}
export function scopeWashed(s,e=environmentAt(s)){
 const eye=scopePosition(boatSurfacePose(s,e));
 return -eye.depth<=surfaceHeight(eye.x,eye.y,s.time,e)+.15;
}
export function soundings(waterDepth,referenceDepth,keelOffset=5){return{waterDepth,referenceDepth,belowKeel:waterDepth-referenceDepth-keelOffset,keelOffset};}
