import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SoundSystem} from '../src/audio.js';
import {createGame,step} from '../src/sim.js';
import {aircraftSound,engineSound} from '../src/acoustics.js';
import {crewPeriod} from '../src/crew-ambience.js';

test('dramatic loss stays silent and does not open a device when Sound is OFF',()=>{
 const s=createGame(),sound=new SoundSystem(()=>s,()=>({paused:false,modal:true}));s.status='lost';
 assert.equal(typeof sound.loss,'function');assert.equal(sound.loss(s),false);assert.equal(sound.ctx,null);assert.equal(sound.on,false);
});

test('a fresh session never opens an audio device before explicit Sound activation',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,get(){throw new Error('Audio device touched without a user gesture');}});
 try{const s=createGame('recon',3,{weather:'storm'}),sound=new SoundSystem(()=>s,()=>({paused:false,modal:false}));
  for(let i=0;i<5;i++){step(s,20);sound.update();sound.tone('damage');}assert.equal(sound.on,false);assert.equal(sound.ctx,null);
 }finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window;}
});

test('crew ambience follows the patrol clock, including dinner and lights-out boundaries',()=>{
 for(const meal of [7,12,18]){
  assert.equal(crewPeriod(meal-.001),null);
  assert.equal(crewPeriod(meal),'meal');
  assert.equal(crewPeriod(meal+.6),null);
 }
 assert.equal(crewPeriod(19),'music');
 assert.equal(crewPeriod(22.99),'music');
 assert.equal(crewPeriod(23),null);
});

test('engine oscillators start at the current pitch and smooth later speed changes',()=>{
 class AudioParam {
  constructor(value=0){this.value=value;this.targets=[];}
  setTargetAtTime(value){this.targets.push(value);}
 }
 const node=fields=>({connect:destination=>destination,...fields});
 class AudioContext {
  currentTime=3;
  sampleRate=8;
  state='running';
  oscillators=[];
  destination={};
  resume(){}
  createGain(){return node({gain:new AudioParam(1)});}
  createDynamicsCompressor(){return node(Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,new AudioParam()])));}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
  createBufferSource(){return node({start(){}});}
  createBiquadFilter(){return node({frequency:new AudioParam(350),Q:new AudioParam()});}
  createStereoPanner(){return node({pan:new AudioParam()});}
  createOscillator(){
   const oscillator=node({frequency:new AudioParam(440),start(){this.startFrequency=this.frequency.value;}});
   this.oscillators.push(oscillator);
   return oscillator;
  }
 }
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext}});
 try{
  const s=createGame('recon',31,{timeOfDay:'dawn'});
  s.speed=7;
  s.ships=s.ships.slice(0,1);
  const [ship]=s.ships;
  const sound=new SoundSystem(()=>s,()=>({paused:false,modal:false}));
  assert.equal(sound.toggle(),true);
  const [own,engine,propeller]=sound.ctx.oscillators;
  const initial=engineSound(ship,s);
  assert.equal(own.startFrequency,45);
  assert.equal(engine.startFrequency,initial.frequency);
  assert.equal(propeller.startFrequency,initial.bladeRate);

  s.speed=9;
  ship.speed+=5;
  const plane={id:'air-test',x:s.x,y:s.y+500,altitude:80,speed:70,hull:100};
  s.aircraft.push(plane);
  sound.update();
  const changed=engineSound(ship,s);
  assert.equal(own.frequency.targets.at(-1),49);
  assert.equal(engine.frequency.targets.at(-1),changed.frequency);
  assert.equal(propeller.frequency.targets.at(-1),changed.bladeRate);
  assert.equal(sound.ctx.oscillators[3].startFrequency,aircraftSound(plane,s).frequency);
  assert.equal(sound.ctx.oscillators[4].startFrequency,aircraftSound(plane,s).bladeRate);
 }finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window;}
});
