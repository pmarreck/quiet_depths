import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,save,restore} from '../src/sim.js';
import {sampleLine as recordLine,profiles,ImagerPaper} from '../src/sonar-imager.js';
import {makeWreckPlates} from '../scripts/wreck-plates.mjs';
import {imagerClue,leaveClue,searchClue,searchSeconds} from '../src/suspicion.js';
import {stationLamp} from '../src/convoy-watch.js';
import {patrolNotices} from '../src/ui.js';
import {copyPercent} from '../src/signal-lamp.js';

const world=()=>({x:0,y:0,depth:85,heading:0,time:0,environment:{chartSeed:1},patrol:{seed:1},ships:[]});
const plates=makeWreckPlates(),sampleLine=(s,mode,profile,row)=>recordLine(s,mode,profile,row,plates);
test('a four-knot pass records the survey wreck from bow to stern with a resolved beam and deck in both profiles',()=>{
 for(const profile of ['survey','detail']){
  const s=createGame('survey',51972),wreck=s.site;
  const controlSite={...wreck,kind:'surface',depth:0}; // Same outcrops, no submerged hull.
  const paper=new ImagerPaper('scribbler',profile,plates),water=new ImagerPaper('scribbler',profile,plates);
  Object.assign(s,{heading:wreck.heading,depth:wreck.depth-35,speed:4,ships:[]});
  const angle=s.heading*Math.PI/180,dt=.25;
  for(let d=-44;d<=44;d+=4*.514444*dt){
   s.x=wreck.x+d*Math.sin(angle);s.y=wreck.y+d*Math.cos(angle);
   paper.advance(s,dt,1);water.advance({...s,site:controlSite},dt,1);
  }
  const widths=[],tones=new Set(),{width,height}=paper;
  for(let y=0;y<height;y++){
   let breadth=0;
   for(let x=Math.floor(width*.39);x<Math.ceil(width*.61);x++){
    const i=y*width+x;
    if(paper.pixels[i]>water.pixels[i]+48){breadth++;tones.add(paper.pixels[i]);}
   }
   widths.push(breadth);
  }
  const first=widths.findIndex(w=>w>0),last=widths.findLastIndex(w=>w>0);
  assert.ok(Math.max(...widths)>=8,profile+' reduces the wreck to a line');
  assert.ok(first>1&&last<height-1&&last-first>=12,profile+' lost one end of the wreck');
  assert.ok(tones.size>=12,profile+' washed out all the deck relief');
 }
});
test('an oblique pass follows the heading of a settled merchant wreck in either direction',()=>{
 const s=world(),v={x:0,y:0,depth:0,sinkDepth:215,hull:0,settled:true,kind:'merchant'};
 for(const heading of [45,-45]){
  const centers=[-25,25].map(y=>{
   s.y=y;s.ships=[];
   const bare=sampleLine(s,'scribbler','detail',0);
   s.ships=[{...v,heading}];
   const line=sampleLine(s,'scribbler','detail',0);
   const hits=Array.from(line.keys()).filter(i=>line[i]>bare[i]+48);
   assert.ok(hits.length>=4);
   return (hits[0]+hits.at(-1))/2;
  });
  assert.ok((centers[1]-centers[0])*Math.sign(heading)>20,'Wreck footprint should cross the paper on the correct diagonal');
 }
});
test('Scribbler places opposite-side echoes on opposite halves of the same strip and leaves a shadow behind a raised object',()=>{
 const s=world(),row=()=>sampleLine(s,'scribbler','detail',0),clean=row();
 const v={x:260,y:0,depth:215,heading:0,hull:0,kind:'sub'};
 s.ships=[v];const starboard=row();s.ships=[{...v,x:-260}];const port=row();
 const half=clean.length/2;
 assert.deepEqual(starboard.slice(0,half),clean.slice(0,half));
 assert.deepEqual(port.slice(half),clean.slice(half));
 const bright=starboard.findIndex((p,i)=>p>clean[i]+70);
 assert.ok(bright>half);assert.ok(starboard.some((p,i)=>i>bright&&p<clean[i]/2));
 assert.ok(port.some((p,i)=>i<half&&p>clean[i]+70));
});
test('Scribbler records distinct seabed texture under the keel at different heights on both profiles',()=>{
 for(const profile of Object.keys(profiles)){
  const s=world(),half=sampleLine(s,'scribbler',profile,0).length/2;
  for(const depth of [20,85,190]){
   s.depth=depth;s.y=0;
   const center=()=>sampleLine(s,'scribbler',profile,0).slice(half-2,half+2);
   const first=center();
   assert.ok(first.every(v=>v>0),'Missing seabed under the keel');
   s.y+=80;
   assert.notDeepEqual(center(),first,'Center should record the ground the sub crosses');
  }
 }
});
test('Scribbler puts a wreck crossing the track on both sides of center and respects echo range',()=>{
 const s=world(),{range}=profiles.detail;
 const line=()=>sampleLine(s,'scribbler','detail',0),clean=line(),width=clean.length,half=width/2;
 const wreck={x:0,y:0,depth:215,heading:90,hull:0,kind:'wreck'};
 s.ships=[wreck];
 const crossing=line();
 for(const i of [half-1,half])assert.ok(crossing[i]>clean[i]+70,'Wreck should cross the center of the paper');
 s.ships=[{...wreck,x:45}];
 const tick=width*3/4;
 assert.ok(line()[tick]>clean[tick]+70,'Wreck should appear at the starboard 45 m tick');
 s.ships=[{...wreck,x:180,depth:s.depth+range}];
 assert.deepEqual(line(),clean,'An echo outside ping range should leave no mark or shadow');
});
test('Scribbler leaves the far edge empty when the bottom there is beyond ping range',()=>{
 const s=world(),edge=()=>sampleLine(s,'scribbler','detail',0)[0];
 s.depth=20;assert.equal(edge(),0);
 s.depth=190;assert.ok(edge()>0);
});
test('Painter separates up/down and port/starboard, excludes contacts aft, and uses no affiliation data',()=>{
 const s=world(),frame=()=>Array.from({length:profiles.detail.height},(_,r)=>sampleLine(s,'painter','detail',r));
 const clean=frame(),v={x:-40,y:250,heading:90,kind:'sub',depth:55,hull:100,side:'friendly'};
 s.ships=[v];const friendly=frame();s.ships=[{...v,side:'hostile'}];assert.deepEqual(frame(),friendly);
 const hits=[];
 friendly.forEach((line,y)=>line.forEach((n,x)=>{if(n>clean[y][x]+60)hits.push({x,y});}));
 assert.ok(hits.length>=2);assert.ok(hits.every(p=>p.x<profiles.detail.width/2&&p.y<profiles.detail.height/2));
 s.ships=[{...v,y:-250}];assert.deepEqual(frame(),clean);
});
test('Scribbler writes at the top and scrolls each completed line down without resampling history',()=>{
 for(const profile of Object.keys(profiles)){
  const s=world(),p=new ImagerPaper('scribbler',profile,plates),w=p.width,lineTime=1/p.rows;
  const first=sampleLine(s,'scribbler',profile,0);
  p.advance(s,lineTime/2,1);
  assert.equal(p.y,0);assert.equal(p.x,w/2);
  assert.deepEqual(p.pixels.slice(0,p.x),first.slice(0,p.x));assert.ok(p.pixels.slice(p.x).every(x=>x===0));
  p.advance(s,lineTime/2,1);
  assert.deepEqual(p.pixels.slice(w,2*w),first);assert.ok(p.pixels.slice(0,w).every(x=>x===0));
  s.heading=120;s.x=90;p.advance(s,lineTime,1);
  assert.deepEqual(p.pixels.slice(2*w,3*w),first);assert.notDeepEqual(p.pixels.slice(w,2*w),first);
  const held=p.pixels.slice();p.advance(s,100,0);assert.deepEqual(p.pixels,held);
 }
});
test('direct, incidental and muted scans produce ordered exposure across a fixed set of patrol seeds',()=>{
 const counts=[];
 for(const [profile,forward,chance] of [['detail',true,1],['survey',true,1],['detail',false,1],['detail',true,0]]){
  let clues=0;
  for(let seed=0;seed<300;seed++){
   const s={...world(),patrol:{seed},difficulty:{pingDetection:chance,detection:1}};
   const ship={id:'hunter',x:0,y:forward?300:-300,depth:85,alert:0};
   imagerClue(s,ship,'painter',profile,1);
   if(ship.clue){clues++;assert.ok(!ship.report);assert.notEqual(ship.clue.x,s.x);}
  }
  counts.push(clues);
 }
 assert.ok(counts[0]>counts[1]&&counts[1]>counts[2]&&counts[2]>0);assert.equal(counts[3],0);
});
test('the persistence slider times out a search for a frozen area, and hiding suspicion preserves heard evidence',()=>{
 for(const pursuit of [.4,1,2]){
  const s=createGame('shadow',432);s.difficulty.pursuit=pursuit;
  const v=s.ships.find(v=>v.kind==='escort');leaveClue(s,v,24);
  const p={...v.clue};s.x+=4000;s.y-=3000;searchClue(s,v,.25);assert.deepEqual(v.clue,p);
  s.time=searchSeconds(pursuit)+1;assert.equal(searchClue(s,v,.25),false);assert.equal(v.clue,undefined);
 }
 const s=createGame('recon');s.alert=37;s.reports.push({time:0,id:'sweep',text:'Search ping crossed our hull'});
 const notices=()=>patrolNotices(s,false,false,'sonar').map(v=>v.id);
 assert.ok(notices().includes('detection'));s.difficulty.showSuspicion=false;assert.ok(!notices().includes('detection'));assert.ok(notices().includes('sweep'));
 assert.equal(restore(save(s)).difficulty.showSuspicion,false);
});
test('a surfaced crew copies a dated friendly fix through the actual lamp, including after reloading mid-message',()=>{
 let s=createGame('tiebreaker',47,{weather:'clear',timeOfDay:'day',difficulty:{airSupport:false}});
 s.battle.next=999;s.scope=false;s.silent=true;s.depth=s.targetDepth=70;s.targetSpeed=s.speed=0;
 const escort=s.ships.find(v=>v.side==='friendly'&&v.kind==='escort'),sub=s.ships.find(v=>v.side==='hostile'&&v.kind==='sub');
 for(const v of s.ships)Object.assign(v,{speed:0,attack:9999});
 Object.assign(escort,{x:0,y:400});Object.assign(sub,{x:40,y:620,depth:64});
 Object.assign(s,{x:0,y:0});
 step(s,32);assert.ok(escort.lampFix);assert.equal(stationLamp(s),undefined);
 s.depth=s.targetDepth=0;step(s,.25);const m=stationLamp(s),sender=m.estimate.sender,fix={...m.estimate};
 assert.ok(m);assert.ok(!s.contacts.some(c=>c.fix?.source==='lamp'));
 const see={observation:'tower',lampInView:sender};
 step(s,4,see);assert.ok(copyPercent(m)>0&&copyPercent(m)<100);
 s=restore(save(s));assert.ok(s);assert.deepEqual(stationLamp(s),m);
 s.ships.find(v=>v.id===sub.id).x+=2200;step(s,1);const partial=copyPercent(stationLamp(s));
 step(s,2,{...see,lampInView:'wrong'});assert.equal(copyPercent(stationLamp(s)),partial);
 for(let i=0;i<100&&!s.contacts.some(c=>c.fix?.source==='lamp');i++)step(s,1,see);
 const c=s.contacts.find(c=>c.id===sub.id);
 assert.equal(c.fix.source,'lamp');assert.equal(c.fix.x,fix.x);assert.equal(c.fix.y,fix.y);assert.equal(c.fix.time,fix.time);
 assert.equal(c.depthEstimate,fix.depth);assert.ok(c.courseEstimated);assert.equal(c.kind,'sub');
 assert.ok(s.reports.some(r=>r.id==='allied-fix'));assert.ok(restore(save(s)));
});

