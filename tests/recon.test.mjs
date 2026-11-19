import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {freshRecon,requestRecon,updateRecon,reconStatus,reconLink,validateReconState} from '../src/recon.js';
import {designation,fixContact,estimateAt,applyReconPacket} from '../src/track-estimates.js';
import * as reconDisplay from '../src/recon.js';

test('a prepared next search square cannot relocate an in-flight reconnaissance task on the chart',()=>{
 assert.equal(typeof reconDisplay.reconAreaForDisplay,'function');const tasked={x:1000,y:2000,size:10000},next={x:-3000,y:100,size:10000};
 for(const phase of ['queued','uplinking','tasking','imaging','processing','receiving'])assert.deepEqual(reconDisplay.reconAreaForDisplay({phase,area:tasked},next),tasked);
 for(const phase of ['idle','complete','failed'])assert.deepEqual(reconDisplay.reconAreaForDisplay({phase,area:tasked},next),next);
 assert.deepEqual(reconDisplay.reconAreaForDisplay({phase:'complete',area:tasked},null),tasked);
});

function ocean(options={}){
 const s=createGame('recon',81,{timeOfDay:'day',weather:'clear',changing:false,...options});
 Object.assign(s,{time:0,x:0,y:0,depth:0,recon:freshRecon(),contacts:[],nextId:1,ships:[]});return s;
}
const vessel=(id,x,y,extra={})=>({id,name:'Vessel '+id,kind:'merchant',military:true,x,y,depth:0,speed:5,heading:90,hull:100,...extra});
function advance(s,seconds,options={}){
 const packets=[];for(let elapsed=0;elapsed<seconds;elapsed+=.25){const dt=Math.min(.25,seconds-elapsed);s.time+=dt;
  if(options.move)for(const ship of s.ships){ship.x+=Math.sin(ship.heading*Math.PI/180)*ship.speed*.514444*dt;ship.y+=Math.cos(ship.heading*Math.PI/180)*ship.speed*.514444*dt;}
  const packet=updateRecon(s,dt);if(packet)packets.push(packet);
 }return packets;
}
function until(s,predicate,max=800,options={}){let packets=[];for(let i=0;i<max*4&&!predicate();i++)packets.push(...advance(s,.25,options));assert.ok(predicate(),'recon stage timed out');return packets;}
const area={x:0,y:0,size:10000};

