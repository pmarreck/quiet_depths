import {propulsion} from './power-plant.js';
import {seriousRepairs,redAlertSound} from './red-alert.js';
import {threats} from './torpedo-watch.js';
import {environmentAt} from './environment.js';
import {engineSound,aircraftSound,perceivedSound} from './acoustics.js';
import {CrewAmbience} from './crew-ambience.js';
import {shapeImpulse} from './impulse-sound.js';

import {interiorStation,stationMix,weatherMix} from './station-audio.js';
export {weatherMix};

const ownFrequency=s=>31+Math.abs(s.speed)*2;
function stationSound(source,s,mix){
 const p=mix.openAir&&source.type==='thunder'?perceivedSound(source,{x:s.x,y:s.y,heading:s.heading,depth:0}):source.perceived??perceivedSound(source,s);
 return stationMix(p,source.type,mix);
}

export class SoundSystem{
 constructor(getState,getContext,onStatus=()=>{}){this.getState=getState;this.getContext=getContext;this.onStatus=onStatus;this.on=false;this.ctx=null;this.voices=new Map();this.played=new Set();this.lastState=null;this.tailUntil=0;this.effects=0;this.effectVoices=new Set();this.lastReceipt=null;}
 init(){
  if(this.ctx)return;const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
  this.ctx=new A();const c=this.ctx;this.master=c.createGain();this.master.gain.value=0;
  const limiter=c.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.004;limiter.release.value=.3;this.master.connect(limiter).connect(c.destination);
  this.noise=c.createBuffer(1,c.sampleRate*4,c.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
  const ambience=(type,frequency)=>{const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;source.loop=true;filter.type=type;filter.frequency.value=frequency;gain.gain.value=0;source.connect(filter).connect(gain).connect(this.master);source.start();return{source,filter,gain};};
  this.sea=ambience('lowpass',220);this.rain=ambience('bandpass',2400);this.rain.filter.Q.value=.4;
  this.own=c.createOscillator();this.own.frequency.value=ownFrequency(this.getState());this.ownGain=c.createGain();this.ownGain.gain.value=0;this.own.connect(this.ownGain).connect(this.master);this.own.start();
  this.crew=new CrewAmbience(c,this.master);
 }
 toggle(){this.init();if(!this.ctx)return false;this.on=!this.on;this.ctx.resume();this.played=new Set((this.getState().acoustics||[]).filter(e=>e.heard).map(e=>e.id));this.update();return this.on;}
 makeVoice(ship,pitch){
  const c=this.ctx,osc=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter(),pan=c.createStereoPanner(),pulse=c.createOscillator(),pulseGain=c.createGain();
  osc.type=ship.kind==='sub'?'sine':'sawtooth';osc.frequency.value=pitch.frequency;
  gain.gain.value=0;filter.type='lowpass';filter.Q.value=.5;filter.frequency.value=pitch.cutoff;pan.pan.value=pitch.pan*.9;
  pulse.frequency.value=pitch.bladeRate;pulseGain.gain.value=0;pulse.connect(pulseGain).connect(gain.gain);osc.connect(filter).connect(gain).connect(pan).connect(this.master);osc.start();pulse.start();return{osc,gain,filter,pan,pulse,pulseGain};
 }
 tone(type){
  if(!this.on||!this.ctx||this.getContext().paused||this.getContext().modal)return;
  const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.connect(g).connect(this.master);o.type=type==='damage'?'sawtooth':'sine';o.frequency.setValueAtTime(type==='ping'?1240:type==='photo'?620:type==='damage'?55:type==='fire'?95:440,t);o.frequency.exponentialRampToValueAtTime(type==='damage'?22:type==='ping'?970:200,t+1);g.gain.setValueAtTime(type==='damage'?.23:.15,t);g.gain.exponentialRampToValueAtTime(.001,t+(type==='ping'?2:1));o.start();o.stop(t+2.1);
 }
 loss(s=this.getState()){
  if(!this.on||!this.ctx||s.status!=='lost')return false;
  this.impulse({id:'loss-'+s.patrol.seed,type:s.cookoff?'detonation':'implosion',x:s.x,y:s.y,depth:s.depth,power:1.2,perceived:{gain:1,cutoff:1400,pan:0,distance:0,delay:0}});return true;
 }
 impulse(source){
  const s=this.getState(),{view,cameraDepth}=this.getContext();
  const p=stationSound(source,s,weatherMix(s,view,cameraDepth));if(p.gain<.002||this.effects>=12)return;
  const c=this.ctx,t=c.currentTime,thunder=source.type==='thunder',gun=source.type==='gunfire',seeker=['seeker','sweep'].includes(source.type),creak=source.type==='creak',loss=['implosion','collapse'].includes(source.type),duration=source.type==='launch'?.55:source.type==='splashdown'?.8:creak?2.8:loss?8:thunder?4.8:gun?.24:seeker?.7:3;
  const noise=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=c.createStereoPanner(),spatialGain=c.createGain();noise.buffer=this.noise;noise.loop=true;filter.type='lowpass';filter.frequency.value=p.cutoff;filter.Q.value=.6;pan.pan.value=p.pan*.9;spatialGain.gain.value=p.gain;
  noise.connect(filter).connect(gain).connect(pan);
  // The hull-collapse sweep has its own envelope. Keep station filtering
  // separate so stepping out on deck also muffles a collapse already in progress.
  const stationFilter=loss?c.createBiquadFilter():filter;
  if(loss){stationFilter.type='lowpass';stationFilter.frequency.value=p.cutoff;pan.connect(stationFilter).connect(spatialGain);}
  else pan.connect(spatialGain);
  spatialGain.connect(this.master);
  if(loss){filter.frequency.setValueAtTime(1800,t);filter.frequency.exponentialRampToValueAtTime(110,t+1.2);filter.frequency.exponentialRampToValueAtTime(650,t+3);filter.frequency.exponentialRampToValueAtTime(90,t+duration);}
  const rumble=c.createOscillator(),bass=c.createGain();
  shapeImpulse(source.type,t,duration,gain.gain,rumble,bass.gain);
  rumble.connect(bass).connect(pan);
  const voice={source,filter:stationFilter,pan,spatialGain,stop:()=>{noise.stop();rumble.stop();}};this.effectVoices.add(voice);this.effects++;noise.onended=()=>{this.effects--;this.effectVoices.delete(voice);noise.disconnect();filter.disconnect();if(loss)stationFilter.disconnect();gain.disconnect();rumble.disconnect();bass.disconnect();pan.disconnect();spatialGain.disconnect();};noise.start(t);noise.stop(t+duration);rumble.start(t);rumble.stop(t+duration);
  this.tailUntil=Math.max(this.tailUntil,t+duration);this.lastReceipt={id:source.id,type:source.type,delay:p.delay,distance:p.distance,gain:p.gain,cutoff:p.cutoff};
  if(interiorStation(view))this.crew.distantSound(s,source);
 }
 replayTailActive(event){
  if(!this.on||this.ctx?.state!=='running')return false;
  const matches=source=>['blast','detonation','collapse'].includes(source.type)&&Math.abs(source.time-event.time)<1&&Math.hypot(source.x-event.point.x,source.y-event.point.y)<3;
  for(const voice of this.effectVoices)if(['implosion','blast','detonation','collapse'].includes(voice.source.type))return true;
  const state=this.getState();
  return state.status==='patrol'&&state.acoustics.some(source=>!source.heard&&matches(source)&&perceivedSound(source,state).gain>=.002);
 }
 update(s=this.getState(),context=this.getContext()){
  if(!this.ctx)return;
  if(this.lastState!==s){this.lastState=s;this.played=new Set(s.acoustics.filter(e=>e.heard).map(e=>e.id));for(const v of this.voices.values()){v.osc.stop();v.pulse.stop();}for(const v of this.effectVoices)v.stop();this.effectVoices.clear();this.voices.clear();this.lastReceipt=null;this.tailUntil=0;this.alarmLevel=0;}
  const c=this.ctx,t=c.currentTime,active=!context.paused&&!context.modal&&s.status==='patrol',e=environmentAt(s);
  for(const event of s.acoustics){if(!event.heard||event.missed||this.played.has(event.id))continue;this.played.add(event.id);if(this.on&&!context.paused&&!context.modal)this.impulse(event);}
  const mix=weatherMix(s,context.view,context.cameraDepth);
  for(const voice of this.effectVoices){const p=stationSound(voice.source,s,mix);voice.spatialGain.gain.setTargetAtTime(p.gain,t,.1);voice.filter.frequency.setTargetAtTime(p.cutoff,t,.12);voice.pan.pan.setTargetAtTime(p.pan*.9,t,.1);if(this.lastReceipt?.id===voice.source.id){this.lastReceipt.currentGain=p.gain;this.lastReceipt.currentCutoff=p.cutoff;}}
  const tail=s.status!=='patrol'&&t<this.tailUntil&&!context.paused;
  this.master.gain.setTargetAtTime(this.on&&(active||tail)?.55:0,t,.12);
  const running=this.on&&active;
  this.crew.update(s,e,running&&interiorStation(context.view));
  const alarm=s.pressureAlarm>0||seriousRepairs(s)||threats(s).length>0;
  if(running&&alarm&&!this.alarmLevel){redAlertSound(c,this.master,s.silent);this.alarmLevel=1;}
  if(!alarm)this.alarmLevel=0;
  this.sea.filter.frequency.setTargetAtTime((120+e.wind*6)*mix.seaCutoff,t,.5);this.sea.gain.gain.setTargetAtTime(running?(.03+e.waveScale*.035)*mix.sea:0,t,.3);
  this.rain.filter.frequency.setTargetAtTime(mix.cutoff,t,.3);this.rain.gain.gain.setTargetAtTime(running?e.rain*mix.rain:0,t,.3);
  const plant=propulsion(s),powered=plant.drive>0||plant.generator>0;
  const motorGain=s.engine==='diesel'?.1*plant.generator:.03*plant.drive;
  this.own.frequency.setTargetAtTime(ownFrequency(s),t,.4);this.ownGain.gain.setTargetAtTime(running&&powered?motorGain:0,t,.25);
  let audible=0;
  const liveVoices=new Set();for(const ship of [...s.ships,...s.aircraft]){liveVoices.add(ship.id);const p=ship.altitude!==undefined?aircraftSound(ship,s):engineSound(ship,s);let voice=this.voices.get(ship.id);if(!voice){voice=this.makeVoice(ship,p);this.voices.set(ship.id,voice);}const target=running?p.gain:0;if(target>.001)audible++;
   voice.gain.gain.setTargetAtTime(target,t,.2);voice.pulseGain.gain.setTargetAtTime(target*.18,t,.2);voice.osc.frequency.setTargetAtTime(p.frequency,t,.3);voice.pulse.frequency.setTargetAtTime(p.bladeRate,t,.3);voice.filter.frequency.setTargetAtTime(p.cutoff,t,.25);voice.pan.pan.setTargetAtTime(p.pan*.9,t,.15);
  }
  for(const [id,voice]of this.voices)if(!liveVoices.has(id)){voice.osc.stop();voice.pulse.stop();voice.gain.disconnect();voice.pan.disconnect();this.voices.delete(id);}
  this.onStatus({context:c.state,engines:audible,effects:this.effects,last:this.lastReceipt});
 }
}