test('a transport can suspect a nearby transmission and then forget it without becoming a hunter',()=>{
 const s=createGame('shadow',508,{difficulty:{pursuit:.4,airSupport:false}});
 const ship=s.ships.find(v=>v.kind==='merchant'&&v.military);
 s.ships=[ship];s.scope=false;s.silent=true;s.speed=s.targetSpeed=0;s.depth=s.targetDepth=95;
 Object.assign(ship,{x:s.x+6000,y:s.y+8000,speed:0});
 leaveClue(s,ship,45);const heading=ship.heading;
 step(s,.25);assert.ok(s.alert>30);assert.equal(ship.tracking,undefined);
 step(s,41);assert.equal(ship.clue,undefined);assert.equal(ship.heading,heading);
 assert.equal(s.alert,0);
});

test('all stop holds the Scribbler at the exact pixel and astern movement resumes it',()=>{
 const s={...world(),speed:4},paper=new ImagerPaper('scribbler','survey',plates);
 paper.advance(s,.25,1);
 const before={x:paper.x,lines:paper.completedLines,pixels:paper.pixels.slice()};
 s.speed=0;s.time+=60;paper.advance(s,60,1);
 assert.equal(paper.completedLines,before.lines);assert.equal(paper.x,before.x);assert.deepEqual(paper.pixels,before.pixels);
 s.speed=-4;s.time++;paper.advance(s,1,1);assert.ok(paper.completedLines>before.lines);
});

