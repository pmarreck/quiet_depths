import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createGame,contact,step,fire,save,restore,MISSIONS} from '../src/sim.js';
import {launchHostileTorpedo,updateCombat} from '../src/combat.js';
import {patrolNotices} from '../src/ui.js';
import {disciplinaryFinding} from '../src/patrol-reports.js';
import {floorSurface} from '../src/seafloor.js';
import {crewOnAlert} from '../src/mess-watch.js';
import {crewPeriod,quietForSleep,CrewAmbience} from '../src/crew-ambience.js';
import {nudgeHelm,setHelmOrder} from '../src/controls.js';

const quiet=()=>{const s=createGame('recon',42);Object.assign(s,{x:0,y:0,speed:0,targetSpeed:0,depth:40,targetDepth:40,heading:0,targetHeading:0,scope:false,ships:[],contacts:[]});return s;};
const text=s=>patrolNotices(s,false,false).map(n=>n.text);
const target=(id,y,military=true)=>({id,name:id,kind:'sub',x:0,y,depth:40,heading:0,speed:0,hull:100,alert:0,attack:999,military});
test('port and starboard move the ordered heading the same way ahead and astern',()=>{
 for(const speed of [-3,3])for(const turn of [-15,15]){
  const s=quiet();s.speed=s.targetSpeed=speed;
  nudgeHelm(s,{view:'scope'},turn);step(s,4);
  assert.equal(s.targetHeading,turn<0?345:15);
  assert.equal(Math.sign(s.rudder),Math.sign(speed)*Math.sign(turn));
  assert.ok(turn<0?s.heading>350:s.heading>0&&s.heading<10);
 }
});

test('a pending heading at all stop explains the delay until actual motion resumes',()=>{
 const s=quiet(),ctx={view:'chart'},message='Course correction requires forward or reverse movement.';
 assert.ok(!text(s).includes(message));
 s.heading=359.9;setHelmOrder(s,ctx,'heading',.1);step(s,1);
 assert.equal(s.heading,359.9);assert.ok(text(s).includes(message));
 assert.ok(!patrolNotices(s,false,false,'drone').some(n=>n.text===message));
 setHelmOrder(s,ctx,'heading',s.heading);assert.ok(!text(s).includes(message));
 setHelmOrder(s,ctx,'heading',15);
 for(const speed of [-3,3]){
  s.speed=0;setHelmOrder(s,ctx,'speed',speed);assert.ok(text(s).includes(message));
  step(s,.25);assert.ok(!text(s).includes(message));
  setHelmOrder(s,ctx,'speed',0);assert.ok(!text(s).includes(message));
  step(s,1);assert.ok(text(s).includes(message));
 }
});

test('the transit starts at Gate A with patrol traffic and ends underwater only at Gate B',()=>{
 const s=createGame('sneaky-seamen',15);assert.ok(s.ships.some(v=>v.kind==='sub'&&v.military));
 assert.ok(s.ships.filter(v=>v.kind==='merchant').length>=2);
 assert.deepEqual(s.departure,{x:s.x,y:s.y});step(s,.25);assert.equal(s.status,'patrol');
 const loaded=restore(save(s));assert.deepEqual(loaded,s);
 Object.assign(loaded,{...s.home,depth:53,targetDepth:53});step(loaded,.25);
 assert.equal(loaded.status,'won');assert.equal(loaded.phase,'objective');
});

test('a received search ping gives a bearing after sound travels and obeys the difficulty control',()=>{
 for(const chance of [0,1]){
  const s=createGame('sneaky-seamen',52);s.difficulty.pingDetection=chance;
  s.depth=s.targetDepth=50;s.scope=false;s.speed=s.targetSpeed=0;s.rng=1;
  const hunter=s.ships.find(v=>v.kind==='sub');
  Object.assign(hunter,{x:s.x,y:s.y+1000,depth:70,speed:0,nextSweep:0,attack:9999});
  step(s,.25);assert.equal(text(s).some(t=>t.includes('Search ping')),false);step(s,1);
  assert.equal(text(s).some(t=>t.includes('Search ping')),!!chance);
  if(chance){const c=s.contacts.find(c=>c.id===hunter.id);assert.ok(c);assert.equal(c.range,0);assert.equal(c.identified,false);assert.equal(c.sweepArea,undefined);
   hunter.nextSweep=s.time;s.rng=1;step(s,1.25);assert.equal(c.sweepArea.size,900);assert.equal(c.range,0);assert.ok(restore(save(s)));
  }
 }
});

