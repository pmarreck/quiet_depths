import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,isVisible,dropDepthCharge,save,restore,getSoundings} from '../src/sim.js';
import {environmentAt,DAY_SECONDS,WEATHER,TIMES,surfaceHeight,scopeWashed,soundings,waterColumnLight} from '../src/environment.js';
import {AIR_SOUND_SPEED,WATER_SOUND_SPEED,airWaterPath,propagationTime,perceivedSound,engineSound,emitSound,updateAcoustics} from '../src/acoustics.js';
import * as sea from '../src/environment.js';
import {SUB_DESIGN as design} from '../src/hull-design.js';
import {SternSpray} from '../src/surface-motion.js';

test('surface trim exposes one quarter of the hull diameter and wave pitch fades by periscope depth',()=>{
 const s=createGame('recon',121,{weather:'storm',changing:false});s.depth=0;s.pitch=0;
 const e=environmentAt(s),flat=sea.boatSurfacePose(s,{...e,waveScale:0});
 assert.ok(Math.abs((design.hullRadius-flat.depth)/(2*design.hullRadius)-1/4)<1e-8);
 const sweep=depth=>{
  s.depth=depth;const angles=Array.from({length:240},(_,i)=>sea.boatSurfacePose(s,e,i/4).pitch);
  return [Math.min(...angles),Math.max(...angles)];
 };
 const [low,high]=sweep(0),[,mid]=sweep(7),[,deep]=sweep(15);
 assert.ok(low<-.03&&high>.03&&mid<high&&mid>deep&&deep<high*.05);
 s.depth=80;s.pitch=.16;assert.equal(sea.boatSurfacePose(s,e).pitch,.16);
});

test('a stopped rescue boat rides a late weather front without snapping, including at 20×',()=>{
 for(const rate of [1,20]){
  const s=createGame('surface-rescue',21,{weather:'clear',changing:true});
  Object.assign(s,{time:924,speed:0,targetSpeed:0,depth:0,targetDepth:0,pitch:0});
  let previous=sea.boatSurfacePose(s),peakPitch=0,peakRoll=0,peakHeave=0;
  while(s.time<961){
   step(s,rate/32,{timeRate:rate});
   const pose=sea.boatSurfacePose(s);
   peakPitch=Math.max(peakPitch,Math.abs(pose.pitch-previous.pitch)*32);
   peakRoll=Math.max(peakRoll,Math.abs(pose.roll-previous.roll)*32);
   peakHeave=Math.max(peakHeave,Math.abs(pose.depth-previous.depth)*32);
   previous=pose;
  }
  assert.ok(peakPitch<.20&&peakRoll<.16&&peakHeave<5,JSON.stringify({rate,peakPitch,peakRoll,peakHeave}));
  const resumed=restore(save(s));assert.ok(resumed);
  assert.deepEqual(sea.boatSurfacePose(resumed),previous);
  for(const boat of [s,resumed])step(boat,.25,{timeRate:5});
  assert.deepEqual(sea.boatSurfacePose(resumed),sea.boatSurfacePose(s));
 }
});

test('surface water and hull share a clock through time compression, pause and a saved patrol',()=>{
 const slow=createGame('surface-rescue',11,{weather:'rain',changing:false});
 slow.targetSpeed=slow.speed=0;
 const fast=restore(save(slow));
 for(let i=0;i<40;i++){
  step(slow,.1);step(fast,2,{timeRate:20});
  const a=environmentAt(slow),b=environmentAt(fast);
  const height=s=>surfaceHeight(80,32,s.time,environmentAt(s));
  assert.ok(Math.abs(height(slow)-height(fast))<1e-8);
  const hullA=sea.boatSurfacePose(slow,a),hullB=sea.boatSurfacePose(fast,b);
  assert.ok(Math.abs(hullA.depth-hullB.depth)<1e-8&&Math.abs(hullA.pitch-hullB.pitch)<1e-8);
 }
 const frozen=save(fast);step(fast,14,{paused:true,timeRate:20});assert.equal(save(fast),frozen);
 const resumed=restore(frozen);step(resumed,.25);step(slow,.25);
 assert.ok(Math.abs(resumed.wavePhase-slow.wavePhase)<1e-8);
 const bad=JSON.parse(frozen);bad.wavePhase=-1;assert.equal(restore(JSON.stringify(bad)),null);
});

