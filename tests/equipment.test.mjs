import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,ping,restore,save,isVisible} from '../src/sim.js';
import {environmentAt} from '../src/environment.js';
import {damageSystem,damageDrone,hurt,deployDrone} from '../src/systems.js';
import {feedActive} from '../src/controls.js';
import {propulsion} from '../src/power-plant.js';
import {fireDeckGun} from '../src/combat.js';
import {dronePhotograph,updateOperation} from '../src/missions.js';
import {signalOpacity,drawSonarGlass,lensFilter} from '../src/instrument-damage.js';

function boat(mission='shadow'){
 const s=createGame(mission,36,{weather:'clear',timeOfDay:'day',changing:false});
 Object.assign(s,{heading:0,targetHeading:0,speed:0,targetSpeed:0,depth:0,targetDepth:0});
 return s;
}

test('old saves preserve damaged and destroyed parts, modern saves validate each ceiling',()=>{
 const s=boat();
 delete s.repairLimits;delete s.drone.repairLimits;
 s.systems.sonar=47;s.systems.periscope=0;s.drone.camera=0;s.drone.mobility=28;
 const old=restore(save(s));
 assert.equal(old.systems.sonar,47);assert.equal(old.repairLimits.sonar,100);assert.equal(old.repairLimits.periscope,0);
 assert.equal(old.drone.mobility,28);assert.equal(old.drone.repairLimits.mobility,100);assert.equal(old.drone.repairLimits.camera,0);
 for(const mutate of [x=>delete x.repairLimits.planes,x=>x.repairLimits=null,x=>x.drone.repairLimits.camera=101,x=>x.drone.camera=-2]){
  const bad=structuredClone(old);mutate(bad);assert.equal(restore(save(bad)),null);
 }
});

test('separate hull and dockside repair limits apply only to parts struck',()=>{
 const s=boat();s.ships=[];
 hurt(s,2,'collision','rudder');hurt(s,2,'collision','rudder');
 assert.equal(s.repairLimits.hull,72.25);assert.equal(s.repairLimits.rudder,72.25);assert.equal(s.repairLimits.engine,100);
 assert.equal(s.hull,96);const outer=s.outerHull;
 assert.ok(deployDrone(s));damageDrone(s,65,'collision');damageDrone(s,2,'collision');
 assert.deepEqual(s.drone.repairLimits,{hull:72.25,mobility:72.25,buoyancy:72.25,camera:72.25});
 s.drone.mode='stowed';s.drone.camera=0;s.repair=120;
 for(let i=0;i<5;i++)step(s,60);
 assert.equal(s.hull,96);assert.equal(s.outerHull,outer);
 assert.equal(s.drone.hull,72.25);assert.equal(s.drone.camera,0);
});

test('20 percent enables short-range observation and a slower deck station',()=>{
 for(const condition of [19.99,20,50,100]){
  const s=boat();const ship=s.ships[0];Object.assign(ship,{x:s.x,y:s.y+1700,kind:'merchant',hull:100});s.ships=[ship];s.contacts=[];
  s.systems.sonar=s.systems.periscope=s.systems.deckgun=condition;s.scope=true;
  assert.equal(ping(s),condition>=20);assert.equal(s.contacts.length,condition>=50?1:0);
  assert.equal(feedActive(s,'scope'),condition>=20);assert.equal(isVisible(s,ship,null,{...environmentAt(s),opticalRange:4000}),condition>=50);
  const fired=fireDeckGun(s,{bearing:0,elevation:0});
  assert.equal(fired,condition>=20);if(fired)assert.equal(s.gun.cooldown,25/condition);
 }
});

