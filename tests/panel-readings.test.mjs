import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deg,headingReading,depthReading,speedReading,soundingsReading,boatReading,depthPresets} from '../src/panel-readings.js';
import {createGame} from '../src/sim.js';
import {depthLimit} from '../src/pressure.js';
import {SYSTEM_NAMES} from '../src/equipment.js';
import {SURFACE_DEPTH} from '../src/vehicle-status.js';

const helm=(o={})=>({heading:49.4,targetHeading:359.7,depth:38.4,targetDepth:90,speed:2.84,targetSpeed:8.5,...o});

test('headings read as three whole degrees, wrapping past north',()=>{
 assert.deepEqual([deg(49.4),deg(359.6),deg(-0.4),deg(720.2),deg(0)],['049','000','000','000','000']);
 const r=headingReading(helm(),true);
 assert.deepEqual([r.value,r.act,r.req,r.valueText,r.min,r.max,r.step],['049','ACT 049°','REQ 000°','Actual 49.4; requested 359.7',0,359.9,.1]);
 assert.equal(r.actualPercent,49.4/359.9*100);assert.equal(r.enabled,true);assert.equal(headingReading(helm(),false).enabled,false);
});

test('the depth sublabel names the band the vehicle is in',()=>{
 const label=(depth,drone=false)=>depthReading(helm({depth}),drone,true).sublabel;
 assert.equal(label(SURFACE_DEPTH),'SURFACED');assert.equal(label(SURFACE_DEPTH,true),'SURFACED','a surfaced drone reads surfaced');
 assert.equal(label(40,true),'ROV');assert.equal(label(15),'SCOPE');assert.equal(label(15.1),'SUBMERGED');
 assert.equal(label(220),'SUBMERGED');assert.equal(label(220.1),'STRAIN');
 const r=depthReading(helm(),false,true);
 assert.deepEqual([r.value,r.act,r.req,r.actualPercent,r.presets],['38','ACT 38 m','REQ 90 m',38.4/280*100,depthPresets]);
 assert.equal(depthReading(helm({depth:400}),false,true).actualPercent,100);
});

test('the boat’s speed axis is a throttle and the drone’s a requested speed',()=>{
 const boat=speedReading(helm(),false,30,true),rov=speedReading(helm({speed:-1.25,targetSpeed:-2}),true,80,true);
 assert.deepEqual([boat.min,boat.max,boat.ariaLabel,boat.req,boat.valueText],[-4,17,'Submarine throttle','THR 50%','50% throttle, actual 2.8 knots']);
 assert.equal(boat.actualPercent,(2.84*17/20.5+4)/21*100,'the boat tick reaches the top at full surface speed');
 assert.deepEqual([rov.min,rov.max,rov.ariaLabel,rov.req,rov.sublabel,rov.sublabelColor],[-3,10,'Requested ROV speed','REQ -2.0 kn','ASTERN','var(--green)']);
 assert.equal(rov.actualPercent,(-1.25+3)/13*100);
 assert.equal(speedReading(helm({speed:4}),true,0,true).actualPercent,(4+3)/13*100,'a drone tick is not scaled to surface speed');
 const noise=n=>{const r=speedReading(helm(),false,n,true);return r.sublabel+' '+r.sublabelColor;};
 assert.deepEqual([noise(27.9),noise(28),noise(55),noise(55.1)],['QUIET var(--green)','AUDIBLE var(--green)','LOUD var(--green)','LOUD var(--red)']);
});

test('soundings keep their established figures, including a negative zero at contact',()=>{
 assert.deepEqual(soundingsReading({belowKeel:-0.3,waterDepth:0},false,9.5),{drone:false,belowKeel:-0.3,belowKeelText:'-0 m',waterDepthText:'LAND',windText:'10 km/h WIND'});
 assert.deepEqual(soundingsReading({belowKeel:213.4,waterDepth:230.6},true,9.4),{drone:true,belowKeel:213.4,belowKeelText:'213 m',waterDepthText:'231 m',windText:'9 km/h WIND'});
});