test('a surface-piercing screw throws more spray at higher RPM and leaves its drops behind',()=>{
 const flat={waveScale:0,waveSpeed:1},pose={x:0,y:0,depth:1,heading:0,pitch:0,roll:0};
 const trial=(rpm,depth)=>{
  const spray=new SternSpray(),patrol={};
  let count;
  for(let i=0;i<=16;i++)count=spray.update(patrol,i/16,{...pose,depth},rpm,flat);
  return {spray,patrol,count};
 };
 const {spray,patrol,count}=trial(180,1);
 assert.ok(count>60&&count<=spray.capacity);assert.ok(trial(45,1).count<count);
 assert.equal(trial(-180,1).count,count);assert.equal(trial(0,1).count,0);
 assert.equal(trial(180,design.propellerRadius+.01).count,0);
 const frame=spray.positions.slice();assert.equal(spray.update(patrol,1,pose,180,flat),count);
 assert.deepEqual(spray.positions,frame);
 const remaining=spray.update(patrol,1.25,{...pose,x:100,depth:20},0,flat);
 assert.ok(remaining>0);assert.ok(Math.abs(spray.positions[0])<20);
 assert.equal(spray.update(patrol,3,pose,0,flat),0);
 assert.equal(spray.update({},0,pose,0,flat),0);
});
test('daylight fades with depth and blue outlasts green and red',()=>{
 const clear={daylight:1,cloud:0,sunAltitude:1};
 assert.deepEqual(waterColumnLight(-1,clear),{red:1,green:1,blue:1,direct:1});
 let previous=waterColumnLight(0,clear);
 for(const meters of [3,12,25,60,100,200,400]){
  const light=waterColumnLight(meters,clear);
  assert.ok(light.red<light.green&&light.green<light.blue);
  for(const band of ['red','green','blue'])assert.ok(light[band]<previous[band]);
  previous=light;
 }
 assert.ok(Math.abs(waterColumnLight(200,clear).blue-.01)<.001);
});
test('cloud and night suppress shafts independently from the diffuse light',()=>{
 const atDepth=(timeOfDay,weather)=>waterColumnLight(12,environmentAt(createGame('recon',1,{timeOfDay,weather,changing:false})));
 const clear=atDepth('day','clear'),cloudy=atDepth('day','cloudy'),storm=atDepth('day','storm');
 assert.ok(clear.direct>cloudy.direct&&cloudy.direct>storm.direct);
 assert.equal(storm.direct,0);assert.ok(storm.blue>0&&storm.blue<clear.blue);
 assert.deepEqual(atDepth('night','clear'),{red:0,green:0,blue:0,direct:0});
});