test('propulsion, steering and repairs lose authority at their specified boundaries',()=>{
 for(const health of [0,19,20,50,100]){
  const s=boat();s.ships=[];s.depth=s.targetDepth=30;s.systems.engine=health;s.targetSpeed=-4;step(s,45);
  assert.ok(Math.abs(s.speed+(health<20?0:4*health/100))<.001);
  s.systems.engine=100;s.systems.propeller=health;s.targetSpeed=17;step(s,60);assert.ok(Math.abs(s.speed-(health<20?0:16*health/100))<.001);
  s.speed=s.targetSpeed=0;assert.ok(deployDrone(s));s.drone.mobility=health;s.drone.targetSpeed=-3;s.drone.targetHeading=s.drone.heading+30;
  const heading=s.drone.heading;step(s,4);assert.equal(s.drone.heading===heading,health<20);
  assert.ok(Math.abs(s.drone.speed+(health<20?0:3*health/100))<.001);
  s.drone.mode='stowed';s.drone.camera=30;s.systems.crew=health;s.systems.oxygen=30;s.repair=120;step(s,5);
  assert.equal(s.systems.oxygen>30,health>0);assert.equal(s.drone.camera>30,health>0);
 }
});

test('survey scan and photographs respect the recording instrument',()=>{
 const s=boat('survey');Object.assign(s,{x:s.site.x+50,y:s.site.y,depth:s.site.depth,speed:1});
 s.systems.sonar=20;updateOperation(s,5);assert.equal(s.operation.scan,1);
 s.systems.sonar=19;updateOperation(s,5);assert.equal(s.operation.scan,1);
 Object.assign(s.drone,{mode:'remote',x:s.site.x,y:s.site.y-40,depth:s.site.depth,heading:0,camera:19});
 assert.equal(feedActive(s,'drone'),false);assert.equal(dronePhotograph(s).ok,false);
 s.drone.camera=20;assert.ok(feedActive(s,'drone'));assert.equal(dronePhotograph(s).ok,false);
 s.drone.camera=50;assert.equal(dronePhotograph(s).ok,true);
});

test('sonar damage adds fixed fractures and modulates signal brightness; flooded optics progressively blur',()=>{
 const cracks=health=>{let starts=0;drawSonarGlass({save(){},restore(){},beginPath(){},stroke(){},lineTo(){},moveTo(){starts++;}},600,300,health);return starts;};
 assert.deepEqual([100,80,50,20,0].map(cracks),[0,4,6,10,12]);
 assert.equal(signalOpacity(100,0,0,false),1);
 assert.ok(signalOpacity(25,0,1,false)<signalOpacity(75,0,1,false));
 assert.notEqual(signalOpacity(25,0,1,false),signalOpacity(25,0,3,false));
 assert.equal(signalOpacity(25,0,1,true),signalOpacity(25,0,3,true));
 assert.equal(lensFilter(100),'');assert.match(lensFilter(75),/blur\(1.25px\)/);assert.match(lensFilter(25),/blur\(3.75px\)/);
});


test('a surveillance patrol needs a working receiver within its remaining range',()=>{
 const s=boat();s.depth=s.targetDepth=35;
 const merchant=s.ships[0];Object.assign(merchant,{kind:'merchant',military:false,x:s.x+1000,y:s.y,speed:0});s.ships=[merchant];
 for(const [condition,expected] of [[19,0],[20,0],[50,1]]){
  s.systems.sonar=condition;step(s,1);assert.equal(s.trackTime,expected);
 }
});

test('damage separates diesel generation, battery storage, electric drive and fuel supply',()=>{
 function run(engine,key,health){
  const s=boat();s.ships=[];s.engine=engine;s.dieselMode='drive';s.targetSpeed=17;s.systems[key]=health;
  step(s,60);return s;
 }
 assert.equal(run('diesel','diesel',100).speed,20.5);assert.equal(run('electric','diesel',100).speed,16);
 assert.equal(run('diesel','diesel',50).speed,10.25);assert.equal(run('electric','diesel',0).speed,16);
 assert.equal(run('electric','batteryBank',50).speed,8);assert.equal(run('diesel','batteryBank',0).speed,20.5);
 assert.equal(run('diesel','engine',50).speed,10.25);assert.equal(run('electric','engine',50).speed,8);
 assert.equal(run('diesel','fuelTank',19).speed,0);assert.equal(run('electric','fuelTank',0).speed,16);
 assert.ok(run('diesel','fuelTank',50).fuel<=50);assert.ok(run('diesel','batteryBank',50).battery<=50);
});

