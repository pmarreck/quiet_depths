import {propulsion,throttlePercent,batteryOutput} from './power-plant.js';
import {addDebrief} from './debrief.js';
import {replayEvent} from './instant-replay.js';
import {carrierSize} from './carrier.js';
import {SYSTEM_NAMES,SYSTEM_KEYS,hitSystem,hitSection,DRONE_PARTS,DRONE_HIT_FACTORS,fullCondition,damagePart,repairPart,operatingFraction} from './equipment.js';
import {updatePressure} from './pressure.js';
import {keelLimit,pushOffShoal} from './hull-contacts.js';
import {clamp,rad,bearing,delta,distance,separation,rand,log,bottom,capsuleContact,propellerState} from './mechanics.js';
import {propagationTime,emitSound} from './acoustics.js';
import {boatPoint,boatLocal,recoveryDock,droneReturnSpeed} from './vehicle-status.js';
export const DRONE_LIMITS=Object.freeze({deploySpeed:3,depth:280,range:100,speed:10,returnSpeed:10});
export {SYSTEM_NAMES} from './equipment.js';
export const freshSystems=()=>fullCondition(SYSTEM_KEYS);
export const freshMotion=()=>({plantVersion:1,fuelLeak:0,fuelFire:0,cookoff:false,outerHull:100,pressureAlarm:0,criticalExposure:0,imploded:false,collisionHits:{},verticalSpeed:0,ballast:0,planes:0,rudder:0,pitch:0,propAngle:0,water:0,collisionCooldown:0,floodAlarm:false});
export const freshDrone=()=>({mode:'stowed',x:0,y:0,depth:25,heading:0,battery:100,hull:100,mobility:100,buoyancy:100,camera:100,verticalSpeed:0,speed:0,targetSpeed:0,targetDepth:25,targetHeading:0,collisionCooldown:0,lowAlarm:false,rangeAlarm:false,lostReason:'',returnStage:0,returnClearance:8,returnHoldSide:18,returnHoldForward:0});
export function droneDeployReason(s){
 if(s.difficulty?.drone===false)return 'The ROV is disabled for this patrol.';
 const d=s.drone;if(d.mode==='lost')return d.lostReason||'Drone lost for this patrol.';
 if(d.mode!=='stowed')return 'Drone is already outside.';
 if(Math.abs(s.speed)>DRONE_LIMITS.deploySpeed)return 'Slow to 3 knots or less before launching.';
 if(s.depth>DRONE_LIMITS.depth)return 'Rise to 280 meters or less.';
 if(d.battery<15)return 'Drone needs at least 15% charge.';
 if(d.hull<20||d.mobility<20)return 'Drone requires onboard repairs.';
 return '';
}
export function deployDrone(s){
 if(s.status!=='patrol'||droneDeployReason(s))return false;
 const a=rad(s.heading),x=s.x+Math.cos(a)*18,y=s.y-Math.sin(a)*18,depth=Math.min(DRONE_LIMITS.depth,s.depth+3),heading=bearing({x,y},s);
 Object.assign(s.drone,{mode:'remote',x,y,depth,targetDepth:depth,heading,targetHeading:heading,speed:0,targetSpeed:0,verticalSpeed:0,collisionCooldown:0});
 log(s,'Inspection drone deployed. Stay within 100 m; slow the sub for recovery.');return true;
}
export function recallDrone(s){if(s.drone.mode==='remote'){
 const d=s.drone,p=boatLocal(s,d),below=s.depth+8<Math.min(279,bottom(s.x,s.y)-1);
 Object.assign(d,{mode:'return',returnStage:p.side>=9&&Math.abs(p.forward)<24?3:0,returnClearance:below?8:s.depth>10?-8:8,returnHoldSide:p.side,returnHoldForward:p.forward});
 log(s,'Drone returning by the clearance lane to the starboard recovery hatch.');
}}

