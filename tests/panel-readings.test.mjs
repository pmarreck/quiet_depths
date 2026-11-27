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