test('the same throttle slows while diving on diesel and the intake closes below 14 m',()=>{
 const steady=(engine,depth,dieselMode='drive')=>{
  const s=boat();Object.assign(s,{engine,depth,targetDepth:depth,targetSpeed:17,ships:[],dieselMode,battery:40});
  step(s,60);return s;
 };
 assert.equal(steady('diesel',0).speed,20.5);assert.equal(steady('diesel',3).speed,16.75);
 assert.equal(steady('diesel',14).speed,13);assert.equal(steady('diesel',14,'charge').speed,9);assert.equal(steady('diesel',14.1).speed,0);
 assert.equal(steady('electric',60).speed,16);
 const half=steady('diesel',0);half.targetSpeed=8.5;step(half,60);assert.equal(half.speed,10.25);
});
test('diesel routing trades stored charge for speed through one motor at the surface and on the snorkel',()=>{
 for(const [depth,ratings] of [[0,[18.5,20.5,22]],[12,[9,13,17]]]){
  for(const [index,dieselMode] of ['charge','drive','assist'].entries()){
   const s=boat();Object.assign(s,{engine:'diesel',dieselMode,depth,targetDepth:depth,battery:40,speed:0,targetSpeed:17,ships:[]});
   const fuel=s.fuel;assert.equal(propulsion(s).ahead,ratings[index]);
   step(s,60);assert.equal(s.speed,ratings[index]);assert.ok(s.fuel<fuel);
   assert.equal(Math.sign(s.battery-40),[1,0,-1][index]);
   assert.equal(restore(save(s)).dieselMode,dieselMode);
  }
 }
});
test('assist only spends battery power above generator capacity and respects shared faults and intake loss',()=>{
 const s=boat();Object.assign(s,{engine:'diesel',depth:12,dieselMode:'assist',targetSpeed:3,battery:50});
 assert.equal(propulsion(s).assistDrain,0);s.targetSpeed=17;assert.ok(propulsion(s).assistDrain>0);
 for(const key of ['engine','propeller']){
  s.systems[key]=0;assert.equal(propulsion(s).ahead,0);assert.equal(propulsion(s).assistDrain,0);s.systems[key]=100;
 }
 s.systems.engine=50;assert.ok(propulsion(s).assistDrain>0);assert.equal(propulsion(s).ahead,8.5);s.systems.engine=100;
 s.battery=0;assert.equal(propulsion(s).ahead,13);assert.equal(propulsion(s).assistDrain,0);
 s.battery=100;s.dieselMode='charge';assert.equal(propulsion(s).ahead,13);assert.equal(propulsion(s).chargeRate,0);
 s.dieselMode='assist';s.depth=15;assert.equal(propulsion(s).ahead,0);assert.equal(propulsion(s).assistDrain,0);
 const old=JSON.parse(save(s));delete old.dieselMode;assert.equal(restore(JSON.stringify(old)).dieselMode,'charge');
 old.dieselMode='bogus';assert.equal(restore(JSON.stringify(old)),null);
});

test('fuel damage loses stored fuel permanently and a crew can contain a fire and seal the leak',()=>{
 const s=boat();s.ships=[];s.fuel=100;damageSystem(s,'fuelTank',40);
 assert.equal(s.fuel,60);assert.ok(s.fuelLeak>0);step(s,2);assert.ok(s.fuel<60);
 s.fuelFire=18;const resumed=restore(save(s));assert.deepEqual(resumed,s);
 resumed.repair=120;step(resumed,40);assert.equal(resumed.fuelFire,0);assert.equal(resumed.fuelLeak,0);
 assert.ok(resumed.systems.fuelTank>60);assert.ok(resumed.fuel<60);
 const seeds=Array.from({length:150},(_,i)=>i+1);
 let ignitions=0,explosions=0;
 for(const seed of seeds){
  const hot=boat();hot.ships=[];hot.rng=seed;hot.fuelLeak=1;step(hot,20);
  if(hot.debrief.some(d=>d.text.includes('caught fire')))ignitions++;
  hot.fuelFire=24;step(hot,20);
  if(hot.debrief.some(d=>d.text.includes('vapor explosion')))explosions++;
 }
 assert.ok(ignitions>0&&ignitions<seeds.length);assert.ok(explosions>0&&explosions<ignitions);
});