test('a patrol keeps a running Scribbler transmitting at other stations and at all stop',()=>{
 const s=createGame('survey',33);s.ships=[];s.speed=s.targetSpeed=0;s.imagers.scribbler='detail';
 step(s,6,{observation:'tower'});assert.equal(s.imagingTime,6);
 assert.ok(patrolNotices(s,false,false,'chart').some(n=>n.id==='sonar-transmission'));
 const r=restore(save(s));assert.equal(r.imagers.scribbler,'detail');step(r,3,{paused:true});assert.equal(r.imagingTime,6);
 r.systems.sonar=0;step(r,1);assert.equal(r.imagers.scribbler,'detail');assert.equal(r.imagingTime,6);
 assert.match(patrolNotices(r,false,false,'chart').find(n=>n.id==='sonar-transmission').text,/offline/);
 r.systems.sonar=100;step(r,1);assert.equal(r.imagingTime,7);
 r.imagers.scribbler=null;step(r,1);assert.equal(r.imagingTime,7);
 assert.ok(!patrolNotices(r,false,false,'chart').some(n=>n.id==='sonar-transmission'));
});

test('browsing fixes the archived row and timestamp while live paper crosses chunk boundaries',()=>{
 const s={...world(),speed:4},p=new ImagerPaper('scribbler','survey',plates),dt=1/p.rows;
 const advance=n=>{for(let i=0;i<n;i++){s.time+=dt;s.y+=2;p.advance(s,dt,1);}};
 advance(150);
 const reference=p.visibleRow(15).slice(),timestamp=p.recordedAt(135);
 p.scrollRows(15);assert.ok(p.browsing);assert.equal(p.topLine,135);assert.deepEqual(p.visibleRow(0),reference);
 advance(150);assert.equal(p.topLine,135);assert.equal(p.recordedAt(p.topLine),timestamp);assert.deepEqual(p.visibleRow(0),reference);
 assert.ok(Math.abs(timestamp-136*dt)<.001);
 p.scrollRows(1000);assert.equal(p.topLine,p.height-1);assert.ok(p.visibleRow(p.height-1).some(Boolean));
 p.showLive();assert.equal(p.topLine,300);assert.ok(!p.browsing);
 s.speed=0;s.time+=90;p.advance(s,90,1);assert.equal(p.topLine,300);
 s.speed=4;advance(1);assert.ok(p.recordedAt(300)-p.recordedAt(299)>90);
 p.scrollRows(8);p.clear();assert.ok(!p.browsing);assert.equal(p.completedLines,0);assert.equal(p.recordedAt(0),undefined);assert.ok(p.pixels.every(v=>v===0));
 advance(1);assert.equal(p.completedLines,1);assert.ok(p.recordedAt(0)>s.time-1);
});