test('each shot retains its own distance limit through saving and stops at the boundary',()=>{
 const s=quiet();s.ships=[target('contact',600)];contact(s,s.ships[0],'active');
 s.runSetting=200;assert.ok(fire(s,'contact'));const first=s.projectiles[0];s.runSetting=1000;assert.ok(fire(s,'contact'));
 step(s,3);const reload=restore(save(s));assert.ok(reload);
 assert.deepEqual(reload.projectiles.map(p=>p.runLimit),[200,1000]);
 const p=reload.projectiles[0];step(reload,6);
 assert.equal(p.traveled,200);assert.ok(!reload.projectiles.some(q=>q.id===first.id));
 assert.equal(reload.projectiles.length,1);assert.ok(text(reload).some(t=>t.includes('distance limit')));
 assert.equal(reload.ships[0].hull,100);
 const old=JSON.parse(save(s));delete old.runSetting;for(const q of old.projectiles){delete q.runLimit;delete q.traveled;}
 const legacy=restore(JSON.stringify(old));assert.equal(legacy.projectiles[0].traveled,72);assert.equal(legacy.runSetting,4320);
});

test('an impact is anonymous until debrief, a later collapse yields an estimated wreck and the hull reaches the seabed',()=>{
 const s=quiet(),victim=target('Civilian research boat',240,false);s.ships=[victim];contact(s,victim,'active');
 assert.ok(fire(s,victim.id));
 for(let i=0;i<60&&victim.hull;i++)step(s,.25);
 assert.equal(victim.hull,0);assert.equal(s.status,'patrol');assert.ok(!victim.wreckMark);
 step(s,1);assert.ok(text(s).includes('Explosion heard. Possible torpedo hit.'));
 assert.ok(!s.events.some(e=>e.text.includes(victim.name)||e.text.includes('is sinking')));
 assert.ok(s.debrief.some(e=>e.text.includes(victim.name)));
 const verdict=disciplinaryFinding(s);assert.match(verdict.title,/COURT MARTIALED|RANK DEMOTION/);assert.ok(Math.abs(verdict.angle)>=3&&Math.abs(verdict.angle)<=20);
 step(s,15);assert.ok(text(s).includes('Possible implosion heard'));assert.ok(victim.wreckMark);
 assert.notDeepEqual([victim.x,victim.y],[victim.wreckMark.x,victim.wreckMark.y]);
 assert.ok(s.acoustics.some(e=>e.type==='creak'));const loaded=restore(save(s));assert.deepEqual(disciplinaryFinding(loaded),verdict);
 for(let i=0;i<3;i++)step(loaded,60);const wreck=loaded.ships[0];
 assert.equal(wreck.settled,true);assert.ok(Math.abs(wreck.depth+wreck.sinkDepth+floorSurface(wreck.x,wreck.y).height+3)<.01);
 const savedDepth=wreck.sinkDepth;updateCombat(loaded,1);assert.equal(wreck.sinkDepth,savedDepth);
});

test('night snores are infrequent, and a nearby enemy or battle cuts off an active snore',()=>{
 assert.equal(crewPeriod(0),'sleep');assert.equal(crewPeriod(5.999),'sleep');assert.equal(crewPeriod(6),null);
 const s=quiet();assert.equal(quietForSleep(s),true);s.ships=[target('enemy',300)];
 assert.equal(quietForSleep(s),false);s.ships[0].military=false;assert.equal(quietForSleep(s),true);
 s.projectiles=[{}];assert.equal(quietForSleep(s),false);s.projectiles=[];s.alert=64;assert.equal(quietForSleep(s),false);s.alert=0;
 Object.assign(s.ships[0],{military:true,y:2400,tracking:'searching'});assert.equal(quietForSleep(s),false);
 s.ships[0].tracking=null;assert.equal(quietForSleep(s),true);
 s.gunRounds=[{}];assert.equal(quietForSleep(s),false);s.gunRounds=[];
 const gain={gain:{setTargetAtTime(){}},connect(){}},ctx={currentTime:1,createGain:()=>gain},crew=new CrewAmbience(ctx,{});
 const times=[];let stopped=0;crew.playSnore=()=>times.push(ctx.currentTime);
 for(let i=0;i<200;i++){s.time=i*19;ctx.currentTime=s.time/20;crew.update(s,{hour:2},true);}
 assert.ok(times.length>=2&&times.length<25);
 assert.ok(times.slice(1).every((t,i)=>t-times[i]>=45));
 crew.snore={gain,source:{stop(){stopped++;}}};s.ships[0].y=300;crew.update(s,{hour:3},true);
 assert.equal(stopped,1);assert.equal(crew.snore,null);
});