test('the boat reading covers every subsystem and formats flooding only while flooding',()=>{
 const s=createGame('recon',7),r=boatReading(s,depthLimit(s),true);
 assert.deepEqual(r.subsystems.map(x=>x.name),Object.values(SYSTEM_NAMES));
 assert.deepEqual(r.systemConditions,Object.values(s.systems));
 assert.equal(r.hullLimits,'Outer hull 100% · Pressure hull 100% · Depth limit 220 m');
 assert.deepEqual([r.hullText,r.floodText,r.waterText,r.fuelFire,r.fuelLeak,r.repairEnabled],['100','','',false,false,true]);
 assert.equal(r.buoyancy,undefined,'the view composes the buoyancy line');
 // Flood figures are not formatted while dry, so a missing water figure cannot break the frame.
 assert.doesNotThrow(()=>boatReading({...s,water:undefined},220,true));
 Object.assign(s,{flood:.84,water:3.25,fuelFire:6,hull:-0.3,ballast:-.255,propRpm:123.45,verticalSpeed:-1.234});
 const wet=boatReading(s,depthLimit(s),false);
 assert.deepEqual([wet.floodText,wet.waterText,wet.fuelFire,wet.hullText,wet.ballastText,wet.rpmText,wet.verticalText,wet.repairEnabled],['0.8','3.3',true,'0','26','123','-1.23',false]);
 // Number() keeps JavaScript's comparisons: a missing condition is NaN, never a decode failure.
 s.systems.sonar=undefined;s.fuelLeak=NaN;
 const odd=boatReading(s,100,true);
 assert.ok(Number.isNaN(odd.subsystems.find(x=>x.name===SYSTEM_NAMES.sonar).condition));assert.equal(odd.fuelLeak,false);
});

test('the drone bay reading works out only the advice its mode needs',async()=>{
 const {droneBayReading}=await import('../src/panel-readings.js');
 const {deployDrone}=await import('../src/sim.js');
 const {DRONE_PARTS}=await import('../src/equipment.js');
 const s=createGame('recon',7);
 let r=droneBayReading(s);
 assert.deepEqual([r.mode,r.charge,r.link,r.buoyancy,r.lostReason],['stowed','100','','','']);
 assert.deepEqual(r.parts.map(p=>p.name),DRONE_PARTS.map(k=>k.toUpperCase()));
 assert.equal(r.deployReason,'Slow to 3 knots or less before launching.');
 s.speed=0;assert.equal(droneBayReading(s).deployReason,'','a ready drone has no reason to wait');
 assert.ok(deployDrone(s));s.drone.buoyancy=87.6;
 r=droneBayReading(s);
 assert.deepEqual([r.mode,r.deployReason,r.link,r.buoyancy],['remote','','18','88']);
 Object.assign(s.drone,{mode:'lost',lostReason:'Tether cut.'});
 assert.deepEqual([droneBayReading(s).lostReason,droneBayReading(s).link],['Tether cut.','']);
 delete s.drone.lostReason;assert.equal(droneBayReading(s).lostReason,'','a missing reason reads blank, as textContent showed it');
});

test('the station reading formats weather and time as the strip showed them',async()=>{
 const {stationReading}=await import('../src/panel-readings.js');
 const env={phase:'DUSK',weather:'RAIN',seaState:4,date:'05 MAR 1972'};
 assert.deepEqual(stationReading({depth:12.4,silent:0,bottomed:undefined},env,'1802'),
  {bottomed:false,surfaced:false,depth:12.4,silent:false,weather:'DUSK · RAIN · SEA 4',time:'05 MAR 1972 · 1802Z'});
 const r=stationReading({depth:0,silent:true,bottomed:1},env,'0000');
 assert.deepEqual([r.bottomed,r.surfaced,r.silent],[true,true,true]);
 assert.equal(stationReading({depth:NaN},env,'0000').surfaced,false,'an unknown depth is not surfaced');
});

test('log entries keep their keys and read as the log always showed them',async()=>{
 const {logReading,logTime}=await import('../src/panel-readings.js');
 const {log}=await import('../src/sim.js');
 assert.deepEqual([logTime(0),logTime(59.9),logTime(61.5),logTime(3725)],['00:00','00:59','01:01','62:05']);
 const keys=new WeakMap();let n=0;const keyOf=e=>{if(!keys.has(e))keys.set(e,++n);return keys.get(e);};
 const s={events:[],time:5};
 log(s,'Dived.');s.time=75;log(s,'Contact.','warning');
 const first=logReading(s.events,keyOf);
 assert.deepEqual(first,{count:'02',entries:[{key:'1',kind:'warning',time:'01:15',text:'Contact.'},{key:'2',kind:'info',time:'00:05',text:'Dived.'}]});
 s.time=80;log(s,'Surfaced.','success');
 const next=logReading(s.events,keyOf);
 assert.deepEqual(next.entries.map(e=>e.key),['3','1','2'],'existing rows keep their keys when an entry arrives');
 assert.deepEqual(logReading([{t:0}],keyOf).entries[0],{key:'4',kind:'undefined',time:'00:00',text:''});
});

