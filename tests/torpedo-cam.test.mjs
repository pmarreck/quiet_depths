import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {difficultyControls,patrolDifficulty} from '../src/difficulty.js';
import {createGame,save,restore} from '../src/sim.js';
import {HOLD_SECONDS,followFocus,followForDigit,playerTorpedoes,torpedoCamActive} from '../src/torpedo-cam.js';

const shot=(id,owner,x=0)=>({id,owner,x,y:id*10,depth:3});

test('TorpedoCam is an Orbit option, on by default, and only active with Orbit',()=>{
 const control=difficultyControls.find(c=>c.id==='torpedoCam');
 assert.ok(control,'the briefing lists TorpedoCam');
 assert.equal(control.requires,'orbitCamera');
 assert.equal(control.initial,true);
 assert.equal(patrolDifficulty({}).torpedoCam,true);
 assert.equal(torpedoCamActive({orbitCamera:true,torpedoCam:true}),true);
 assert.equal(torpedoCamActive({orbitCamera:false,torpedoCam:true}),false);
 assert.equal(torpedoCamActive({orbitCamera:true,torpedoCam:false}),false);
 const s=createGame('recon',3,{difficulty:{torpedoCam:false}});
 assert.equal(restore(save(s)).difficulty.torpedoCam,false);
 const legacy=JSON.parse(save(createGame('recon',3)));delete legacy.difficulty.torpedoCam;
 assert.equal(restore(JSON.stringify(legacy)).difficulty.torpedoCam,true);
});

test('number keys pick your torpedoes in launch order and 0 returns to the sub',()=>{
 const water=[shot(9,'player'),shot(4,'enemy'),shot(7,'player'),shot(12,'player')];
 assert.deepEqual(playerTorpedoes(water).map(p=>p.id),[7,9,12],'enemy shots are never offered');
 assert.equal(followForDigit(1,water),7);
 assert.equal(followForDigit(3,water),12);
 assert.equal(followForDigit(0,water),null);
 assert.equal(followForDigit(4,water),undefined,'a digit without a torpedo changes nothing');
 assert.equal(followForDigit(1,[]),undefined);
});

test('the camera follows a torpedo, holds on its last position briefly, then returns to the sub',()=>{
 const idle={follow:null,last:null,lostAt:null};
 assert.deepEqual(followFocus(idle,[shot(7,'player')],10),{state:idle,focus:null});
 let step=followFocus({follow:7,last:null,lostAt:null},[shot(7,'player',50)],10);
 assert.deepEqual(step.focus,{x:50,y:70,depth:3});
 step=followFocus(step.state,[shot(7,'player',74)],11);
 assert.deepEqual(step.focus,{x:74,y:70,depth:3});
 // The torpedo detonates or runs out. The camera stays on the spot to show what happened.
 step=followFocus(step.state,[],12);
 assert.deepEqual(step.focus,{x:74,y:70,depth:3});
 step=followFocus(step.state,[],12+HOLD_SECONDS-.25);
 assert.deepEqual(step.focus,{x:74,y:70,depth:3});
 step=followFocus(step.state,[],12+HOLD_SECONDS);
 assert.deepEqual(step,{state:idle,focus:null});
});

test('Orbit offers on-screen TorpedoCam buttons for touch screens',async()=>{
 const page=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 const tools=page.slice(page.indexOf('<div id="orbit-tools"'),page.indexOf('</div>',page.indexOf('<div id="orbit-tools"')));
 assert.match(tools,/<span id="torpedo-cam" class="torpedo-cam" role="group" aria-label="Camera follows" hidden><\/span>/);
});
