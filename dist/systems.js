import {clamp,rad,bearing,delta,distance,separation,rand,log,bottom,capsuleContact,propellerState} from './mechanics.js';
import {propagationTime,emitSound} from './acoustics.js';
import {boatPoint,boatLocal,recoveryDock,droneReturnSpeed} from './vehicle-status.js';
export const DRONE_LIMITS=Object.freeze({deploySpeed:3,depth:280,range:100,speed:10,returnSpeed:10});
export const SYSTEM_NAMES=Object.freeze({engine:'ENGINE',propeller:'PROPELLER',oxygen:'AIR / SCRUBBERS',ballast:'BALLAST',planes:'DIVE PLANES',rudder:'RUDDER',sonar:'SONAR',periscope:'PERISCOPE',deckgun:'DECK GUN',crew:'REPAIR CREW'});
export const freshSystems=()=>Object.fromEntries(Object.keys(SYSTEM_NAMES).map(k=>[k,100]));
export const freshMotion=()=>({verticalSpeed:0,ballast:0,planes:0,rudder:0,pitch:0,propAngle:0,water:0,collisionCooldown:0,floodAlarm:false});
export const freshDrone=()=>({mode:'stowed',x:0,y:0,depth:25,heading:0,battery:100,hull:100,mobility:100,buoyancy:100,camera:100,verticalSpeed:0,speed:0,targetSpeed:0,targetDepth:25,targetHeading:0,collisionCooldown:0,lowAlarm:false,rangeAlarm:false,lostReason:'',returnStage:0,returnClearance:8,returnHoldSide:18,returnHoldForward:0});
export function droneDeployReason(s){
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
 log(s,'Inspection drone deployed. Stay within 100 m; slow the boat for recovery.');return true;
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
 const a=rad(s.heading),turnRate=1.7*(.25+.75*Math.min(1,Math.abs(s.speed)/4))*s.systems.rudder/100,omega=rad(clamp(delta(s.targetHeading,s.heading)/Math.max(dt,.001),-turnRate,turnRate));
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
 const old=s.systems[key];s.systems[key]=clamp(old-amount,0,100);
 if(key==='periscope'&&s.systems[key]<25){s.systems[key]=0;s.scope=false;if(old>0)log(s,'Periscope sheared away. Surface to use the conning tower.','damage');}
 else if(old>=60&&s.systems[key]<60)log(s,SYSTEM_NAMES[key]+' damaged. Performance reduced.','damage');
}
export function hurt(s,amount,text,subsystem=null){
 if(amount<=0||s.status!=='patrol')return;
 s.hull=clamp(s.hull-amount,0,100);s.flood=clamp(s.flood+amount*.11,0,25);s.shock=2;log(s,text,'damage');
 const keys=['engine','propeller','oxygen','ballast','planes','rudder','sonar','deckgun','crew'];
 if(amount>=2||subsystem)damageSystem(s,subsystem||keys[Math.floor(rand(s)*keys.length)],amount*(1.2+rand(s)));
 if(amount>24&&s.torps>0&&rand(s)<.035){s.torps--;s.hull=Math.max(0,s.hull-32);s.flood+=4;emitSound(s,{type:'detonation',x:s.x,y:s.y,depth:s.depth,power:1.5});log(s,'Torpedo room fire. A stored warhead detonated.','damage');}
 if(s.hull<=0){s.status='lost';log(s,'Pressure hull lost. All stations, abandon ship.','damage');}
}
export function damageDrone(s,amount,reason){
 const d=s.drone;if(!['remote','return'].includes(d.mode)||amount<=0)return;
 d.hull=clamp(d.hull-amount,0,100);d.mobility=clamp(d.mobility-amount*.8,0,100);d.buoyancy=clamp(d.buoyancy-amount*.7,0,100);d.camera=clamp(d.camera-amount*.95,0,100);
 log(s,'Drone impact: '+reason+' Integrity '+Math.ceil(d.hull)+'%.','damage');
 if(d.hull<=0)loseDrone(s,'Drone destroyed.');
}
export function updateBoat(s,dt){
 if(s.water>=70||s.hull<=0){s.status='lost';log(s,s.water>=70?'Flooding overwhelmed the boat. Buoyancy lost.':'Pressure hull lost.','damage');return false;}
 const diesel=s.engine==='diesel'&&s.depth<=14&&s.fuel>0,available=diesel||s.engine==='electric'&&s.battery>0;
 const max=available?Math.min(s.silent?3:diesel?17:14,17*s.systems.engine/100,17*s.systems.propeller/100):0;
 s.speed+=clamp(clamp(s.targetSpeed,-Math.min(4,max),max)-s.speed,-dt*.35,dt*.35);
 const turn=delta(s.targetHeading,s.heading);s.rudder+=clamp(clamp(turn/25,-1,1)-s.rudder,-dt*1.8,dt*1.8);
 const turnRate=1.7*(.25+.75*Math.min(1,Math.abs(s.speed)/4))*s.systems.rudder/100;
 s.heading=(s.heading+clamp(turn,-dt*turnRate,dt*turnRate)+360)%360;
 const error=s.targetDepth-s.depth,v=s.verticalSpeed;
 const ballastOrder=clamp(error*.06-v*.9,-1,1),planesOrder=clamp(error*.07-v*1.8,-.45,.45)*Math.sign(s.speed);
 s.ballast+=clamp(ballastOrder-s.ballast,-dt*.16,dt*.16);
 s.planes+=clamp(planesOrder-s.planes,-dt*.5,dt*.5);
 const acceleration=.6*s.ballast*s.systems.ballast/100+s.planes*(s.speed*.514444)**2*.035*Math.sign(s.speed)*s.systems.planes/100+s.water*.008-v*.85;
 s.verticalSpeed=clamp(v+acceleration*dt,-1.15,2.5);s.depth=clamp(s.depth+s.verticalSpeed*dt,0,330);
 if(s.depth===0&&s.verticalSpeed<0)s.verticalSpeed=0;
 s.pitch+=clamp(clamp(-s.verticalSpeed*.09,-.12,.12)-s.pitch,-dt*.05,dt*.05);
 s.x+=Math.sin(rad(s.heading))*s.speed*.514444*dt;s.y+=Math.cos(rad(s.heading))*s.speed*.514444*dt;
 const prop=propellerState(s.speed,s.depth,s.systems.propeller);s.propAngle=(s.propAngle+prop.rpm*Math.PI/30*dt)%(2*Math.PI);s.cavitation=prop.cavitation;s.propRpm=prop.rpm;
 s.noise=clamp(Math.max((diesel?65:8)+s.speed*s.speed*.39+(s.flood>0?12:0)+s.cavitation*23-(s.silent?7:0),s.time<(s.gunLoudUntil||0)?80:0),2,100);
 if(diesel){s.fuel=clamp(s.fuel-dt*.015,0,100);s.battery=clamp(s.battery+dt*.12,0,100);s.oxygen=clamp(s.oxygen+dt*.35,0,100);}
 else{s.battery=clamp(s.battery-dt*(.009+s.speed*s.speed*.0007),0,100);s.oxygen=clamp(s.oxygen-dt*(.024+(100-s.systems.oxygen)*.001),0,100);}
 if(s.depth<2)s.oxygen=clamp(s.oxygen+dt*.45,0,100);
 if(s.depth>15||s.systems.periscope===0)s.scope=false;
 const floor=bottom(s.x,s.y)-5-27.5*Math.abs(Math.sin(s.pitch));
 if(s.depth>floor){s.depth=Math.max(0,floor);s.verticalSpeed=Math.min(0,s.verticalSpeed);hurt(s,dt*(1.5+Math.abs(s.speed)),'Seafloor contact. Rise now.','planes');s.speed*=Math.exp(-dt*1.5);}
 if(s.depth>220)hurt(s,dt*(s.depth-220)*.002,'Hull strain. Below test depth.');
 if(s.oxygen<=0)hurt(s,dt*2,'Air exhausted. Surface immediately.','crew');
 const working=s.repair>0&&s.battery>0,crew=.15+.85*s.systems.crew/100;
 const pump=(working?5:1.2)*crew,rate=s.flood-pump;
 s.water=clamp(s.water+rate*dt/60,0,100);
 if(s.water>4&&rate>0&&!s.floodAlarm){s.floodAlarm=true;log(s,'FLOODING ALARM. Inflow exceeds pumps. Assign damage control.','damage');}
 if(rate<=0)s.floodAlarm=false;
 if(working){s.repair=Math.max(0,s.repair-dt);s.flood=Math.max(0,s.flood-dt*.045*crew);s.hull=Math.min(100,s.hull+dt*.06*crew);s.battery=Math.max(0,s.battery-dt*.016);for(const key of Object.keys(SYSTEM_NAMES))if(key!=='periscope')s.systems[key]=Math.min(100,s.systems[key]+dt*.11*crew);}
 if(s.water>12)s.hull=Math.max(0,s.hull-dt*(s.water-12)*.012);
 if(s.water>=70||s.hull<=0){s.status='lost';log(s,s.water>=70?'Flooding overwhelmed the boat. Buoyancy lost.':'Pressure hull lost.','damage');}
 s.collisionCooldown=Math.max(0,s.collisionCooldown-dt);
 return diesel;
}
export function shipCollision(s,ship){
 if(ship.kind==='sub'||ship.hull<=0)return;
 const body={...ship,depth:3},hit=capsuleContact(s,body,ship.kind==='fishing'?19:45,ship.kind==='fishing'?5:9,5);
 if(s.scope&&s.depth<=15&&distance(s,ship)<48&&s.systems.periscope>0)damageSystem(s,'periscope',100);
 if(!hit)return;
 s.x+=hit.nx*hit.penetration;s.y+=hit.ny*hit.penetration;s.depth=Math.max(0,s.depth+hit.nd*hit.penetration);
 if(s.collisionCooldown<=0){s.collisionCooldown=10;hurt(s,18+Math.abs(s.speed-ship.speed)*1.1,'Hull collision. Heavy structural damage.','rudder');damageSystem(s,'periscope',100);s.speed*=.3;}
}
export function siteCollision(s){
 if(!s.site)return;const hit=capsuleContact(s,s.site,s.site.kind==='surface'?19:27.5,5,5);
 if(!hit)return;s.x+=hit.nx*(hit.penetration+.001);s.y+=hit.ny*(hit.penetration+.001);s.depth=Math.max(0,s.depth+hit.nd*(hit.penetration+.001));
 if(s.collisionCooldown<=0){s.collisionCooldown=5;hurt(s,5+Math.abs(s.speed)*2,'Collision with the casualty. Back away carefully.','planes');}s.speed*=.3;s.verticalSpeed*=.2;
}
export function updateDrone(s,dt,diesel){
 const d=s.drone;d.collisionCooldown=Math.max(0,d.collisionCooldown-dt);
 if(d.mode==='stowed'){
  Object.assign(d,{x:s.x,y:s.y,depth:s.depth,heading:s.heading,speed:0,targetSpeed:0,targetHeading:s.heading,targetDepth:s.depth});
  if(diesel||s.battery>1){const charge=Math.min(100-d.battery,dt*.32);d.battery+=charge;if(!diesel)s.battery=Math.max(0,s.battery-charge*.08);
   const repair=dt*.2*(.2+.8*s.systems.crew/100);for(const k of ['hull','mobility','buoyancy','camera'])d[k]=Math.min(100,d[k]+repair);}
  if(d.battery>12)d.lowAlarm=false;return;
 }
 if(d.mode==='lost')return;
 if(separation(d,s)>DRONE_LIMITS.range){loseDrone(s,'Control link exceeded 100 m.');return;}
 if(separation(d,s)>=70&&!d.rangeAlarm){d.rangeAlarm=true;log(s,'Drone link at 70 m. Slow the boat and bring the drone home.','warning');}
 if(separation(d,s)<60)d.rangeAlarm=false;
 const batteryBefore=d.battery;d.battery=Math.max(0,d.battery-dt*(.045+d.speed*d.speed*.0013+(100-d.hull)*.0003));
 if(batteryBefore>10&&d.battery<=10&&!d.lowAlarm){d.lowAlarm=true;log(s,'DRONE BATTERY 10%. Return immediately.','damage');}
 if(d.battery<=0){loseDrone(s,'Battery exhausted.');return;}
 const dock=recoveryDock(s);
 if(d.mode==='return')returnOrder(s,dt);
 const max=droneReturnSpeed(d);d.speed+=clamp(clamp(d.targetSpeed,-3,max)-d.speed,-dt,dt);
 d.heading=(d.heading+clamp(delta(d.targetHeading,d.heading),-dt*12*(.2+.8*d.mobility/100),dt*12*(.2+.8*d.mobility/100))+360)%360;
 const desired=clamp((d.targetDepth-d.depth)*.8,-1,1)*(d.buoyancy/100)+(100-d.buoyancy)*.003;
 d.verticalSpeed+=clamp(desired-d.verticalSpeed,-dt*.6,dt*.6);d.depth=clamp(d.depth+d.verticalSpeed*dt,0,280);
 d.x+=Math.sin(rad(d.heading))*d.speed*.514444*dt;d.y+=Math.cos(rad(d.heading))*d.speed*.514444*dt;
 const objects=[{body:s,half:27.5,radius:5,own:true},...s.ships.filter(v=>v.hull>0).map(v=>({body:{...v,depth:v.depth||3},half:v.kind==='sub'?27.5:v.kind==='fishing'?19:45,radius:v.kind==='sub'?5:v.kind==='fishing'?5:9}))];
 if(s.site)objects.push({body:s.site,half:s.site.kind==='surface'?19:27.5,radius:5});
 for(const object of objects){const hit=capsuleContact(d,object.body,object.half,object.radius);if(!hit)continue;
  d.x+=hit.nx*(hit.penetration+.001);d.y+=hit.ny*(hit.penetration+.001);d.depth=clamp(d.depth+hit.nd*(hit.penetration+.001),0,280);
  const closing=-(Math.sin(rad(d.heading))*d.speed*.514444-Math.sin(rad(object.body.heading))*(object.body.speed||0)*.514444)*hit.nx-(Math.cos(rad(d.heading))*d.speed*.514444-Math.cos(rad(object.body.heading))*(object.body.speed||0)*.514444)*hit.ny-d.verticalSpeed*hit.nd;
  if(closing>.3&&d.collisionCooldown<=0){const damage=clamp(3+closing*closing*1.4,3,60);damageDrone(s,damage,object.own?'pressure hull':'vessel / wreck');if(object.own)hurt(s,damage*.07,'Drone struck our hull. Minor plating damage.');d.collisionCooldown=2;}
  d.speed*=.15;d.verticalSpeed*=.2;
 }
 const floor=bottom(d.x,d.y)-.7;if(d.depth>floor){d.depth=Math.max(0,floor);if(d.collisionCooldown<=0){damageDrone(s,3+Math.abs(d.speed)*1.5,'seabed');d.collisionCooldown=2;}d.verticalSpeed=0;d.speed*=.7;}
 // Pressure-front receipt is independent of when the boat hears the same blast.
 for(const sound of s.acoustics)if(sound.type==='blast'&&!sound.droneHit&&s.time-sound.time>=propagationTime(sound,d)){sound.droneHit=true;const r=separation(d,{...sound,depth:sound.depth||0});if(r<140)damageDrone(s,85*(1-r/140),'depth charge pressure wave');}
 if(d.mode==='lost')return;
 if(d.mode==='return'&&d.returnStage===3&&separation(d,dock)<1.2&&Math.abs(s.speed)<=3){d.mode='stowed';d.speed=d.targetSpeed=0;log(s,'Drone recovered. Charging and repairs underway.','success');}
 if(separation(d,s)>100)loseDrone(s,'Control link exceeded 100 m.');
}