test('the mission reading knows which missions return home and when the fleet is awaited',async()=>{
 const {missionReading}=await import('../src/panel-readings.js');
 const {MISSIONS,bearing}=await import('../src/sim.js');
 const objective={label:'L',text:'T',progress:'1/2'},at=(mission,extra={})=>({mission,x:0,y:0,home:{x:1200,y:-1600},...extra});
 const m=MISSIONS[0];
 const returns=MISSIONS.filter(x=>missionReading(at(x.id),m,objective,true,false).returning).map(x=>x.id).sort();
 assert.deepEqual(returns,['recon','shadow','sneaky-seamen','surface-rescue','survey','undersea-rescue','wolf-in-the-henhouse']);
 assert.equal(missionReading(at('recon'),m,objective,false,false).returning,false,'only the extraction phase returns home');
 assert.equal(missionReading(at('recon'),m,objective,false,false).homeDistance,'2.0 km · '+String(Math.round(bearing({x:0,y:0},{x:1200,y:-1600}))).padStart(3,'0')+'°');
 assert.equal(missionReading(at('tiebreaker'),m,objective,false,false).homeDistance,'Awaiting fleet clearance');
 assert.equal(missionReading(at('tiebreaker'),m,objective,true,false).homeDistance.endsWith('°'),true,'cleared fleets get a bearing home');
 assert.deepEqual([missionReading(at('recon',{convoy:{}}),m,objective,false,true).convoy,missionReading(at('recon'),m,objective,false,true).pickup],[true,true]);
});

test('the operation range reads unconfirmed until the site is located, then adds its hull',async()=>{
 const {operationReading}=await import('../src/panel-readings.js');
 const base={mission:'undersea-rescue',x:0,y:0,operation:{active:false,completed:false},site:{x:300,y:400,hull:72.2}};
 assert.equal(operationReading({...base,search:{located:false}},'Search.').range,'POSITION UNCONFIRMED');
 assert.equal(operationReading({...base,search:{located:true}},'x').range,'500 M · Hull 73%');
 assert.equal(operationReading(base,'x').range,'500 M · Hull 73%','a site with no search is known');
 assert.deepEqual(operationReading({mission:'recon',x:0,y:0,operation:null,site:null},'').range,'');
 const r=operationReading({...base,mission:'survey',operation:{active:1,completed:1}},'Advice.');
 assert.deepEqual([r.operation,r.survey,r.completed,r.underway,r.advice],[true,true,true,true,'Advice.']);
});

test('the footer reading words suspicion, noise and clearance as the bar showed them',async()=>{
 const {footerReading}=await import('../src/panel-readings.js');
 const {suspicionLabel}=await import('../src/suspicion.js');
 const s={difficulty:{showSuspicion:true},alert:30.4,ships:[],noise:68.5};
 assert.deepEqual(footerReading(s,213.6),{show:true,alert:30.4,alertText:suspicionLabel(30.4,[]).toUpperCase()+' 30%',noiseText:'SELF NOISE 69 dB',clearanceText:'KEEL CLEARANCE 214 m'});
 assert.equal(footerReading({...s,difficulty:{}},0).show,false);
});

test('resource gauges show a damaged store’s remaining capacity',async()=>{
 const {resourceReading}=await import('../src/panel-readings.js');
 const s={battery:91.6,oxygen:19.5,fuel:0,systems:{batteryBank:100,fuelTank:100}};
 assert.deepEqual(resourceReading(s).gauges,[{key:'battery',level:91.6,text:'92%'},{key:'oxygen',level:19.5,text:'20%'},{key:'fuel',level:0,text:'0%'}]);
 s.systems={batteryBank:79.8,fuelTank:99.99};
 assert.deepEqual(resourceReading(s).gauges.map(g=>g.text),['92 / 79%','20%','0 / 99%']);
});

test('the torpedo reading describes tubes, run, target and running torpedoes',async()=>{
 const {torpedoReading}=await import('../src/panel-readings.js');
 const {torpedoTubes}=await import('../src/torpedo-tubes.js');
 const s=createGame('recon',7);
 let r=torpedoReading(s,undefined);
 const tubes=torpedoTubes(s);
 assert.deepEqual(r.tubes,[{key:'port',name:'Port',offline:false,remaining:tubes.port},{key:'starboard',name:'Starboard',offline:false,remaining:tubes.starboard}]);
 assert.deepEqual([r.torps,r.runText,r.target,r.running],[s.torps+' ABOARD',(s.runSetting/1000).toFixed(2)+' km',null,'']);
 s.systems.tubes=0;assert.equal(torpedoReading(s,undefined).tubes[0].offline,true);
 const target={id:'A1',bearing:47.6,side:'hostile',identified:1,military:0};
 r=torpedoReading(s,target);
 assert.deepEqual(r.target,{side:'hostile',probableSide:'',identified:true,military:false,bearing:'048'});
 s.projectiles=[{owner:'player',age:2,heading:10},{owner:'enemy',age:9,heading:0},{owner:'player',age:6,lock:'A1',heading:359.6},{owner:'player',age:6,heading:90},{owner:'player',age:4,heading:180}];
 assert.equal(torpedoReading(s,undefined).running,'TORP 1 · ARMING · 010° / TORP 2 · SONAR TRACK · 000° / TORP 3 · SEARCHING · 090° / TORP 4 · SEARCHING · 180°','a torpedo is armed from four seconds');
});