function returnOrder(s,dt){
 const d=s.drone,local=boatLocal(s,d),clear=d.returnClearance??8;
 if(d.returnStage===0&&Math.abs(local.down-clear)<.7)d.returnStage=1;
 if(d.returnStage===1&&Math.hypot(local.side-14,local.forward)<3&&Math.abs(local.down-clear)<1)d.returnStage=2;
 if(d.returnStage===2&&Math.hypot(local.side-14,local.forward)<3&&Math.abs(local.down-2.5)<.7)d.returnStage=3;
 const goal=d.returnStage===0?boatPoint(s,{side:d.returnHoldSide,forward:d.returnHoldForward,down:clear}):d.returnStage===1?boatPoint(s,{side:14,down:clear}):d.returnStage===2?boatPoint(s,{side:14,down:2.5}):recoveryDock(s);
 d.targetDepth=clamp(goal.depth,0,280);
 const a=rad(s.heading),turnRate=1.7*(.25+.75*Math.min(1,Math.abs(s.speed)/4))*operatingFraction(s.systems.rudder),omega=rad(clamp(delta(s.targetHeading,s.heading)/Math.max(dt,.001),-turnRate,turnRate));
 const vx=Math.sin(a)*s.speed*.514444+omega*(goal.y-s.y),vy=Math.cos(a)*s.speed*.514444-omega*(goal.x-s.x),dx=goal.x-d.x,dy=goal.y-d.y;
 const currentX=Math.sin(rad(d.heading))*d.speed*.514444,currentY=Math.cos(rad(d.heading))*d.speed*.514444;
 const requestX=vx+dx*.35-(currentX-vx)*.6,requestY=vy+dy*.35-(currentY-vy)*.6;
 const magnitude=Math.hypot(requestX,requestY);
 if(magnitude>.02)d.targetHeading=(Math.atan2(requestX,requestY)*180/Math.PI+360)%360;
 const alignment=Math.max(0,Math.cos(rad(delta(d.targetHeading,d.heading))));
 d.targetSpeed=Math.min(droneReturnSpeed(d),magnitude/.514444)*alignment*alignment;
}
export function loseDrone(s,reason){if(s.drone.mode==='lost')return;s.drone.mode='lost';s.drone.speed=s.drone.targetSpeed=0;s.drone.lostReason=reason;log(s,'DRONE LOST. '+reason,'damage');}
export function damageSystem(s,key,amount){
 const old=s.systems[key];damagePart(s.systems,s.repairLimits,key,amount);
 const health=s.systems[key];
 if(key==='fuelTank'&&health<old){
  s.fuel=Math.min(s.fuel,health);
  if(s.fuel>0){s.fuelLeak=Math.min(1,s.fuelLeak+(old-health)/100);log(s,'Fuel tank leaking. Assign damage control.','damage');}
 }
 if(key==='batteryBank')s.battery=Math.min(s.battery,health);
 if(key==='periscope'&&!operatingFraction(health))s.scope=false;
 if(old>0&&health===0)log(s,SYSTEM_NAMES[key]+' destroyed. Beyond onboard repair.','damage');
 else if(old>=20&&health<20&&key!=='crew')log(s,SYSTEM_NAMES[key]+' offline.','damage');
 else if(old>=60&&health<60)log(s,SYSTEM_NAMES[key]+' damaged. Performance reduced.','damage');
}
export function hurt(s,amount,text,subsystem=null,point=null){
 if(amount<=0||s.status!=='patrol')return;
 amount*=2**-(s.difficulty?.damage??0);
 s.outerHull=clamp(s.outerHull-amount*.85,0,100);
 damagePart(s,s.repairLimits,'hull',amount);s.flood=clamp(s.flood+amount*.11,0,25);s.shock=2;log(s,text,'damage');
 const section=point?hitSection(s,point):null;
 if(amount>=2||subsystem){
  const key=subsystem||hitSystem(section,rand(s));
  damageSystem(s,key,amount*(1.2+rand(s)));
  if(section)log(s,section.toUpperCase()+' hit · '+SYSTEM_NAMES[key]+' '+Math.ceil(s.systems[key])+'%.','damage');
 }
 if(section==='bow'&&amount>24&&s.torps>0&&rand(s)<.025){
  s.torps--;s.cookoff=true;s.status='lost';damagePart(s,s.repairLimits,'hull',100);
  const message='Torpedo-room cook-off. The submarine is lost.';
  onboardExplosion(s,'cookoff',point);log(s,message,'damage');addDebrief(s,message);return;
 }
 if(s.hull<=0){s.status='lost';log(s,'Pressure hull lost. All stations, abandon ship.','damage');}
}
function onboardExplosion(s,kind,point){
 s.shock=2;s.impacts.push({id:s.weaponSequence++,x:point.x,y:point.y,altitude:-point.depth,time:s.time,kind});
 emitSound(s,{type:'detonation',x:point.x,y:point.y,depth:point.depth,power:kind==='cookoff'?2:.8});
}
function fuelEmergency(s,dt,crew){
 const working=s.repair>0?crew:0;
 if(s.fuelLeak>0){
  s.fuel=Math.max(0,s.fuel-s.fuelLeak*.12*dt);
  s.fuelLeak=Math.max(0,s.fuelLeak-working*.018*dt);
  if(s.fuelLeak===0)log(s,'Crew sealed the fuel leak.','success');
  if(s.fuel>0&&!s.fuelFire&&s.fuelLeak&&rand(s)<-Math.expm1(-dt*s.fuelLeak*.012)){
   s.fuelFire=24;log(s,'Fuel fire! Damage control requested.','damage');addDebrief(s,'Leaking fuel caught fire.');
  }
 }
 if(s.fuelFire>0){
  s.fuel=Math.max(0,s.fuel-dt*.07);s.hull=Math.max(0,s.hull-dt*.09);
  if(s.fuel>0&&rand(s)<-Math.expm1(-dt*.0015)){
   const message='Fuel vapor explosion in the machinery space.';
   onboardExplosion(s,'vapor',s);replayEvent(s,{kind:'blast',point:{x:s.x,y:s.y,depth:s.depth}});
   hurt(s,9,message,'diesel');addDebrief(s,message);s.fuelFire=0;
  }else{
   s.fuelFire=Math.max(0,s.fuelFire-dt*(.5+working*3));
   if(!s.fuelFire)log(s,'Fuel fire out.','success');
  }
 }
}
export function damageDrone(s,amount,reason){
 const d=s.drone;if(!['remote','return'].includes(d.mode)||amount<=0)return;
 amount*=2**-(s.difficulty?.damage??0);
 for(const part of DRONE_PARTS)damagePart(d,d.repairLimits,part,amount*DRONE_HIT_FACTORS[part]);
 log(s,'Drone impact: '+reason+' Integrity '+Math.ceil(d.hull)+'%.','damage');
 if(d.hull<=0)loseDrone(s,'Drone destroyed.');
}
export function updateBoat(s,dt){
 if(s.water>=70||s.hull<=0){s.status='lost';log(s,s.water>=70?'Flooding overwhelmed the sub. Buoyancy lost.':'Pressure hull lost.','damage');return false;}
 const {generator,drive,ahead,astern}=propulsion(s),diesel=generator>0;
 const lever=throttlePercent(s.targetSpeed)/100;
 const order=clamp(lever*(lever<0?astern:ahead),s.silent?-3:-4,s.silent?3:ahead);
 const accelerating=Math.sign(order)===Math.sign(order-s.speed);
 const change=dt*.35*(accelerating&&order!==0?drive:1);
 s.speed+=clamp(order-s.speed,-change,change);
 const turn=delta(s.targetHeading,s.heading),flow=Math.tanh(s.speed/5);
 // An ordered course is absolute. The helmsman reverses the blade angle astern.
 // At rest the steering gear can still swing the rudder for the next movement.
 const steering=operatingFraction(s.systems.rudder);
 const helm=steering*clamp(turn/8,-1,1)*Math.sign(s.speed||s.targetSpeed||1);
 s.rudder+=clamp(helm-s.rudder,-dt*1.8,dt*1.8);
 const yaw=steering?3*flow*s.rudder*dt:0;
 s.heading=(s.heading+(Math.sign(yaw)===Math.sign(turn)&&Math.abs(yaw)>Math.abs(turn)?turn:yaw)+360)%360;
 const error=s.targetDepth-s.depth,v=s.verticalSpeed,throughWater=s.speed*.514444;
 // A surface order retains positive buoyancy through the last few meters.
 const demand=s.targetDepth===0&&s.depth>0?Math.min(-4,error):error;
 const ballastAuthority=operatingFraction(s.systems.ballast);
 const ballastOrder=ballastAuthority*clamp(demand*.16-v*.8,-1,1);
 s.ballast+=clamp(ballastOrder-s.ballast,-dt*.24,dt*.24);
 const planeAuthority=operatingFraction(s.systems.planes);
 const planesOrder=planeAuthority*clamp(error*.09-v*.65,-.55,.55)*Math.sign(s.speed);
 s.planes+=clamp(planesOrder-s.planes,-dt*.5,dt*.5);
 const authority=planeAuthority?flow*flow:0;
 const requestedPitch=-s.planes*authority*.54;
 s.pitch+=clamp(requestedPitch-s.pitch,-dt*.065,dt*.065);
 const buoyancy=(ballastAuthority?s.ballast*.72:0)+s.water*.008;
 const verticalFromPitch=-throughWater*Math.sin(s.pitch);
 s.verticalSpeed=clamp(v+(buoyancy+(verticalFromPitch-v)*.8)*dt,-2.8,3.2);
 s.depth=clamp(s.depth+s.verticalSpeed*dt,0,330);
 if(s.depth===0&&s.verticalSpeed<0)s.verticalSpeed=0;
 const horizontal=throughWater*Math.cos(s.pitch);
 s.x+=Math.sin(rad(s.heading))*horizontal*dt;s.y+=Math.cos(rad(s.heading))*horizontal*dt;
 const prop=propellerState(s.speed,s.depth,s.systems.propeller);s.propAngle=(s.propAngle+prop.rpm*Math.PI/30*dt)%(2*Math.PI);s.cavitation=prop.cavitation;s.propRpm=prop.rpm;
 s.noise=clamp(Math.max((diesel?65:8)+s.speed*s.speed*.39+(s.flood>0?12:0)+s.cavitation*23-(s.silent?7:0),s.time<(s.gunLoudUntil||0)?80:0),2,100);
 if(diesel){s.fuel=clamp(s.fuel-dt*.015,0,s.systems.fuelTank);s.battery=clamp(s.battery+dt*.12*generator*operatingFraction(s.systems.batteryBank),0,s.systems.batteryBank);s.oxygen=clamp(s.oxygen+dt*.35,0,100);}
 else{s.fuel=Math.min(s.fuel,s.systems.fuelTank);s.battery=clamp(s.battery-dt*(.009+s.speed*s.speed*.0007),0,s.systems.batteryBank);s.oxygen=clamp(s.oxygen-dt*(.024+(1-operatingFraction(s.systems.oxygen))*.1),0,100);}
 if(s.depth<2)s.oxygen=clamp(s.oxygen+dt*.45,0,100);
 if(s.depth>15||!operatingFraction(s.systems.periscope))s.scope=false;
 const floor=keelLimit(s);
 if(s.depth>floor){s.depth=Math.max(0,floor);if(floor<0)pushOffShoal(s,-floor);if(s.time-(s.collisionHits.ground??-99)>4){replayEvent(s,{kind:'ground',point:{x:s.x,y:s.y,depth:s.depth}});hurt(s,2+Math.abs(s.speed)+Math.abs(s.verticalSpeed)*2,'Seafloor contact. Rise now.','planes');s.collisionHits.ground=s.time;}s.verticalSpeed=Math.min(0,s.verticalSpeed);s.speed*=Math.exp(-dt*1.5);}
 updatePressure(s,dt);if(s.status==='lost')return diesel;
 if(s.oxygen<=0){s.hull=Math.max(0,s.hull-dt*2);log(s,'Air exhausted. Surface immediately.','damage');}
 const crew=s.systems.crew/100;
 if(crew===0||(!diesel&&!batteryOutput(s)))s.repair=0;
 fuelEmergency(s,dt,crew);
 const working=s.repair>0;
 const pump=(working?5:1.2)*crew,rate=s.flood-pump;
 s.water=clamp(s.water+rate*dt/60,0,100);
 if(s.water>4&&rate>0&&!s.floodAlarm){s.floodAlarm=true;log(s,'FLOODING ALARM. Inflow exceeds pumps. Assign damage control.','damage');}
 if(rate<=0)s.floodAlarm=false;
 if(working){s.repair=Math.max(0,s.repair-dt);s.flood=Math.max(0,s.flood-dt*.045*crew);s.hull=repairPart(s.hull,s.repairLimits.hull,dt*.06*crew);if(!diesel)s.battery=Math.max(0,s.battery-dt*.016);for(const key of SYSTEM_KEYS)s.systems[key]=repairPart(s.systems[key],s.repairLimits[key],dt*.11*crew);}
 if(s.water>12)s.hull=Math.max(0,s.hull-dt*(s.water-12)*.012);
 if(s.water>=70||s.hull<=0){s.status='lost';log(s,s.water>=70?'Flooding overwhelmed the sub. Buoyancy lost.':'Pressure hull lost.','damage');}
 s.collisionCooldown=Math.max(0,s.collisionCooldown-dt);
 return diesel;
}
export function updateDrone(s,dt,diesel){
 const d=s.drone;d.collisionCooldown=Math.max(0,d.collisionCooldown-dt);
 if(d.mode==='stowed'){
  Object.assign(d,{x:s.x,y:s.y,depth:s.depth,heading:s.heading,speed:0,targetSpeed:0,targetHeading:s.heading,targetDepth:s.depth});
  if(diesel||s.battery>1&&batteryOutput(s)){const charge=Math.min(100-d.battery,dt*.32);d.battery+=charge;if(!diesel)s.battery=Math.max(0,s.battery-charge*.08);
   const repair=dt*.2*s.systems.crew/100;for(const k of DRONE_PARTS)d[k]=repairPart(d[k],d.repairLimits[k],repair);}
  if(d.battery>12)d.lowAlarm=false;return;
 }
 if(d.mode==='lost')return;
 if(separation(d,s)>DRONE_LIMITS.range){loseDrone(s,'Control link exceeded 100 m.');return;}
 if(separation(d,s)>=70&&!d.rangeAlarm){d.rangeAlarm=true;log(s,'Drone link at 70 m. Slow the sub and bring the drone home.','warning');}
 if(separation(d,s)<60)d.rangeAlarm=false;
 const batteryBefore=d.battery;d.battery=Math.max(0,d.battery-dt*(.045+d.speed*d.speed*.0013+(100-d.hull)*.0003));
 if(batteryBefore>10&&d.battery<=10&&!d.lowAlarm){d.lowAlarm=true;log(s,'DRONE BATTERY 10%. Return immediately.','damage');}
 if(d.battery<=0){loseDrone(s,'Battery exhausted.');return;}
 const dock=recoveryDock(s);
 if(d.mode==='return')returnOrder(s,dt);
 const mobility=operatingFraction(d.mobility),max=droneReturnSpeed(d);
 const order=clamp(d.targetSpeed,-3*mobility,max),change=dt*(order!==0&&Math.sign(order)===Math.sign(order-d.speed)?mobility:1);
 d.speed+=clamp(order-d.speed,-change,change);
 d.heading=(d.heading+clamp(delta(d.targetHeading,d.heading),-dt*12*mobility,dt*12*mobility)+360)%360;
 const desired=clamp((d.targetDepth-d.depth)*.8,-1,1)*operatingFraction(d.buoyancy)+(100-d.buoyancy)*.003;
 d.verticalSpeed+=clamp(desired-d.verticalSpeed,-dt*.6,dt*.6);d.depth=clamp(d.depth+d.verticalSpeed*dt,0,280);
 d.x+=Math.sin(rad(d.heading))*d.speed*.514444*dt;d.y+=Math.cos(rad(d.heading))*d.speed*.514444*dt;
 const objects=[{body:s,half:27.5,radius:5,own:true},...s.ships.filter(v=>v.hull>0).map(v=>({body:{...v,depth:v.depth||3},half:v.kind==='carrier'?carrierSize.halfLength-carrierSize.halfBeam:v.kind==='sub'?27.5:v.kind==='fishing'?19:45,radius:v.kind==='carrier'?carrierSize.halfBeam:v.kind==='sub'?5:v.kind==='fishing'?5:9}))];
 if(s.site)objects.push({body:s.site,half:s.site.kind==='surface'?19:27.5,radius:5});
 for(const object of objects){const hit=capsuleContact(d,object.body,object.half,object.radius);if(!hit)continue;
  d.x+=hit.nx*(hit.penetration+.001);d.y+=hit.ny*(hit.penetration+.001);d.depth=clamp(d.depth+hit.nd*(hit.penetration+.001),0,280);
  const closing=-(Math.sin(rad(d.heading))*d.speed*.514444-Math.sin(rad(object.body.heading))*(object.body.speed||0)*.514444)*hit.nx-(Math.cos(rad(d.heading))*d.speed*.514444-Math.cos(rad(object.body.heading))*(object.body.speed||0)*.514444)*hit.ny-d.verticalSpeed*hit.nd;
  if(closing>.3&&d.collisionCooldown<=0){const damage=clamp(3+closing*closing*1.4,3,60);damageDrone(s,damage,object.own?'pressure hull':'vessel / wreck');if(object.own){replayEvent(s,{kind:'collision',point:{x:d.x,y:d.y,depth:d.depth}});hurt(s,damage*.07,'Drone struck our hull. Minor plating damage.');}d.collisionCooldown=2;}
  d.speed*=.15;d.verticalSpeed*=.2;
 }
 const floor=bottom(d.x,d.y)-.7;if(d.depth>floor){d.depth=Math.max(0,floor);if(d.collisionCooldown<=0){damageDrone(s,3+Math.abs(d.speed)*1.5,'seabed');d.collisionCooldown=2;}d.verticalSpeed=0;d.speed*=.7;}
 // Pressure-front receipt is independent of when the sub hears the same blast.
 for(const sound of s.acoustics)if(sound.type==='blast'&&!sound.droneHit&&s.time-sound.time>=propagationTime(sound,d)){sound.droneHit=true;const r=separation(d,{...sound,depth:sound.depth||0});if(r<140)damageDrone(s,85*(1-r/140),'depth charge pressure wave');}
 if(d.mode==='lost')return;
 if(d.mode==='return'&&d.returnStage===3&&separation(d,dock)<1.2&&Math.abs(s.speed)<=3){d.mode='stowed';d.speed=d.targetSpeed=0;log(s,'Drone recovered. Charging and repairs underway.','success');}
 if(separation(d,s)>100)loseDrone(s,'Control link exceeded 100 m.');
}
