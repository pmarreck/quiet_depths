import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame,step} from '../src/sim.js';

// Reference behavior recorded from r97: a standard patrol closes after 30
// patrol minutes; a longer one closes 90 minutes after its protected transit.
function quiet(mission,longPatrol=false){
 const s=createGame(mission,1972,{difficulty:{longPatrol}});
 Object.assign(s,{speed:0,targetSpeed:0});s.ships=[];
 return s;
}

test('the patrol window closes strictly after its limit',()=>{
 const open=quiet('recon');open.time=1799.5;step(open,.25);assert.equal(open.status,'patrol');
 const closed=quiet('recon');closed.time=1799.9;step(closed,.25);assert.equal(closed.status,'expired');
 assert.ok(closed.events.some(e=>e.text==='Patrol window closed. Command orders withdrawal.'));
 const long=quiet('recon',true);assert.ok(long.search,'a longer mission has a search area');
 // After the approach completes, the protected time stops growing and the window is fixed.
 Object.assign(long.search,{activeSeconds:180,protectedTime:1200});long.time=6599.5;step(long,.25);assert.equal(long.status,'patrol');
 long.time=6599.9;step(long,.25);assert.equal(long.status,'expired');
 // During the protected transit the window moves with the clock, so it cannot close.
 const transit=quiet('recon',true);Object.assign(transit.search,{activeSeconds:180,protectedTime:300});transit.time=5699.9;step(transit,.25);
 assert.equal(transit.status,'patrol');assert.equal(transit.search.protectedTime,300.25);
});

test('the Elm patrol definition supplies the windows and search timing used by the rules and the player guide',async()=>{
 const {patrolTiming}=await import('../src/mission-objective.js');
 const {approachProgress}=await import('../src/patrol-search.js');
 assert.deepEqual(patrolTiming,{standardWindow:1800,longerWindow:5400,protectedTransit:1200,searchSeconds:180});
 const area=(activeSeconds,protectedTime)=>({x:0,y:0,radius:500,targets:[],recognized:[],located:false,activeSeconds,protectedTime});
 assert.equal(approachProgress(area(patrolTiming.searchSeconds,patrolTiming.protectedTransit)),1);
 assert.equal(approachProgress(area(patrolTiming.searchSeconds/2,patrolTiming.protectedTransit)),.5);
 assert.equal(approachProgress(area(patrolTiming.searchSeconds,patrolTiming.protectedTransit/4)),.25);
 // Static documents cannot import the catalog. Edit them when the Elm values change.
 const guide=await readFile(new URL('../README.md',import.meta.url),'utf8');
 assert.ok(guide.includes(`A standard patrol has a ${patrolTiming.standardWindow/60}-patrol-minute window.`));
 assert.ok(guide.includes(`an extended ${patrolTiming.longerWindow/60}-minute window after the protected transit`));
});