test('impact sections turn with the sub, favor local equipment and reserve cook-offs for armed bow hits',()=>{
 const slots={bow:['tubes','crew','deckgun'],midships:['batteryBank','ballast','sonar','periscope','oxygen'],stern:['diesel','engine','fuelTank','propeller','planes','rudder']};
 for(const heading of [0,90,215]){
  for(const [section,angle] of [['bow',0],['midships',90],['stern',180]]){
   let local=0,cookoffs=0;
   for(let i=0;i<180;i++){
    const s=boat();s.heading=heading;s.rng=(i+1)*982451653>>>0;
    const a=(heading+angle)*Math.PI/180,point={x:s.x+Math.sin(a)*25,y:s.y+Math.cos(a)*25,depth:s.depth};
    hurt(s,36,'Test impact.',null,point);
    if(slots[section].some(k=>s.systems[k]<100))local++;
    if(s.cookoff){cookoffs++;assert.equal(s.status,'lost');assert.ok(s.impacts.some(p=>p.kind==='cookoff'));}
    if(section==='bow'){
     const empty=boat();empty.heading=heading;empty.rng=(i+1)*982451653>>>0;empty.torps=0;hurt(empty,36,'Test impact.',null,point);
     assert.equal(empty.cookoff,false);
    }
   }
   assert.ok(local>130&&local<180,section+' should favor local damage but allow exceptions');
   if(section==='bow')assert.ok(cookoffs>0&&cookoffs<18);else assert.equal(cookoffs,0);
  }
 }
});

test('pre-compartment saves retain propulsion health and repair ceilings, and damaged tubes take longer to reload',async()=>{
 const {contact,fire}=await import('../src/sim.js');
 const s=boat();s.systems.engine=42;s.repairLimits.engine=55;
 for(const k of ['diesel','fuelTank','batteryBank','tubes']){delete s.systems[k];delete s.repairLimits[k];}
 for(const k of ['plantVersion','fuelFire','fuelLeak','cookoff'])delete s[k];
 const old=restore(save(s));assert.ok(old);assert.equal(old.systems.diesel,42);assert.equal(old.repairLimits.diesel,55);assert.equal(old.systems.engine,42);
 const t=old.ships.find(v=>v.military);contact(old,t,'active');
 old.systems.tubes=50;assert.ok(fire(old,t.id));assert.equal(old.tubeReadyAt.port,40);
 assert.deepEqual(restore(save(old)),old);old.systems.tubes=19;assert.equal(fire(old,t.id),false);
 delete old.systems.batteryBank;assert.equal(restore(save(old)),null);
});

// A hit with no real size, NaN or infinite, once left the outer hull and the
// flooding NaN (every later comparison then false, and null after a save) or
// flooded the boat while sparing its pressure hull. Such a hit changes nothing.
test('a hit whose size is not a finite number changes nothing', () => {
 for (const amount of [NaN, Infinity, -Infinity]) for (const subsystem of [null, 'sonar']) {
  const s = boat(), before = structuredClone(s), point = {x: s.x, y: s.y + 20, depth: s.depth};
  hurt(s, amount, 'Phantom impact.', subsystem, point);
  assert.deepStrictEqual(s, before, `a hit of ${amount}${subsystem ? ' to the ' + subsystem : ''}`);
 }
});

// The drone's damage guard had the same gap as hurt's: a NaN or infinite hit
// passed it, damaged nothing, and still logged an impact.
test('a drone hit whose size is not a finite number changes nothing', () => {
 for (const amount of [NaN, Infinity, -Infinity]) for (const mode of ['remote', 'return']) {
  const s = boat(); s.drone.mode = mode;
  const before = structuredClone(s);
  damageDrone(s, amount, 'phantom contact.');
  assert.deepStrictEqual(s, before, `a drone hit of ${amount} while ${mode}`);
 }
});