function crewWatch(){
 const voices=[],notes=[],context={currentTime:0,createGain:()=>({gain:{setTargetAtTime(){}},connect(){}})};
 const crew=new CrewAmbience(context,{});
 crew.speak=line=>{voices.push(line);return true;};crew.note=(...args)=>notes.push(args);
 crew.playSnore=()=>voices.push('snore');crew.playMusic=()=>voices.push('music');
 const listen=(s,h)=>{context.currentTime=s.time;crew.update(s,{hour:h},true);};
 return {voices,notes,listen};
}

test('combat patrols skip off-watch sounds even in empty water, while a peaceful crew can eat and sleep',()=>{
 const routine=new Set(['recon','sneaky-seamen','shadow','undersea-rescue','surface-rescue','survey','wolf-in-the-henhouse']);
 for(const {id:mission} of MISSIONS){
  const s=quiet();s.mission=mission;const {voices,notes,listen}=crewWatch();
  for(const hour of [7,12,14,18,20,23,3])for(let slot=0;slot<24;slot++){s.time+=19;listen(s,hour);}
  if(routine.has(mission)){for(const line of ['goodnight','snore','music'])assert.ok(voices.includes(line));assert.ok(notes.length);}
  else{assert.deepEqual(voices,[],mission);assert.deepEqual(notes,[],mission);}
 }
});
test('only live opponents within two chart kilometers interrupt routine, and a skipped goodnight is not played late',()=>{
 for(const [kind,side,range,hull,expected] of [
  ['ship','hostile',2000,100,false],['ship','hostile',2001,100,true],['ship','friendly',150,100,true],
  ['ship','neutral',100,100,true],['ship','hostile',700,0,true],['aircraft','hostile',1900,100,false],
 ]){
  const s=quiet(),v={...target('traffic',range,side!=='neutral'),side,hull};s[kind==='aircraft'?'aircraft':'ships']=[v];
  const {voices,listen}=crewWatch();listen(s,23);assert.equal(voices.includes('goodnight'),expected,[kind,side,range,hull].join('/'));
  s.time+=6;v.y=6000;listen(s,23.05);assert.equal(voices.includes('goodnight'),expected);
 }
});

test('recent successful launches keep mess quiet after the shot finishes, with range fixed at launch',()=>{
 const s=quiet();s.time=12;const enemy=target('hostile',4000);s.ships=[enemy];contact(s,enemy,'active');
 assert.equal(fire(s,'missing-contact'),false);assert.equal(crewOnAlert(s),false);
 assert.ok(fire(s,enemy.id));
 const legacy=JSON.parse(save(s));delete legacy.crewQuietUntil;
 assert.equal(restore(JSON.stringify(legacy)).crewQuietUntil,s.crewQuietUntil);
 s.projectiles=[];assert.equal(crewOnAlert(s),true);
 const loaded=restore(save(s));assert.ok(loaded);loaded.time+=89.9;assert.ok(crewOnAlert(loaded));
 loaded.time+=.2;assert.equal(crewOnAlert(loaded),false);
 const aim={x:0,y:0,depth:40,age:0};
 for(const [range,expected] of [[2001,false],[2000,true]]){
  const other=quiet();other.time=31;const launcher=target('remote',range);
  launchHostileTorpedo(other,launcher,aim);other.projectiles=[];other.y=-4000;
  assert.equal(crewOnAlert(other),expected);
 }
 loaded.crewQuietUntil=loaded.time+91;assert.equal(restore(save(loaded)),null);
});

test('an alert cuts off playing mess voices and scheduled clinks without stopping damage reports',()=>{
 const sources=[];
 const node=()=>({connect(to){return to;},disconnect(){}});
 const param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const source=()=>{const n={...node(),frequency:param(),start(){},stop(at){this.stopped=at??'now';}};sources.push(n);return n;};
 const ctx={currentTime:1,createGain:()=>({...node(),gain:param()}),createBufferSource:source,createOscillator:source};
 const crew=new CrewAmbience(ctx,{}),s=quiet();s.time=1;
 for(const clip of ['steak','goodnight','hit','hit-alt','leak','leak-alt'])crew.clips.set(clip,{});
 crew.update(s,{hour:10},true);
 crew.speak('steak',.12,true);crew.note(1840,ctx.currentTime+.12,.19,.023);
 const [voice,clink]=sources;s.ships=[target('enemy',1700)];s.hull-=5;s.flood=1;
 crew.update(s,{hour:23},true);
 assert.equal(voice.stopped,'now');assert.equal(clink.stopped,'now');assert.equal(crew.routineSources.size,0);
 assert.equal(sources.length,4);for(const urgent of sources.slice(2))assert.equal(urgent.stopped,undefined);
});
