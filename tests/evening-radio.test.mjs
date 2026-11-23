import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EveningRadio,radioWindow,songs} from '../src/evening-radio.js';
import {interiorStation,stationMix,weatherMix} from '../src/station-audio.js';
import {crewOnAlert} from '../src/mess-watch.js';
import {createGame} from '../src/sim.js';

test('all eight shipped songs contain independently decodable frames throughout the random-access range',async()=>{
 assert.deepEqual(songs,[1,2,3,4,5,6,7,8]);
 for(const song of songs){
  const bytes=await readFile(new URL('../src/radio/song'+song+'.mp3',import.meta.url));
  assert.equal(bytes.length%360,0);
  for(let i=0;i<bytes.length;i+=360){
   // MPEG-1 Layer III, no CRC, 80 kb/s at 32 kHz, no padding, mono, no back-reference.
   if(bytes[i]!==255||bytes[i+1]!==251||(bytes[i+2]&254)!==104||(bytes[i+3]>>6)!==3||bytes[i+4]!==0||(bytes[i+5]&128)!==0)
    assert.fail('Not an independent fixed-length MP3 frame in song '+song+' at '+i);
  }
  const first=radioWindow(bytes.length,0),last=radioWindow(bytes.length,.99999999);
  assert.equal(first.start,0);assert.equal(last.end,bytes.length);
  assert.ok(last.start>first.end&&last.end-last.start<110000);
 }
});

test('radio starts ten-second envelopes, excludes the previous two across reload, and discards interrupted decodes',async t=>{
 let stored=null;
 const storage=t.mock.method(globalThis,'fetch',async url=>{
  files.push(new URL(url).pathname.split('/').pop());return new Response(new Uint8Array(360*900));
 });
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_,value)=>{stored=value;}}});
 t.after(()=>descriptor?Object.defineProperty(globalThis,'localStorage',descriptor):Reflect.deleteProperty(globalThis,'localStorage'));
 const files=[],starts=[],envelopes=[];
 const c={currentTime:0,decodeAudioData:async()=>({duration:10.22}),
  createBufferSource(){return {connect:n=>n,disconnect(){},start(...args){starts.push({source:this,args});},stop(t){this.stopAt=t;}};},
  createGain(){const events=[];envelopes.push(events);return {connect(){},disconnect(){},gain:{
   setValueAtTime:(...a)=>events.push(['set',...a]),linearRampToValueAtTime:(...a)=>events.push(['ramp',...a]),cancelScheduledValues(){}}};}};
 let radio=new EveningRadio(c,{});
 for(let i=0;i<5;i++){
  c.currentTime=i*31;
  if(i===2)radio=new EveningRadio(c,{});
  await Promise.all([radio.play(0,.2),radio.play(0,.9)]);
  const {source,args}=starts[i];assert.equal(args[2],10);
  assert.deepEqual(envelopes[i],[['set',0,c.currentTime],['ramp',.14,c.currentTime+1],['set',.14,c.currentTime+9],['ramp',0,c.currentTime+10]]);
  source.onended();await radio.play(0,.8); // No immediate repeat under time compression.
 }
 assert.deepEqual(files,['song1.mp3','song2.mp3','song3.mp3','song1.mp3','song2.mp3']);
 const before=stored,entered=Promise.withResolvers(),decoded=Promise.withResolvers();
 c.currentTime+=40;c.decodeAudioData=()=>{entered.resolve();return decoded.promise;};
 const pending=radio.play(0,.4);await entered.promise;radio.stop();decoded.resolve({duration:10.22});await pending;
 assert.equal(starts.length,5);assert.equal(stored,before);assert.equal(storage.mock.callCount(),6);
});

test('off-watch routines stay quiet during recoverable damage and while a torpedo passes in from a distant launch',()=>{
 const s=createGame('survey',12);s.ships=[];s.aircraft=[];assert.ok(!crewOnAlert(s));
 s.systems.sonar=51;s.repairLimits.sonar=85;assert.ok(crewOnAlert(s));s.systems.sonar=85;
 s.hull=61;s.repairLimits.hull=65;assert.ok(crewOnAlert(s));s.hull=65;assert.ok(!crewOnAlert(s));
 for(const key of ['fuelLeak','fuelFire','flood']){s[key]=1;assert.ok(crewOnAlert(s),key);s[key]=0;}
 s.projectiles=[{x:s.x,y:s.y+2001}];assert.ok(!crewOnAlert(s));
 s.projectiles[0].y-=1;assert.ok(crewOnAlert(s));
});

test('interior stations carry the crew and open-air stations favor weather over distant underwater impulses',()=>{
 const s={depth:0,drone:{depth:40}},p={gain:.5,cutoff:2500,distance:900};
 for(const station of ['scope','sonar','chart','photos'])assert.ok(interiorStation(station));
 for(const station of ['tower','gun','drone','orbit','replay'])assert.ok(!interiorStation(station));
 const inside=weatherMix(s,'scope'),wet=weatherMix(s,'orbit',35);assert.ok(!wet.openAir);
 for(const air of [weatherMix(s,'tower'),weatherMix(s,'gun'),weatherMix({...s,depth:55},'orbit',-2),weatherMix(s,'drone',-.5)]){
  assert.ok(air.sea>inside.sea&&air.rain>inside.rain&&air.thunder>inside.thunder);
  for(const type of ['detonation','blast','collapse','implosion','creak','settling']){
   assert.deepEqual(stationMix(p,type,inside),p);assert.deepEqual(stationMix(p,type,wet),p);
   assert.ok(stationMix(p,type,air).gain<p.gain*.3);
   assert.equal(stationMix({...p,distance:0},type,air).gain,p.gain);
  }
  assert.equal(stationMix(p,'gunfire',air).gain,p.gain);
 }
});
