import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SoundSystem} from '../src/audio.js';
import {createGame,step} from '../src/sim.js';

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