test('recon tasking is queued at depth, bounded to a fixed footprint, and cannot bypass cooldown',()=>{
 const s=ocean();s.depth=80;s.ships=[vessel('one',0,1000)];const before=structuredClone(s.contacts);
 assert.equal(requestRecon(s,area),true);assert.equal(s.recon.phase,'queued');assert.deepEqual(s.contacts,before);
 advance(s,120);assert.equal(s.recon.phase,'queued');assert.equal(s.recon.packet,null);assert.equal(s.recon.progress,0);
 const pending=JSON.stringify(s.recon);assert.equal(requestRecon(s,{x:50,y:50,size:10000}),false);assert.equal(JSON.stringify(s.recon),pending);
 for(const invalid of [{x:NaN,y:0,size:10000},{x:0,y:0,size:Infinity},{x:0,y:0,size:50000}]){const bad=ocean();assert.equal(requestRecon(bad,invalid),false);assert.equal(bad.recon.phase,'idle');}
});
test('clear daytime imagery freezes area-limited surface observations and two-frame velocity before transmission',()=>{
 const s=ocean();s.ships=[vessel('one',300,500),vessel('outside',7000,0),vessel('sub',0,700,{kind:'sub',depth:70}),vessel('dead',100,100,{hull:0})];
 assert.equal(requestRecon(s,area),true);until(s,()=>s.recon.phase==='processing',300,{move:true});
 assert.deepEqual(s.contacts,[],'internal capture cannot silently update chart contacts');const frozen=structuredClone(s.recon.packet);
 assert.equal(frozen.tracks.length,1);const track=frozen.tracks[0];assert.equal(track.id,'one');assert.equal(track.identified,true);assert.equal(track.name,'Vessel one');
 assert.ok(Math.abs(track.vx-5*.514444)<1e-9);assert.ok(Math.abs(track.vy)<1e-9);assert.ok(frozen.image.secondFrameAt>frozen.image.firstFrameAt);
 assert.equal(track.positionSigma,0);assert.equal(frozen.sceneShips.length,1);assert.equal(frozen.sceneShips[0].id,'one');assert.ok(!('name' in frozen.sceneShips[0]));
 s.ships[0].x=99999;s.ships[0].y=-99999;s.ships[0].name='Changed after image';s.ships[0].speed=16;
 const packets=until(s,()=>s.recon.phase==='complete');assert.equal(packets.length,1);const received=packets[0];
 assert.equal(received.tracks[0].x,track.x);assert.equal(received.tracks[0].y,track.y);assert.equal(received.tracks[0].name,'Vessel one');assert.equal(received.capturedAt,frozen.capturedAt);assert.ok(received.receivedAt>received.capturedAt);
 assert.deepEqual(advance(s,30),[],'a delivery is emitted once');assert.equal(requestRecon(s,area),false,'completed delivery does not bypass its long cooldown');
});
test('recon transfer slows with submerged reception, holds below antenna reach and resumes without rerolling',()=>{
 const s=ocean();s.ships=[vessel('one',0,500)];requestRecon(s,area);until(s,()=>s.recon.phase==='receiving',300);
 const surfaced=structuredClone(s),shallow=structuredClone(s),deep=structuredClone(s);surfaced.depth=0;shallow.depth=20;deep.depth=80;
 const source=JSON.stringify(deep.recon.packet);advance(surfaced,10);advance(shallow,10);advance(deep,10);
 assert.ok(surfaced.recon.progress>shallow.recon.progress);assert.ok(shallow.recon.progress>0);assert.equal(deep.recon.progress,0);assert.equal(JSON.stringify(deep.recon.packet),source);
 assert.equal(reconLink(deep).canReceive,false);assert.equal(reconLink(shallow).canReceive,true);assert.match(reconStatus(deep).detail,/shallow|30|antenna/i);
 deep.depth=0;until(deep,()=>deep.recon.phase==='complete',100);assert.equal(deep.recon.packet.tracks[0].x,s.recon.packet.tracks[0].x);
});
test('night passes locate lights without inventing ship identities or silhouettes',()=>{
 const s=ocean({timeOfDay:'night'});s.ships=[vessel('lit',0,500),vessel('blackout',100,600,{lights:false})];requestRecon(s,area);const packets=until(s,()=>s.recon.phase==='complete');const packet=packets[0];
 assert.equal(packet.night,true);assert.deepEqual(packet.tracks.map(v=>v.id),['lit']);assert.equal(packet.tracks[0].identified,false);
 for(const key of ['name','kind','military'])assert.ok(!(key in packet.tracks[0]),key);
 assert.equal(packet.sceneShips[0].kind,'light','the photo DTO must not reveal a night silhouette');
});
test('cloud obscuration is reproducible and cannot return a perfect fleet fix',()=>{
 const run=seed=>{const s=ocean({weather:'cloudy'});s.environment.seed=seed;for(let i=0;i<45;i++)s.ships.push(vessel('ship-'+i,-4200+i%9*1000,-2000+Math.floor(i/9)*1000));requestRecon(s,area);const p=until(s,()=>s.recon.phase==='complete')[0];return p;};
 const first=run(54),same=run(54);assert.deepEqual(first,same);assert.ok(first.tracks.length>0&&first.tracks.length<45);assert.ok(first.coverage<1);assert.ok(first.tracks.some(v=>v.positionSigma>0));
 assert.ok(first.sceneShips.length<=first.tracks.length,'omitted ships cannot be painted through clouds');
 const storm=ocean({weather:'storm'});assert.equal(requestRecon(storm,area),false);assert.match(reconStatus(storm).detail,/weather|storm|cloud/i);
});
test('in-flight recon serialization continues to an identical frozen packet',()=>{
 const a=ocean();a.ships=[vessel('one',0,500)];requestRecon(a,area);until(a,()=>a.recon.phase==='receiving',300);a.depth=20;advance(a,12);
 const b=JSON.parse(JSON.stringify(a));const pa=until(a,()=>a.recon.phase==='complete'),pb=until(b,()=>b.recon.phase==='complete');assert.deepEqual(pa,pb);assert.deepEqual(a,b);
});
test('recon state validation accepts every saved stage and rejects corrupted nested observations',()=>{
 const s=ocean();s.ships=[vessel('one',0,500)];assert.equal(validateReconState(s.recon),true);requestRecon(s,area);
 const stages=new Set();until(s,()=>{stages.add(s.recon.phase);assert.equal(validateReconState(JSON.parse(JSON.stringify(s.recon))),true,s.recon.phase);return s.recon.phase==='complete';});
 assert.ok(['queued','uplinking','tasking','imaging','processing','receiving','complete'].every(v=>stages.has(v)));
 for(const change of [r=>r.phase='instant',r=>r.progress=2,r=>r.cooldownUntil=NaN,r=>r.packet.tracks[0].x=NaN,r=>r.packet.sceneShips[0].id='unobserved-ship',r=>r.packet.image.secondFrameAt=r.packet.capturedAt+1]){const bad=structuredClone(s.recon);change(bad);assert.equal(validateReconState(bad),false);}
});
test('invalid time and terminal updates cannot progress a recon request',()=>{
 const s=ocean();requestRecon(s,area);const before=JSON.stringify(s.recon);for(const dt of [0,-1,NaN,Infinity]){updateRecon(s,dt);assert.equal(JSON.stringify(s.recon),before);}s.status='lost';s.time+=30;updateRecon(s,30);assert.equal(JSON.stringify(s.recon),before);
});
test('a long deep queue cannot consume the post-delivery satellite cooldown',()=>{
 const s=ocean();s.depth=80;s.ships=[vessel('one',0,500)];requestRecon(s,area);advance(s,600);s.depth=0;until(s,()=>s.recon.phase==='complete',400);
 assert.equal(requestRecon(s,area),false);assert.ok(reconStatus(s).cooldownRemaining>=479);advance(s,479);assert.equal(requestRecon(s,area),false);advance(s,2);assert.equal(requestRecon(s,area),true);
});

