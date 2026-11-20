import {hash01} from './environment.js';

const clips=['mess-a','mess-b','hit','hit-alt','leak','leak-alt','hit-quiet','leak-quiet'];
const melodies=[[55,58,60,62,65,62,60,58,55,53,55,58,57,55],
 [60,64,67,69,67,64,62,65,67,65,62,60,57,60]];

export function crewPeriod(hour){
 if([7,12,18].some(meal=>hour>=meal&&hour<meal+.55))return 'meal';
 return hour>=19&&hour<23?'music':null;
}

export class CrewAmbience {
 constructor(context,master){
  this.context=context;this.bus=context.createGain();this.bus.gain.value=0;this.bus.connect(master);
  this.clips=new Map();this.state=null;this.slot=-1;this.nextHit=0;this.nextLeak=0;this.lastHull=100;this.lastFlood=0;
  if(typeof context.decodeAudioData==='function')for(const name of clips){
   fetch(new URL(`crew/${name}.wav`,import.meta.url)).then(response=>{
    if(!response.ok)throw Error('Crew clip unavailable');return response.arrayBuffer();
   }).then(data=>context.decodeAudioData(data)).then(buffer=>this.clips.set(name,buffer)).catch(()=>{});
  }
 }
 speak(name,volume){
  const buffer=this.clips.get(name);if(!buffer)return;
  const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;gain.gain.value=volume;
  source.connect(gain).connect(this.bus);source.start();
 }
 note(frequency,when,length,volume,type='sine'){
  const oscillator=this.context.createOscillator(),gain=this.context.createGain();oscillator.type=type;
  oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,when);
  gain.gain.exponentialRampToValueAtTime(volume,when+.025);gain.gain.exponentialRampToValueAtTime(.0001,when+length);
  oscillator.connect(gain).connect(this.bus);oscillator.start(when);oscillator.stop(when+length+.04);
 }
 playMusic(seed){
  const start=this.context.currentTime,melody=melodies[Math.floor(hash01(seed,144)*melodies.length)];
  melody.forEach((pitch,index)=>{
   const when=start+index*.31+(index%2?.075:0),frequency=440*2**((pitch-69)/12);
   this.note(frequency,when,.28,.022,'triangle');
   if(index%4===0)this.note(frequency/4,when,.65,.018);
  });
 }
 update(s,e,active){
  if(this.state!==s){this.state=s;this.lastHull=s.hull;this.lastFlood=s.flood;this.slot=-1;this.nextHit=this.nextLeak=0;}
  const now=this.context.currentTime,quiet=s.silent||s.alert>30;
  const period=crewPeriod(e.hour);
  this.bus.gain.setTargetAtTime(active?(quiet?.08:.7):0,now,.09);
  if(active){
   const alternative=hash01(s.patrol.seed,Math.floor(s.time*4)+1800)<.5;
   if(s.hull<this.lastHull-1&&s.time>=this.nextHit){this.speak(quiet?'hit-quiet':alternative?'hit-alt':'hit',quiet?.34:.29);this.nextHit=s.time+16;}
   if(s.flood>this.lastFlood+.15&&s.time>=this.nextLeak){this.speak(quiet?'leak-quiet':alternative?'leak-alt':'leak',quiet?.32:.26);this.nextLeak=s.time+20;}
   const slot=Math.floor(s.time/19);
   if(this.slot!==slot){
    this.slot=slot;
    const choice=hash01(s.patrol.seed,slot+1100);
    if(!quiet&&period==='meal'&&choice<.8){
     this.speak(choice<.4?'mess-a':'mess-b',.08);this.note(1840,now+.12,.19,.023);this.note(2700,now+.29,.15,.013);
    }
    if(!quiet&&period==='music'&&choice<.37)this.playMusic(s.patrol.seed+slot);
   }
  }
  this.lastHull=s.hull;this.lastFlood=s.flood;
 }
}