test('soundings distinguish pressure depth, water depth and five-meter keel offset',()=>{
 assert.deepEqual(soundings(230,12),{waterDepth:230,referenceDepth:12,belowKeel:213,keelOffset:5});const s=createGame();assert.equal(getSoundings(s).belowKeel,getSoundings(s).waterDepth-s.depth-5);
});
test('a full day round trips and environment queries do not mutate state',()=>{
 const s=createGame('recon',3,{timeOfDay:'night',weather:'clear',changing:false}),before=save(s),e=environmentAt(s);assert.equal(save(s),before);assert.equal(e.phase,'Night');s.time=DAY_SECONDS;assert.deepEqual(environmentAt(s),e);
});
test('all weather/time combinations are finite and night/storms reduce visual range',()=>{
 for(const weather of Object.keys(WEATHER))for(const timeOfDay of ['day','night','dawn','dusk']){const e=environmentAt(createGame('recon',1,{weather,timeOfDay,changing:false}));for(const k of ['opticalRange','subVisualRange','waveScale','hour','cloud','rain'])assert.ok(Number.isFinite(e[k]),k);assert.ok(e.opticalRange>1000);}
 const day=environmentAt(createGame('recon',1,{timeOfDay:'day'})),night=environmentAt(createGame('recon',1,{timeOfDay:'night'})),storm=environmentAt(createGame('recon',1,{timeOfDay:'day',weather:'storm'}));assert.ok(night.subVisualRange<day.subVisualRange);assert.ok(storm.opticalRange<day.opticalRange);
});
for(const [id,preset] of Object.entries(TIMES))test(`starting time preset ${preset.name} has its advertised lighting phase`,()=>{assert.equal(environmentAt(createGame('recon',4,{timeOfDay:id,changing:false})).phase,preset.name);});
test('storms have larger waves and can wash over the scope',()=>{
 const s=createGame('recon',2,{weather:'storm',changing:false}),c=createGame('recon',2,{weather:'clear',changing:false});let stormPeak=0,clearPeak=0,washed=false;
 for(let t=0;t<200;t+=.25){s.time=c.time=t;stormPeak=Math.max(stormPeak,Math.abs(surfaceHeight(0,0,t,environmentAt(s))));clearPeak=Math.max(clearPeak,Math.abs(surfaceHeight(0,0,t,environmentAt(c))));washed ||= scopeWashed(s);}
 assert.ok(stormPeak>clearPeak*2);assert.ok(washed);
});
test('environment state changes gradually, including weather fronts',()=>{
 const s=createGame('recon',7,{weather:'clear',changing:true});let changed=false,last=environmentAt(s);for(let t=1;t<=1800;t++){s.time=t;const e=environmentAt(s);assert.ok(Math.abs(e.waveScale-last.waveScale)<.08);if(e.weather!=='Clear')changed=true;last=e;}assert.ok(changed);
});
test('darkness changes escort spotting behavior, not only the image',()=>{
 const day=createGame('recon',2,{timeOfDay:'day',changing:false}),night=createGame('recon',2,{timeOfDay:'night',changing:false});for(const s of [day,night]){s.speed=s.targetSpeed=0;s.ships=[{...s.ships.find(c=>c.kind==='escort'),x:2000,y:0,speed:0}];step(s,30);}assert.ok(day.ships[0].alert>night.ships[0].alert+5);
});
test('visibility limits apply to real optical identification',()=>{
 const s=createGame('recon',2,{timeOfDay:'night',weather:'storm',changing:false});const ship=s.ships[0];ship.x=0;ship.y=3000;assert.equal(isVisible(s,ship,0),false);s.environment.startHour=12;s.environment.startWeather='clear';assert.equal(isVisible(s,ship,0),true);
});
test('travel times use exact distance/speed in a single medium',()=>{
 assert.equal(propagationTime({type:'thunder',x:680,y:0,altitude:3},{x:0,y:0,depth:0}),680/AIR_SOUND_SPEED);
 assert.equal(propagationTime({type:'blast',x:1500,y:0,depth:80},{x:0,y:0,depth:80}),1500/WATER_SOUND_SPEED);
 assert.equal(airWaterPath(0,680,150),680/AIR_SOUND_SPEED+150/WATER_SOUND_SPEED);
});
test('air/water refraction agrees with an independent exhaustive interface search',()=>{
 for(const [range,height,depth] of [[3000,900,90],[6000,1200,150],[800,1600,12]]){let oracle=Infinity;for(let i=0;i<=10000;i++){const x=range*i/10000;oracle=Math.min(oracle,Math.hypot(x,height)/340+Math.hypot(range-x,depth)/1500);}const actual=airWaterPath(range,height,depth);assert.ok(actual<=oracle+1e-9);assert.ok(oracle-actual<.0001);}
});
test('thunder becomes quieter and more low-pass filtered with depth',()=>{
 const source={type:'thunder',x:2400,y:0,altitude:1000,power:1};let gain=Infinity,cutoff=Infinity;for(const depth of [0,12,50,120,250]){const p=perceivedSound(source,{x:0,y:0,heading:0,depth});assert.ok(p.gain<gain);assert.ok(p.cutoff<cutoff);gain=p.gain;cutoff=p.cutoff;}
});
test('wavefront arrival follows a moving listener and is consumed once',()=>{
 const s=createGame();s.depth=0;s.time=0;emitSound(s,{type:'thunder',x:680,y:0,altitude:3});s.time=1;updateAcoustics(s);assert.equal(s.acoustics[0].heard,false);s.x=400;s.time=1.1;updateAcoustics(s);assert.equal(s.acoustics[0].heard,true);const heardAt=s.acoustics[0].heardAt;s.time=3;updateAcoustics(s);assert.equal(s.acoustics[0].heardAt,heardAt);assert.equal(restore(save(s)).acoustics[0].heard,true);
});
test('depth charges sink before detonation; the pressure front causes nearby damage',()=>{
 const s=createGame();s.ships=[];s.speed=s.targetSpeed=0;s.depth=s.targetDepth=90;dropDepthCharge(s,{x:s.x+100,y:s.y,depth:90,delay:7});step(s,6);assert.equal(s.hull,100);assert.equal(s.blasts[0].exploded,false);step(s,1);assert.equal(s.hull,100);assert.equal(s.blasts[0].exploded,true);step(s,.5);assert.ok(s.hull<100);assert.equal(s.acoustics.filter(e=>e.type==='blast'&&e.heard).length,1);
});
test('engine sound attenuates with distance, pans with heading and stops for sunk ships',()=>{
 const ship={kind:'merchant',x:0,y:200,speed:6,hull:100};const near=engineSound(ship,{x:0,y:0,depth:20,heading:0}),far=engineSound({...ship,y:3000},{x:0,y:0,depth:20,heading:0});assert.ok(near.gain>far.gain&&far.gain>0);assert.equal(near.pan,0);assert.ok(engineSound(ship,{x:0,y:0,depth:20,heading:270}).pan>.99);assert.equal(engineSound({...ship,hull:0},{x:0,y:0}).gain,0);
});
test('storm lightning emits delayed thunder and survives exact serialization',()=>{
 const s=createGame('recon',6,{weather:'storm',timeOfDay:'night',changing:false});s.scope=false;step(s,18);assert.ok(s.lightning.length>0);assert.ok(s.acoustics.some(e=>e.type==='thunder'));assert.deepEqual(restore(save(s)),s);
});
test('pre-weather patrols migrate without losing mission progress or helm orders',()=>{
 const s=createGame();step(s,20);s.photos=['cobalt'];const before={x:s.x,y:s.y,time:s.time,targetDepth:s.targetDepth,photos:s.photos};for(const k of ['environment','lightning','acoustics','nextLightningAt','soundSequence'])delete s[k];const r=restore(JSON.stringify(s));assert.ok(r);for(const [k,v]of Object.entries(before))assert.deepEqual(r[k],v);assert.equal(r.environment.startWeather,'clear');assert.deepEqual(r.acoustics,[]);
});
test('a damaging pressure front is applied only once, including after save/load',()=>{
 const s=createGame();s.depth=90;emitSound(s,{type:'blast',x:s.x,y:s.y,depth:90});let calls=0;updateAcoustics(s,()=>calls++);updateAcoustics(s,()=>calls++);const r=restore(save(s));updateAcoustics(r,()=>calls++);assert.equal(calls,1);
});
