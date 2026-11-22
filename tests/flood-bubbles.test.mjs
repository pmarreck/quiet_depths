import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FloodBubbles} from '../src/flood-bubbles.js';

const sea=()=>0,leak={id:'our sub',rate:1,x:0,y:-40,z:0};
test('an active leak releases rising bubbles at a moving hull and a repair leaves only the existing trail',()=>{
 const bubbles=new FloodBubbles();
 assert.equal(bubbles.update(0,[leak],sea),1);
 const first=bubbles.positions.slice(0,3);
 const count=bubbles.update(2,[{...leak,x:8}],sea);
 assert.ok(count>=8);assert.ok(Math.abs(bubbles.positions[0]-first[0])<1&&bubbles.positions[1]>first[1]+2);
 assert.ok(bubbles.positions[(count-1)*3]>6);
 const paused=bubbles.positions.slice();assert.equal(bubbles.update(2,[{...leak,x:8}],sea),count);assert.deepEqual(bubbles.positions,paused);
 assert.equal(bubbles.update(3,[{...leak,rate:0}],sea),count);
 for(let t=4;t<=26;t++){const n=bubbles.update(t,[],sea);if(t===26)assert.equal(n,0);}
});
test('independent subs stop emitting at the waterline and replay rewinds clear future bubbles',()=>{
 const bubbles=new FloodBubbles(),fleet=[{...leak,x:-12},{...leak,id:'friendly',x:15,y:-.4},{...leak,id:'hostile',x:25}];
 for(let i=0;i<=20;i++)bubbles.update(i/10,fleet,sea);
 const count=bubbles.update(2,fleet,sea),x=[],y=[];
 for(let i=0;i<count;i++){x.push(bubbles.positions[3*i]);y.push(bubbles.positions[3*i+1]);}
 assert.ok(x.some(n=>n<0)&&x.some(n=>n>14&&n<16)&&x.some(n=>n>24));assert.ok(y.every(n=>n<0));
 assert.equal(bubbles.update(0,[],sea),0);assert.equal(bubbles.update(.1,[{...leak,y:1}],sea),0);
});
test('replay frames preserve the player and other submarines’ active leaks separately from bilge water',async()=>{
 const {createGame}=await import('../src/sim.js'),{ReplayRecorder}=await import('../src/instant-replay.js');
 const s=createGame('wolf-in-the-henhouse',47),other=s.ships.find(v=>v.kind==='sub');
 s.flood=2;s.water=4;other.flood=3;const recorder=new ReplayRecorder(s);
 s.time=1;s.flood=0;recorder.capture(s);
 assert.equal(recorder.history[0].flood,2);assert.equal(recorder.history.at(-1).flood,0);
 assert.equal(recorder.history.at(-1).ships.find(v=>v.id===other.id).flood,3);
});