test('Painter and Scribbler switches are independent, survive saves, and reset for a new patrol',()=>{
 const s=createGame('survey',4);s.ships=[];s.imagers={scribbler:'survey',painter:'detail'};
 step(s,5);assert.match(patrolNotices(s,false,false,'orbit').find(n=>n.id==='sonar-transmission').text,/Scribbler \+ Painter transmitting/);
 const r=restore(save(s));assert.deepEqual(r.imagers,s.imagers);r.imagers.painter=null;step(r,1);assert.equal(r.imagingTime,6);
 r.imagers.scribbler=null;step(r,1);assert.equal(r.imagingTime,6);
 const legacy=structuredClone(s);delete legacy.imagers;
 assert.deepEqual(restore(save(legacy)).imagers,createGame('survey',4).imagers);
 s.imagers.painter='bad';assert.equal(restore(save(s)),null);
});

test('two fingers distinguish a parallel scroll from an off-center pinch',async()=>{
 const {TwoFingerMotion}=await import('../src/view-gestures.js');
 const finger=(x,y)=>({clientX:x,clientY:y});
 const scroll=new TwoFingerMotion(finger(0,30),finger(100,30));
 assert.equal(scroll.move(finger(0,32),finger(100,32)),null);
 const up=scroll.move(finger(0,10),finger(100,10));assert.equal(up.kind,'scroll');assert.equal(up.scroll,20);assert.ok(up.factor>1);
 const down=scroll.move(finger(0,30),finger(100,30));assert.ok(Math.abs(down.factor*up.factor-1)<1e-8);
 const pinch=new TwoFingerMotion(finger(0,0),finger(0,100));
 const spread=pinch.move(finger(0,0),finger(0,125));assert.equal(spread.kind,'pinch');assert.equal(spread.factor,1.25);
});
