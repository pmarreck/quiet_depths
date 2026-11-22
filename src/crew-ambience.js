import {hash01} from './environment.js';
import {crewOnAlert,crewPeriod,messClips,messLine} from './mess-watch.js';
export {crewPeriod};

const clips=[...messClips,'hit','hit-alt','leak','leak-alt','hit-quiet','leak-quiet'];
const melodies=[[55,58,60,62,65,62,60,58,55,53,55,58,57,55],
 [60,64,67,69,67,64,62,65,67,65,62,60,57,60]];

export function quietForSleep(s,alert=crewOnAlert(s)){
 return !alert&&!s.projectiles.length&&!s.shells.length&&!s.gunRounds.length&&!s.blasts.length&&!s.impacts.length&&
  s.airSupport.status!=='arming'&&s.airSupport.status!=='airborne';
}

export class CrewAmbience {
 constructor(context,master){
  this.context=context;this.bus=context.createGain();this.bus.gain.value=0;this.bus.connect(master);
  this.routineSources=new Set();this.clips=new Map();this.state=null;this.slot=-1;this.nextHit=0;this.nextLeak=0;this.lastHull=100;this.lastFlood=0;
  if(typeof context.decodeAudioData==='function')for(const name of clips){
   fetch(new URL(`crew/${name}.mp3`,import.meta.url)).then(response=>{
    if(!response.ok)throw Error('Crew clip unavailable');return response.arrayBuffer();
   }).then(data=>context.decodeAudioData(data)).then(buffer=>this.clips.set(name,buffer)).catch(()=>{});
  }
 }
 trackRoutine(source,gain){
  this.routineSources.add(source);
  source.onended=()=>{this.routineSources.delete(source);source.disconnect();gain.disconnect();};
 }
 stopRoutine(){
  for(const source of this.routineSources)source.stop();
  this.routineSources.clear();
 }
 speak(name,volume,routine=false){
  const buffer=this.clips.get(name);if(!buffer)return;
  const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;gain.gain.value=volume;
  if(routine)this.trackRoutine(source,gain);
  source.connect(gain).connect(this.bus);source.start();return true;
 }
 note(frequency,when,length,volume,type='sine'){
  const oscillator=this.context.createOscillator(),gain=this.context.createGain();oscillator.type=type;
  oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,when);
  gain.gain.exponentialRampToValueAtTime(volume,when+.025);gain.gain.exponentialRampToValueAtTime(.0001,when+length);
  this.trackRoutine(oscillator,gain);oscillator.connect(gain).connect(this.bus);oscillator.start(when);oscillator.stop(when+length+.04);
 }
 stopSnore(){
  if(!this.snore)return;
  const {gain,source}=this.snore,t=this.context.currentTime;
  gain.gain.setTargetAtTime(0,t,.025);source.stop(t+.12);this.snore=null;
 }
 playSnore(seed){
  if(this.snore)return;
  const c=this.context;
  if(!this.snoreBuffer){
   const rate=c.sampleRate,buf=c.createBuffer(1,Math.ceil(rate*2.6),rate),pcm=buf.getChannelData(0);
   let phase=0,breath=0,noise=41;
   for(let i=0;i<pcm.length;i++){
    const t=i/rate,inhale=t<1.4,u=inhale?t/1.4:(t-1.4)/1.2,envelope=Math.sin(Math.PI*u)**2;
    noise=(Math.imul(noise,1664525)+1013904223)>>>0;
    breath=.88*breath+.12*(noise/2147483648-1);
    phase+=2*Math.PI*(inhale?42+13*envelope:34)/rate;
    pcm[i]=envelope*(inhale?.6: .2)*(breath*1.3+.18*Math.sin(phase*3)+.12*Math.sin(phase*6))*(.65+.35*Math.sin(phase));
   }
   this.snoreBuffer=buf;
  }
  const source=c.createBufferSource(),gain=c.createGain();source.buffer=this.snoreBuffer;
  if(source.playbackRate)source.playbackRate.value=.9+.18*seed;
  gain.gain.value=.45;source.connect(gain).connect(this.bus);
  this.snore={gain,source};
  source.onended=()=>{if(this.snore?.source===source)this.snore=null;source.disconnect();gain.disconnect();};source.start();
 }
 playMusic(seed){
  const start=this.context.currentTime,melody=melodies[Math.floor(hash01(seed,144)*melodies.length)];
  melody.forEach((pitch,index)=>{
   const when=start+index*.31+(index%2?.075:0),frequency=440*2**((pitch-69)/12);
   this.note(frequency,when,.28,.022,'triangle');
   if(index%4===0)this.note(frequency/4,when,.65,.018);
  });
 }
 distantSound(s,event){
  if(this.state!==s||this.reaction||s.silent||s.alert>30||this.context.currentTime<this.nextChatter)return;
  if(!['blast','detonation','thunder','collapse','implosion'].includes(event.type)||!(event.perceived?.distance>=500))return;
  const roll=hash01(s.patrol.seed,event.id+8520);
  if(roll<.22)this.reaction={at:this.context.currentTime+1.2,line:roll<.11?'what-noise':'hear-that'};
 }
 update(s,e,active){
  if(this.state!==s){this.stopRoutine();this.stopSnore();this.state=s;this.lastHull=s.hull;this.lastFlood=s.flood;this.slot=-1;this.nextHit=this.nextLeak=this.nextSnore=this.nextChatter=0;this.reaction=null;this.goodnightDay=-1;this.lastLine='';}
  const now=this.context.currentTime,quiet=s.silent||s.alert>30;
  const alert=crewOnAlert(s),period=crewPeriod(e.hour),sleeping=active&&period==='sleep'&&quietForSleep(s,alert);
  if(!active||alert)this.stopRoutine();
  const day=Math.floor((s.environment.startHour+s.time/120)/24);
  if(period==='lights-out'&&alert)this.goodnightDay=day;
  if(!active||quiet)this.reaction=null;
  if(!sleeping)this.stopSnore();
  this.bus.gain.setTargetAtTime(active?(quiet?.08:.7):0,now,.09);
  if(active){
   if(!alert&&period==='lights-out'&&this.goodnightDay!==day&&this.speak('goodnight',.12,true))this.goodnightDay=day;
   if(this.reaction&&now>=this.reaction.at){this.speak(this.reaction.line,.16);this.reaction=null;this.nextChatter=now+30;}
   const alternative=hash01(s.patrol.seed,Math.floor(s.time*4)+1800)<.5;
   if(s.hull<this.lastHull-1&&s.time>=this.nextHit){this.speak(quiet?'hit-quiet':alternative?'hit-alt':'hit',quiet?.34:.29);this.nextHit=s.time+16;}
   if(s.flood>this.lastFlood+.15&&s.time>=this.nextLeak){this.speak(quiet?'leak-quiet':alternative?'leak-alt':'leak',quiet?.32:.26);this.nextLeak=s.time+20;}
   const slot=Math.floor(s.time/19);
   if(this.slot!==slot){
    this.slot=slot;
    const choice=hash01(s.patrol.seed,slot+1100);
    const line=messLine(period,hash01(s.patrol.seed,slot+1150),this.lastLine);
    if(!alert&&line&&choice<.72&&now>=this.nextChatter){
     this.speak(line,.12,true);this.lastLine=line;this.nextChatter=now+12;this.note(1840,now+.12,.19,.023);this.note(2700,now+.29,.15,.013);
    }
    if(sleeping&&choice<.12&&now>=this.nextSnore){
     this.playSnore(choice/.12);
     this.nextSnore=now+45; // Keep the cabin quiet even under time compression.
    }
    if(!alert&&period==='music'&&choice<.37)this.playMusic(s.patrol.seed+slot);
   }
  }
  this.lastHull=s.hull;this.lastFlood=s.flood;
 }
}