test('contact labels are independent of ship names and cross the A9 boundary without collisions',()=>{
 const labels=Array.from({length:500},(_,i)=>designation(i+1));assert.equal(labels[0],'A1');assert.equal(labels[8],'A9');assert.equal(labels[9],'B1');assert.equal(labels.length,new Set(labels).size);assert.ok(labels.every(v=>/^[A-Z]+[1-9]$/.test(v)));
});
test('a timestamped fix predicts motion and its uncertainty expands during transmission and after receipt',()=>{
 const c={id:'one',label:'A1',bearing:0,range:100,confidence:1};assert.equal(fixContact(c,{x:100,y:200,vx:3,vy:4,time:10,positionSigma:0,velocitySigma:.2,maneuverSigma:.01,source:'satellite'}),true);
 const exact=estimateAt(c,10),later=estimateAt(c,110);assert.equal(exact.major,0);assert.equal(exact.minor,0);assert.equal(later.x,400);assert.equal(later.y,600);assert.ok(later.major>later.minor&&later.minor>0);
 let major=0,minor=0;for(let t=10;t<400;t+=3){const e=estimateAt(c,t);assert.ok(e.major>=major&&e.minor>=minor);major=e.major;minor=e.minor;}
 const state=JSON.stringify(c);estimateAt(c,200);assert.equal(JSON.stringify(c),state,'chart prediction is read-only');
});
test('track prediction and uncertainty are translation and rotation invariant',()=>{
 const c={};const observation={x:120,y:-40,vx:2,vy:5,time:4,positionSigma:0,velocitySigma:.3,maneuverSigma:.008,source:'satellite'};fixContact(c,observation);
 for(const angle of [0,.3,1.2,2.8]){const transform=(x,y)=>({x:x*Math.cos(angle)-y*Math.sin(angle)+812,y:x*Math.sin(angle)+y*Math.cos(angle)-231}),position=transform(observation.x,observation.y),velocity=transform(observation.vx,observation.vy),d={};fixContact(d,{...observation,...position,vx:velocity.x-812,vy:velocity.y+231});
  const a=estimateAt(c,51),b=estimateAt(d,51),expected=transform(a.x,a.y);assert.ok(Math.abs(b.x-expected.x)<1e-9);assert.ok(Math.abs(b.y-expected.y)<1e-9);assert.ok(Math.abs(a.major-b.major)<1e-9);assert.ok(Math.abs(a.minor-b.minor)<1e-9);
 }
});
test('older or malformed fixes cannot replace a newer usable observation',()=>{
 const c={label:'A1'};fixContact(c,{x:1,y:2,vx:0,vy:0,time:50,positionSigma:10});const good=JSON.stringify(c);
 for(const obs of [{x:9,y:9,time:49},{x:NaN,y:0,time:51},{x:0,y:0,time:Infinity},{x:0,y:0,time:51,positionSigma:-3}]){assert.equal(fixContact(c,obs),false);assert.equal(JSON.stringify(c),good);}
});
test('delivered observations preserve contact designations, existing identity and newer precision',()=>{
 const s=ocean();s.time=100;s.contacts=[{id:'one',label:'A1',name:'Known name',identified:true,kind:'escort',military:true,bearing:0,range:500,confidence:1,age:0,x:10,y:20}];s.nextId=2;fixContact(s.contacts[0],{x:10,y:20,vx:0,vy:0,time:90,positionSigma:5,source:'visual'});
 const packet={id:'sat-1',capturedAt:80,receivedAt:100,tracks:[{id:'one',x:999,y:999,vx:0,vy:0,identified:false,positionSigma:0},{id:'two',x:100,y:200,vx:3,vy:0,identified:false,positionSigma:0}]};
 assert.equal(applyReconPacket(s,packet),true);const known=s.contacts.find(c=>c.id==='one'),fresh=s.contacts.find(c=>c.id==='two');assert.equal(known.label,'A1');assert.equal(known.name,'Known name');assert.equal(known.fix.time,90);assert.equal(fresh.label,'A2');assert.equal(fresh.identified,false);assert.ok(!('name' in fresh));
 const predicted=estimateAt(fresh,s.time);assert.equal(predicted.x,160);assert.equal(predicted.y,200);assert.ok(predicted.major>0,'a delayed report is already uncertain at receipt');
 assert.equal(applyReconPacket(s,{...packet,id:'sat-future',receivedAt:101}),false);
});
test('malformed recon packets fail atomically without corrupting contacts or the sequence',()=>{
 const s=ocean();s.time=100;const valid={id:'ok',capturedAt:80,receivedAt:100,tracks:[{id:'one',x:10,y:20,vx:0,vy:0,positionSigma:0}]};
 const before=JSON.stringify(s);
 for(const packet of [{...valid,tracks:[...valid.tracks,...valid.tracks]},{...valid,tracks:[{...valid.tracks[0],time:101}]},{...valid,tracks:[{...valid.tracks[0],positionSigma:-1}]}]){assert.equal(applyReconPacket(s,packet),false);assert.equal(JSON.stringify(s),before);}
});
