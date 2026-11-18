import {environmentAt} from './environment.js';
import {engineSound,perceivedSound} from './acoustics.js';

export class SoundSystem{
 constructor(getState,getContext,onStatus=()=>{}){this.getState=getState;this.getContext=getContext;this.onStatus=onStatus;this.on=false;this.ctx=null;this.voices=new Map();this.played=new Set();this.lastState=null;this.tailUntil=0;this.effects=0;this.effectVoices=new Set();this.lastReceipt=null;}
 init(){
  if(this.ctx)return;const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
  this.ctx=new A();const c=this.ctx;this.master=c.createGain();this.master.gain.value=0;
  const limiter=c.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.004;limiter.release.value=.3;this.master.connect(limiter).connect(c.destination);
  this.noise=c.createBuffer(1,c.sampleRate*4,c.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
  const ambience=(type,frequency)=>{const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;source.loop=true;filter.type=type;filter.frequency.value=frequency;gain.gain.value=0;source.connect(filter).connect(gain).connect(this.master);source.start();return{source,filter,gain};};
  this.sea=ambience('lowpass',220);this.rain=ambience('bandpass',2400);this.rain.filter.Q.value=.4;
  this.own=c.createOscillator();this.own.frequency.value=38;this.ownGain=c.createGain();this.ownGain.gain.value=0;this.own.connect(this.ownGain).connect(this.master);this.own.start();
 }
 toggle(){this.init();if(!this.ctx)return false;this.on=!this.on;this.ctx.resume();this.played=new Set((this.getState().acoustics||[]).filter(e=>e.heard).map(e=>e.id));this.update();return this.on;}
 makeVoice(ship){
  const c=this.ctx,osc=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter(),pan=c.createStereoPanner(),pulse=c.createOscillator(),pulseGain=c.createGain();
  osc.type=ship.kind==='sub'?'sine':'sawtooth';gain.gain.value=0;filter.type='lowpass';filter.Q.value=.5;pulse.frequency.value=2;pulseGain.gain.value=.002;pulse.connect(pulseGain).connect(gain.gain);osc.connect(filter).connect(gain).connect(pan).connect(this.master);osc.start();pulse.start();return{osc,gain,filter,pan,pulse,pulseGain};
 }
 tone(type){
  if(!this.on||!this.ctx||this.getContext().paused||this.getContext().modal)return;
  const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.connect(g).connect(this.master);o.type=type==='damage'?'sawtooth':'sine';o.frequency.setValueAtTime(type==='ping'?1240:type==='photo'?620:type==='damage'?55:type==='fire'?95:440,t);o.frequency.exponentialRampToValueAtTime(type==='damage'?22:type==='ping'?970:200,t+1);g.gain.setValueAtTime(type==='damage'?.23:.15,t);g.gain.exponentialRampToValueAtTime(.001,t+(type==='ping'?2:1));o.start();o.stop(t+2.1);
 }
 impulse(source){
  const p=source.perceived||perceivedSound(source,this.getState());if(p.gain<.002||this.effects>=12)return;
  const c=this.ctx,t=c.currentTime,thunder=source.type==='thunder',duration=thunder?4.8:3;
  const noise=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=c.createStereoPanner(),spatialGain=c.createGain();noise.buffer=this.noise;noise.loop=true;filter.type='lowpass';filter.frequency.value=p.cutoff;filter.Q.value=.6;pan.pan.value=p.pan*.9;spatialGain.gain.value=p.gain;
  const peak=thunder?.7:.95;gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(peak,t+(thunder?.13:.008));gain.gain.exponentialRampToValueAtTime(.0001,t+duration);noise.connect(filter).connect(gain).connect(pan).connect(spatialGain).connect(this.master);
  const rumble=c.createOscillator(),bass=c.createGain();rumble.type='sine';rumble.frequency.setValueAtTime(thunder?42:85,t);rumble.frequency.exponentialRampToValueAtTime(20,t+duration);bass.gain.setValueAtTime(peak*.35,t);bass.gain.exponentialRampToValueAtTime(.0001,t+duration);rumble.connect(bass).connect(pan);
  const voice={source,filter,pan,spatialGain,stop:()=>{noise.stop();rumble.stop();}};this.effectVoices.add(voice);this.effects++;noise.onended=()=>{this.effects--;this.effectVoices.delete(voice);noise.disconnect();filter.disconnect();gain.disconnect();rumble.disconnect();bass.disconnect();pan.disconnect();spatialGain.disconnect();};noise.start(t);noise.stop(t+duration);rumble.start(t);rumble.stop(t+duration);
  this.tailUntil=Math.max(this.tailUntil,t+duration);this.lastReceipt={id:source.id,type:source.type,delay:p.delay,distance:p.distance,gain:p.gain,cutoff:p.cutoff};
 }
 update(s=this.getState(),context=this.getContext()){
  if(!this.ctx)return;
  if(this.lastState!==s){this.lastState=s;this.played=new Set(s.acoustics.filter(e=>e.heard).map(e=>e.id));for(const v of this.voices.values()){v.osc.stop();v.pulse.stop();}for(const v of this.effectVoices)v.stop();this.effectVoices.clear();this.voices.clear();this.lastReceipt=null;this.tailUntil=0;}
  const c=this.ctx,t=c.currentTime,active=!context.paused&&!context.modal&&s.status==='patrol',e=environmentAt(s);
  for(const event of s.acoustics){if(!event.heard||this.played.has(event.id))continue;this.played.add(event.id);if(this.on&&!context.paused&&!context.modal)this.impulse(event);}
  for(const voice of this.effectVoices){const p=perceivedSound(voice.source,s);voice.spatialGain.gain.setTargetAtTime(p.gain,t,.1);voice.filter.frequency.setTargetAtTime(p.cutoff,t,.12);voice.pan.pan.setTargetAtTime(p.pan*.9,t,.1);if(this.lastReceipt?.id===voice.source.id){this.lastReceipt.currentGain=p.gain;this.lastReceipt.currentCutoff=p.cutoff;}}
  const tail=s.status!=='patrol'&&t<this.tailUntil&&!context.paused;
  this.master.gain.setTargetAtTime(this.on&&(active||tail)?.42:0,t,.12);
  const wet=s.depth<=2?1:.18*Math.exp(-s.depth/200),running=this.on&&active;
  this.sea.filter.frequency.setTargetAtTime(120+e.wind*6,t,.5);this.sea.gain.gain.setTargetAtTime(running?(.03+e.waveScale*.035)*wet:0,t,.3);
  this.rain.filter.frequency.setTargetAtTime(s.depth>2?330:2400,t,.3);this.rain.gain.gain.setTargetAtTime(running?e.rain*.11*wet:0,t,.3);
  this.own.frequency.setTargetAtTime(31+Math.abs(s.speed)*2,t,.4);this.ownGain.gain.setTargetAtTime(running?(s.engine==='diesel'?.1:.03):0,t,.25);
  let audible=0;
  for(const ship of s.ships){let voice=this.voices.get(ship.id);if(!voice){voice=this.makeVoice(ship);this.voices.set(ship.id,voice);}const p=engineSound(ship,s),target=running?p.gain:0;if(target>.001)audible++;
   voice.gain.gain.setTargetAtTime(target,t,.2);voice.pulseGain.gain.setTargetAtTime(target*.18,t,.2);voice.osc.frequency.setTargetAtTime(p.frequency,t,.3);voice.pulse.frequency.setTargetAtTime(p.bladeRate,t,.3);voice.filter.frequency.setTargetAtTime(p.cutoff,t,.25);voice.pan.pan.setTargetAtTime(p.pan*.9,t,.15);
  }
  this.onStatus({context:c.state,engines:audible,effects:this.effects,last:this.lastReceipt});
 }
}
