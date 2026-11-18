import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,bottom,contact,isVisible,ping,photograph,fire,save,restore,deployDrone,recallDrone,decoy,bearing,distance} from '../src/sim.js';
test('passive observation never reveals a range or world coordinate',()=>{
 const s=createGame();s.scope=false;s.depth=s.targetDepth=80;
 for(const ship of s.ships)contact(s,ship,'passive');
 assert.ok(s.contacts.length>0);for(const c of s.contacts){assert.equal(c.range,0);assert.equal(c.identified,false);assert.equal(c.x,0);assert.equal(c.y,0);}
});
test('active sonar buys ranges at a detection cost; cooldown prevents free spam',()=>{
 const s=createGame();assert.equal(ping(s),true);assert.ok(s.contacts.every(c=>c.range>0));assert.ok(s.ships.some(v=>v.kind==='escort'&&v.alert>=65));const risk=s.alert;assert.equal(ping(s),false);assert.equal(s.alert,risk);assert.ok(s.contacts.every(c=>!c.identified));
});
test('scope cannot see from deep water or through a lowered mast',()=>{
 const s=createGame(),ship=s.ships[0];assert.ok(isVisible(s,ship,bearing(s,ship)));s.scope=false;assert.ok(!isVisible(s,ship));s.scope=true;s.depth=20;assert.ok(!isVisible(s,ship));assert.equal(photograph(s,bearing(s,ship)),false);
});
test('camera needs a centered silhouette and separate photographs',()=>{
 const s=createGame();assert.equal(photograph(s,180),false);assert.equal(photograph(s,bearing(s,s.ships[0])),true);assert.deepEqual(s.photos,['cobalt']);assert.equal(photograph(s,bearing(s,s.ships[1])),false);step(s,5);assert.ok(photograph(s,bearing(s,s.ships[1])));assert.equal(s.photos.length,2);step(s,.25);assert.equal(s.phase,'extract');assert.notEqual(s.status,'won');s.x=s.home.x;s.y=s.home.y;step(s,.25);assert.equal(s.status,'patrol');s.depth=s.targetDepth=0;step(s,.25);assert.equal(s.status,'won');
});
test('time batching preserves simulation outcomes (metamorphic)',()=>{
 for(const dt of [1,5,20,60]){const a=createGame(),b=structuredClone(a);a.scope=b.scope=false;a.depth=a.targetDepth=b.depth=b.targetDepth=90;step(a,dt);for(let t=0;t<dt*4;t++)step(b,.25);for(const k of ['x','y','speed','depth','oxygen','battery','heading','hull','alert'])assert.ok(Math.abs(a[k]-b[k])<1e-8,`${dt}: ${k}`);assert.deepEqual(a.contacts,b.contacts);}
});
test('electric/diesel resource direction follows the declared tradeoff',()=>{
 const e=createGame(),d=createGame();e.scope=d.scope=false;d.engine='diesel';step(e,30);step(d,30);assert.ok(e.battery<92);assert.ok(d.battery>92);assert.ok(d.fuel<86);assert.ok(d.oxygen>=e.oxygen);assert.ok(d.noise>e.noise);
});
test('drowned diesel cannot propel or charge the boat',()=>{const s=createGame();s.engine='diesel';s.depth=s.targetDepth=90;s.speed=0;step(s,20);assert.equal(s.speed,0);assert.ok(s.battery<92);assert.equal(s.fuel,86);});
test('seafloor collision and test depth cause actual damage',()=>{const a=createGame();a.x=1900;a.y=700;a.depth=a.targetDepth=bottom(a.x,a.y)+10;const h=a.hull;step(a,1);assert.ok(a.hull<h);const b=createGame();b.depth=b.targetDepth=260;step(b,2);assert.ok(b.hull<100);});
test('save/restore is an exact state round trip and invalid inputs are rejected',()=>{const s=createGame();step(s,30);ping(s);assert.deepEqual(restore(save(s)),s);for(const raw of ['garbage','null','{}','{"version":2}'])assert.equal(restore(raw),null);});
test('contacts expire without being refreshed, estimated positions do not follow hidden truth',()=>{const s=createGame();const ship=s.ships[0];const c=contact(s,ship,'active'),x=c.x,y=c.y;ship.x+=1000;ship.y+=1000;contact(s,ship,'passive');assert.equal(c.x,x);assert.equal(c.y,y);s.ships=[];s.scope=false;step(s,60);step(s,60);step(s,60);step(s,60);step(s,1);assert.equal(s.contacts.length,0);});
test('drone deployment constraints, return, and battery use',()=>{const s=createGame();s.depth=90;assert.equal(deployDrone(s),false);s.depth=s.targetDepth=30;s.speed=s.targetSpeed=0;assert.ok(deployDrone(s));s.drone.x+=100;recallDrone(s);const before=distance(s,s.drone);step(s,5);assert.ok(distance(s,s.drone)<before);assert.ok(s.drone.battery<100);step(s,30);assert.equal(s.drone.mode,'stowed');});
test('acoustic torpedo can hit a neutral on the selected bearing',()=>{const s=createGame('intercept');s.scope=false;s.speed=s.targetSpeed=0;s.ships=[{id:'neutral',name:'Neutral',kind:'fishing',military:false,x:0,y:500,heading:0,speed:0,hull:100,alert:0,attack:0}];contact(s,s.ships[0],'active');assert.ok(fire(s,'neutral'));step(s,30);assert.equal(s.ships[0].hull,0);assert.equal(s.status,'compromised');assert.equal(s.torps,3);});
test('supplies are bounded across seed, speed, depth and engine sweeps',()=>{
 for(let seed=1;seed<=12;seed++){const s=createGame('shadow',seed);s.scope=false;s.depth=s.targetDepth=20+seed*9;s.targetSpeed=seed%15;s.engine=seed%2?'electric':'diesel';for(let t=0;t<10;t++)step(s,60);for(const k of ['hull','battery','oxygen','fuel'])assert.ok(Number.isFinite(s[k])&&s[k]>=0&&s[k]<=100,k);assert.ok(s.speed>=0&&s.speed<=17);}
});
test('noisemakers are finite and do not manufacture supplies',()=>{const s=createGame();s.alert=80;for(let i=0;i<3;i++)assert.ok(decoy(s));assert.equal(decoy(s),false);assert.equal(s.decoys,0);assert.equal(s.alert,0);});
test('terminal patrol states do not advance',()=>{for(const status of ['won','lost','compromised','expired']){const s=createGame();s.status=status;const before=save(s);step(s,60);assert.equal(save(s),before);}});
test('corrupted save fields fail closed instead of crashing the renderer',()=>{for(const key of ['drone','ships','events','home','oxygen','depth']){const s=createGame();s[key]=null;assert.equal(restore(JSON.stringify(s)),null,key);}const s=createGame();s.ships[0].x='broken';assert.equal(restore(JSON.stringify(s)),null);});
