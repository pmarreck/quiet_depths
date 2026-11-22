import {recordCivilianHit,report} from './patrol-reports.js';
import {floorSurface} from './seafloor.js';
// Fictional combat tuning. Positions are meters; gun aim is compass/elevation.
import {clamp,rad,bearing,delta,distance,log,rand,bottom} from './mechanics.js';
import {hash01,environmentAt,boatSurfacePose} from './environment.js';
import {emitSound} from './acoustics.js';
import {hurt} from './systems.js';
import {isSurfaced,boatPoint} from './vehicle-status.js';
import {estimateAt} from './track-estimates.js';
import {playerReport,projectedReport,scatterAim,searchDuration} from './hostile-tracks.js';
import {SUB_DESIGN as D} from './hull-design.js';
import {addDebrief} from './debrief.js';

export const MAX_RUN=4320;
export const freshCombat=()=>({runSetting:MAX_RUN,reports:[],gun:{ammo:240,cooldown:0,shots:0,angle:0,elevation:0},gunRounds:[],impacts:[],aircraft:[],airSupport:{status:'idle',requestedAt:null,launchAt:null,base:{x:-3200,y:3400},lastKnown:null},weaponSequence:1,gunLoudUntil:0});
const wrap=n=>(n%360+360)%360;
const TORPEDO_SPEED=24,TORPEDO_LIFE=180,ARMING_TIME=4,MAX_PITCH=Math.PI/4;
const SURFACE_RUN_DEPTH=3;
export const ENEMY_DECOY_SUPPLY=2;
export function chargeAltitude(charge){
 if(charge.exploded)return -charge.depth;
 const elapsed=clamp(charge.totalDelay-charge.delay,0,charge.totalDelay),air=charge.airTime||0;
 if(air&&elapsed<air)return (charge.airHeight||0)*(1-(elapsed/air)**2);
 return -charge.depth*clamp((elapsed-air)/Math.max(.001,charge.totalDelay-air),0,1)||0;
}
export function firingBearing(s,contact){const estimate=contact.fix?estimateAt(contact,s.time):null;return estimate?bearing(s,estimate):contact.bearing;}
function torpedoOrders(s,id,heading,depth){
 return {orderedHeading:heading,orderedDepth:depth,pitch:0,tubeSide:0,searchAge:0,
  searchDirection:hash01(s.patrol.seed,id+673)<.5?-1:1,decoysChecked:[],decoyTarget:null,diverted:false};
}
function putTorpedoInWater(s,owner,origin,heading,depth,launch){
 const id=s.weaponSequence++;
 const shot={id,owner,runLimit:owner==='player'?s.runSetting:MAX_RUN,traveled:0,...origin,age:0,intended:null,lock:null,pingAge:99,
  ...torpedoOrders(s,id,heading,depth),heading,...launch,path:[{...origin,time:s.time}]};
 s.projectiles.push(shot);
 return shot;
}
export function launchTorpedo(s,id){
 const c=s.contacts.find(v=>v.id===id);
 if(!c||c.identified&&!c.military||s.torps<=0||s.status!=='patrol'||s.depth>100)return false;
 const tubeSide=s.torps%2?1:-1;
 s.torps--;s.alert=clamp(s.alert+20,0,100);
 const origin=boatPoint(boatSurfacePose(s),{side:tubeSide*D.tubeSide,down:D.tubeDown,forward:D.tubeForward});
 const heading=firingBearing(s,c),depth=c.kind==='sub'?c.depthEstimate??s.depth:SURFACE_RUN_DEPTH;
 putTorpedoInWater(s,'player',origin,heading,depth,{intended:id,heading:s.heading,pitch:s.pitch,tubeSide});
 log(s,`Tube away. Bearing ${Math.round(heading)}. Seeker arms after its run-out.`,'warning');return true;
}
export function launchHostileTorpedo(s,ship,track){
 const range=distance(ship,track),tubeSide=ship.lastTubeSide===1?-1:1;
 const origin=boatPoint(ship,{side:tubeSide*D.tubeSide,down:D.tubeDown,forward:D.tubeForward});
 const aim=scatterAim(s,track,12+range*.04+track.age);
 const depth=clamp(track.depth+(rand(s)-.5)*(4+track.age*.25),SURFACE_RUN_DEPTH,220);
 putTorpedoInWater(s,'enemy',origin,bearing(origin,aim),depth,{heading:ship.heading,tubeSide,launcher:ship.id,aim});
 ship.lastTubeSide=tubeSide;
 log(s,'Incoming torpedo. Evade!','damage');
}
// Old saves kept only the blast point and countdown. Reconstruct the remaining
// approach along the bearing from the nearest submarine when one is available.
export function restoreIncomingRun(s,blast){
 const source=s.ships.filter(ship=>ship.kind==='sub').sort((a,b)=>distance(a,blast)-distance(b,blast))[0];
 const heading=source?bearing(source,blast):0,remaining=TORPEDO_SPEED*Math.max(0,blast.delay);
 const origin={x:blast.x-remaining*Math.sin(rad(heading)),y:blast.y-remaining*Math.cos(rad(heading)),depth:blast.depth};
 putTorpedoInWater(s,'enemy',origin,heading,blast.depth,{age:ARMING_TIME,launcher:source?.id??null,aim:{x:blast.x,y:blast.y}});
}
export function restoreTorpedo(s,p){
 if(!p||!['x','y','heading','age'].every(k=>Number.isFinite(p[k])))return false;
 if(p.id===undefined)p.id=s.weaponSequence++;
 const depth=p.depth??Math.min(s.depth,6);
 for(const [k,v] of Object.entries({runLimit:MAX_RUN,traveled:Math.min(MAX_RUN,p.age*TORPEDO_SPEED),owner:'player',intended:p.lock??null,lock:null,depth,pingAge:99,path:[{x:p.x,y:p.y,depth,time:s.time}],
  ...torpedoOrders(s,p.id,p.heading,depth)}))if(p[k]===undefined)p[k]=v;
 return Number.isFinite(p.runLimit)&&p.runLimit>=100&&p.runLimit<=MAX_RUN&&Number.isFinite(p.traveled)&&p.traveled>=0&&p.traveled<=p.runLimit&&['id','depth','pingAge','orderedHeading','orderedDepth','pitch','searchAge'].every(k=>Number.isFinite(p[k]))&&
  (p.owner==='player'||p.owner==='enemy'&&(p.launcher===null||typeof p.launcher==='string')&&
   (p.aim===null||p.aim&&Number.isFinite(p.aim.x)&&Number.isFinite(p.aim.y)))&&
  [-1,1].includes(p.searchDirection)&&[-1,0,1].includes(p.tubeSide)&&typeof p.diverted==='boolean'&&
  Array.isArray(p.decoysChecked)&&p.decoysChecked.every(id=>typeof id==='string')&&
  (p.decoyTarget===null||['x','y','depth','expiresAt'].every(k=>Number.isFinite(p.decoyTarget[k])))&&
  Array.isArray(p.path)&&p.path.every(v=>['x','y','depth','time'].every(k=>Number.isFinite(v[k])));
}
export function fireDeckGun(s,aim){
 if(s.status!=='patrol'||!isSurfaced(s)||s.gun.ammo<=0||s.gun.cooldown>0||(s.systems.deckgun??100)<=10||!Number.isFinite(aim.bearing)||!Number.isFinite(aim.elevation))return false;
 s.gun.ammo--;s.gun.shots++;s.gun.cooldown=.25;
 const a=rad(s.heading),b=rad(aim.bearing),e=rad(clamp(aim.elevation,-15,85)),speed=600;
 s.gunRounds.push({id:s.weaponSequence++,owner:'player',x:s.x+Math.sin(a)*16,y:s.y+Math.cos(a)*16,altitude:6-s.depth,vx:Math.sin(b)*Math.cos(e)*speed,vy:Math.cos(b)*Math.cos(e)*speed,vz:Math.sin(e)*speed,age:0,tracer:s.gun.shots%5===0});
 emitSound(s,{type:'gunfire',x:s.x,y:s.y,altitude:6,power:.6});s.gunLoudUntil=s.time+3;s.alert=clamp(s.alert+8,0,100);
 for(const ship of s.ships)if(ship.military&&distance(s,ship)<6000)ship.alert=Math.max(ship.alert,65);
 return true;
}
export function aimGunAt(s,point){
 const a=rad(s.heading),mount={x:s.x+Math.sin(a)*16,y:s.y+Math.cos(a)*16},d=distance(mount,point),travel=d/600;
 const future={x:point.x+(point.vx||0)*travel,y:point.y+(point.vy||0)*travel};
 s.gun.angle=wrap(bearing(mount,future)-s.heading);s.gun.elevation=clamp(Math.atan2((point.altitude??2)-6,d)*180/Math.PI,-15,85);
}
function shipHit(from,to,ship,kind=ship.kind){
 const a=rad(ship.heading),sn=Math.sin(a),cs=Math.cos(a),scale=kind==='fishing'?.38:kind==='escort'?.78:kind==='sub'?.5:1;
 const local=p=>[(p.x-ship.x)*cs-(p.y-ship.y)*sn,(p.x-ship.x)*sn+(p.y-ship.y)*cs,p.altitude+(ship.sinkDepth||0)+(kind==='sub'?ship.depth??65:0)];
 const p=local(from),q=local(to),bounds=[[-14*scale,14*scale],[-65*scale,65*scale],[-7,kind==='sub'?7:23*scale]];let enter=0,leave=1;
 for(let i=0;i<3;i++){const v=q[i]-p[i];if(Math.abs(v)<1e-10){if(p[i]<bounds[i][0]||p[i]>bounds[i][1])return null;continue;}let a=(bounds[i][0]-p[i])/v,b=(bounds[i][1]-p[i])/v;if(a>b)[a,b]=[b,a];enter=Math.max(enter,a);leave=Math.min(leave,b);if(enter>leave)return null;}
 return enter>=0&&enter<=1?enter:null;
}
function sphereHit(from,to,body,radius){
 const x=to.x-from.x,y=to.y-from.y,z=to.altitude-from.altitude,q=x*x+y*y+z*z;
 const t=q?clamp(((body.x-from.x)*x+(body.y-from.y)*y+(body.altitude-from.altitude)*z)/q,0,1):0;
 return Math.hypot(from.x+t*x-body.x,from.y+t*y-body.y,from.altitude+t*z-body.altitude)<radius?t:null;
}
function impact(s,round,point,kind){s.impacts.push({id:round.id,x:point.x,y:point.y,altitude:point.altitude,time:s.time,kind});}
function updateRounds(s,dt){
 for(const r of s.gunRounds){const from={x:r.x,y:r.y,altitude:r.altitude};r.age+=dt;r.previous=from;r.x+=r.vx*dt;r.y+=r.vy*dt;r.altitude+=r.vz*dt;
  let nearest=Infinity,target=null,type=null;
  if(r.owner==='player'){
   for(const ship of s.ships){if(ship.hull<=0||ship.kind==='sub'&&(ship.depth||0)>8)continue;const t=shipHit(from,r,ship);if(t!==null&&t<nearest){nearest=t;target=ship;type='ship';}}
   for(const plane of s.aircraft){if(plane.hull<=0)continue;const t=sphereHit(from,r,plane,10);if(t!==null&&t<nearest){nearest=t;target=plane;type='aircraft';}}
  }else if(s.depth<=2){const body={x:s.x,y:s.y,altitude:2},t=sphereHit(from,r,body,8);if(t!==null){nearest=t;target=s;type='own';}}
  if(target){const point={x:from.x+(r.x-from.x)*nearest,y:from.y+(r.y-from.y)*nearest,altitude:from.altitude+(r.altitude-from.altitude)*nearest};r.age=99;impact(s,r,point,'hit');
   const damageScale=2**(s.difficulty?.damage??0);
   if(type==='ship'){target.playerDamaged=true;target.hull=Math.max(0,target.hull-12*damageScale);if(point.altitude+(target.sinkDepth||0)<5)target.flood=(target.flood||0)+2.4*damageScale;
    if(!target.military)recordCivilianHit(s,target,'Deck-gun fire struck the neutral '+target.name+'.');
    if(s.time-(target.lastHitLog??-99)>2){target.lastHitLog=s.time;log(s,'Gun impact observed.','info');}
   }else if(type==='aircraft'){target.hull=Math.max(0,target.hull-38*damageScale);if(target.hull<=0)log(s,'Aircraft hit. Going down.','success');}
   else hurt(s,3,'Aircraft strafing the surfaced hull. Dive!','deckgun');
  }else if(r.altitude<0){const f=clamp(from.altitude/(from.altitude-r.altitude),0,1);impact(s,r,{x:from.x+(r.x-from.x)*f,y:from.y+(r.y-from.y)*f,altitude:0},'splash');r.age=99;}
 }
 s.gunRounds=s.gunRounds.filter(r=>r.age<6);s.impacts=s.impacts.filter(p=>s.time-p.time<3).slice(-64);
}
function shipDamage(s,dt){
 for(const v of s.ships){
  v.flood=v.flood||0;v.sinkDepth=v.sinkDepth||0;
  if(v.hull>0&&v.flood>0){
   v.hull=Math.max(0,v.hull-v.flood*.05*dt);
   if(v.hull<48||v.flood>8){if(!v.disabled)addDebrief(s,v.name+' was disabled by flooding.');v.disabled=true;v.speed=0;}
   v.sinkDepth=Math.min(4,v.sinkDepth+dt*v.flood*.002);
  }
  if(v.hull>0||v.settled)continue;
  const origin=v.kind==='sub'?v.depth:0;
  if(v.sunkAt===undefined){v.sunkAt=s.time;addDebrief(s,v.name+' began sinking.');}
  // Keep the grounded hull against the same triangles the underwater camera displays.
  const clearance=v.kind==='sub'||v.kind==='fishing'?3:8;
  const bed=Math.max(0,-floorSurface(v.x,v.y).height-clearance-origin);
  v.speed=0;v.sinkDepth=Math.min(bed,v.sinkDepth+dt*1.3);
  const age=s.time-v.sunkAt,depth=origin+v.sinkDepth;
  if(age>=(v.nextCreak??4)){
   emitSound(s,{type:'creak',x:v.x,y:v.y,depth,power:.65});
   v.nextCreak=age+9+hash01(s.patrol.seed,v.sunkAt+Math.floor(age))*20;
  }
  if(!v.collapsed&&depth>45&&v.sinkDepth>18&&(v.kind==='sub'||hash01(s.patrol.seed,v.sunkAt)>.45)){
   v.collapsed=true;
   emitSound(s,{type:'collapse',x:v.x,y:v.y,depth,vessel:v.id,power:1.3});
   addDebrief(s,'Compartments aboard '+v.name+' collapsed during the descent.');
  }
  if(v.sinkDepth>=bed){
   v.settled=true;
   emitSound(s,{type:'settling',x:v.x,y:v.y,depth,vessel:v.id,power:.9});
   addDebrief(s,v.name+' came to rest on the seabed.');
  }
 }
}
const targetRunDepth=ship=>ship.kind==='sub'?ship.depth??65:SURFACE_RUN_DEPTH;
function seekerReturn(s,p){
 let best=null,score=0;
 for(const ship of s.ships){
  if(ship.hull<=0)continue;
  const d=Math.hypot(distance(p,ship),targetRunDepth(ship)-p.depth);
  if(d>1800||Math.abs(delta(bearing(p,ship),p.heading))>40)continue;
  const loud=ship.noise??(ship.kind==='merchant'?75:ship.kind==='escort'?65:ship.kind==='sub'?28:40)+Math.abs(ship.speed)*3;
  const preference=ship.id===p.intended&&!p.diverted?2.5:1,value=loud*preference/(d+80);
  if(value>score){best=ship;score=value;}
 }
 return best;
}
function releaseEnemyDecoy(s,p,ship){
 if(!ship||ship.kind!=='sub'||!ship.military||p.decoysChecked.includes(ship.id))return;
 const depth=targetRunDepth(ship);
 if(Math.hypot(distance(p,ship),depth-p.depth)>220)return;
 const remaining=ship.torpedoDecoys??ENEMY_DECOY_SUPPLY;
 if(remaining===0)return;
 ship.torpedoDecoys=remaining-1;
 p.decoysChecked.push(ship.id);
 if(rand(s)>=.25)return;
 // Drop the decoy short of the boat and to one side of the incoming shot.
 const a=rad(bearing(p,ship)),side=p.searchDirection;
 p.decoyTarget={x:ship.x-Math.sin(a)*60+Math.cos(a)*24*side,y:ship.y-Math.cos(a)*60-Math.sin(a)*24*side,
  depth,expiresAt:s.time+18};
}
function searchCourse(p,dt){
 p.searchAge+=dt;
 const turnRate=8/(1+p.searchAge/24);
 return{heading:p.heading+p.searchDirection*turnRate*dt,depth:p.orderedDepth};
}
function torpedoCourse(s,p,dt){
 if(p.age<=.55&&p.tubeSide!==0)return{heading:p.heading,depth:p.depth-Math.tan(p.pitch)*32};
 if(p.age<ARMING_TIME)return{heading:p.orderedHeading,depth:p.orderedDepth};
 if(p.pingAge>=2.4){
  p.pingAge=0;
  emitSound(s,{type:'seeker',x:p.x,y:p.y,depth:p.depth,power:.24});
 }
 if(p.owner==='enemy'){
  // The incoming shot knows only the launch report. Passing that point
  // starts a search even when the player has since moved somewhere else.
  if(p.aim){
   const a=rad(p.orderedHeading),ahead=(p.aim.x-p.x)*Math.sin(a)+(p.aim.y-p.y)*Math.cos(a);
   if(ahead>0)return{heading:bearing(p,p.aim),depth:p.orderedDepth};
   p.aim=null;
  }
  return searchCourse(p,dt);
 }
 if(p.decoyTarget&&s.time>=p.decoyTarget.expiresAt)p.decoyTarget=null;
 const best=p.decoyTarget?null:seekerReturn(s,p);
 releaseEnemyDecoy(s,p,best);
 p.lock=p.decoyTarget?null:best?.id??null;
 const target=p.decoyTarget??best;
 if(target){
  p.searchAge=0;
  if(p.lock)p.orderedDepth=targetRunDepth(best);
  return{heading:bearing(p,target),depth:target===best?targetRunDepth(best):target.depth};
 }
 return searchCourse(p,dt);
}
function torpedoStrike(s,p,from){
 const to={x:p.x,y:p.y,altitude:-p.depth};
 const hullHit=p.owner==='enemy'?shipHit(from,to,s,'sub'):null;
 let hit=hullHit===null?null:s,fraction=hullHit??Infinity;
 for(const ship of s.ships){
  if(ship.hull<=0)continue;
  const t=shipHit(from,to,ship);
  if(t!==null&&t<fraction){hit=ship;fraction=t;}
 }
 if(!hit)return false;
 p.x=from.x+(p.x-from.x)*fraction;p.y=from.y+(p.y-from.y)*fraction;
 p.depth=-from.altitude+(p.depth+from.altitude)*fraction;p.age=TORPEDO_LIFE;
 emitSound(s,{type:'detonation',x:p.x,y:p.y,depth:p.depth,power:1,ownHit:p.owner==='player'});
 s.impacts.push({id:p.id,x:p.x,y:p.y,altitude:-p.depth,time:s.time,kind:'torpedo'});
 if(hit===s){
  hurt(s,36,'Torpedo struck the hull. Damage control responding.');
  addDebrief(s,'An incoming torpedo struck your boat.');
  return true;
 }
 if(p.owner==='enemy'){
  hit.hull=Math.max(0,hit.hull-100);
  return true;
 }
 hit.playerDamaged=true;hit.hull=Math.max(0,hit.hull-100*2**(s.difficulty?.damage??0));
 if(hit.military)addDebrief(s,'Your torpedo struck '+hit.name+'.');
 else recordCivilianHit(s,hit,p.diverted&&p.intended!==hit.id
  ?'A decoy diverted your torpedo before it acquired and struck the neutral '+hit.name+'.'
  :'Your torpedo struck the neutral '+hit.name+'.');
 return true;
}
function updateTorpedoes(s,dt){
 for(const p of s.projectiles){
  p.runLimit??=MAX_RUN;p.traveled??=Math.min(MAX_RUN,p.age*TORPEDO_SPEED);
  const flight=Math.min(dt,Math.max(0,TORPEDO_LIFE-p.age),Math.max(0,p.runLimit-p.traveled)/TORPEDO_SPEED);
  const travel=TORPEDO_SPEED*flight,from={x:p.x,y:p.y,altitude:-p.depth};
  p.age+=flight;p.pingAge+=flight;p.traveled=Math.min(p.runLimit,p.traveled+travel);
  const course=torpedoCourse(s,p,flight);
  p.heading=wrap(p.heading+clamp(delta(course.heading,p.heading),-flight*10,flight*10));
  const drop=course.depth-p.depth,pitch=clamp(Math.atan2(-drop,32),-MAX_PITCH,MAX_PITCH);
  const dz=Math.sign(drop)*Math.min(Math.abs(drop),travel*Math.abs(Math.sin(pitch)));
  const horizontal=Math.sqrt(travel**2-dz**2);
  p.pitch=dz===0?0:Math.atan2(-dz,horizontal);p.depth+=dz;
  p.x+=Math.sin(rad(p.heading))*horizontal;p.y+=Math.cos(rad(p.heading))*horizontal;
  const decoy=p.decoyTarget;
  if(decoy&&sphereHit(from,{x:p.x,y:p.y,altitude:-p.depth},{x:decoy.x,y:decoy.y,altitude:-decoy.depth},12)!==null){
   p.decoyTarget=null;p.diverted=true;p.orderedDepth=p.depth;
   addDebrief(s,'A torpedo followed a submarine decoy, passed it, then resumed its search.');
  }
  const hit=flight>0&&p.age>=ARMING_TIME&&torpedoStrike(s,p,from);
  if(!hit&&(p.traveled>=p.runLimit||p.age>=TORPEDO_LIFE)){
   p.age=TORPEDO_LIFE;
   if(p.owner==='player')report(s,'run-'+p.id,'Torpedo run ended at its distance limit. No impact reported.');
  }
  if(!p.path.length||s.time-p.path.at(-1).time>=.24||p.age>=TORPEDO_LIFE)p.path.push({x:p.x,y:p.y,depth:p.depth,time:s.time});
  p.path=p.path.filter(v=>s.time-v.time<40).slice(-80);
 }
 s.projectiles=s.projectiles.filter(p=>p.age<TORPEDO_LIFE);
}
function requestSupport(s){
 if(s.difficulty?.airSupport===false||s.airSupport.status==='spent')return;
 const support=s.airSupport;
 for(const v of s.ships){if(!v.military||v.hull<=0||v.alert<=55)continue;
  if(!v.report||v.report.reason==='noisemaker'||s.time-v.report.time>4||v.report.time<(support.lastKnown?.time??0))continue;
  support.lastKnown={...v.report};
  if(support.status==='idle'){support.status='arming';support.requestedAt=s.time;support.launchAt=s.time+45+Math.floor(hash01(s.patrol.seed,591)*15);log(s,'Intercepted radio traffic. Island aircraft are preparing to launch.','warning');}
 }
 if(support.status==='arming'&&s.time>=support.launchAt){support.status='airborne';for(let i=0;i<2;i++)s.aircraft.push({id:'air-'+s.weaponSequence++,name:'Island attack aircraft '+(i+1),x:support.base.x-i*20,y:support.base.y,altitude:Math.max(8,-bottom(support.base.x,support.base.y)+8+i*12),heading:45,speed:70,hull:100,phase:'takeoff',takeoffUntil:s.time+6,attack:0,bank:0,bombDropped:false});log(s,'Aircraft airborne from Greybank. They still have to reach the patrol area.','warning');}
}
function dropBomb(s,plane,report){
 const depth=clamp((report.depth||40),15,90),airTime=2+plane.altitude/70,delay=airTime+depth/6;
 const aim=projectedReport(report,s.time,delay),point=scatterAim(s,aim,45+aim.age*.9);
 s.blasts.push({id:s.soundSequence++,...point,depth,delay,totalDelay:delay,airTime,airHeight:plane.altitude,age:0,exploded:false,kind:'bomb'});
 plane.bombDropped=true;log(s,'Aircraft releasing ordnance over the last reported position.','damage');
}
function updateAircraft(s,dt){
 const support=s.airSupport,e=environmentAt(s);
 for(const p of s.aircraft){p.previous={x:p.x,y:p.y,altitude:p.altitude};p.attack=Math.max(0,(p.attack||0)-dt);
  if(p.hull<=0){p.phase='down';p.altitude-=dt*45;p.bank=(p.bank||0)+dt*1.3;if(p.altitude<-10)p.phase='gone';continue;}
  if(p.phase==='return'){
   const home=support.base,remaining=distance(p,home),travel=p.speed*dt;
   if(remaining<=Math.max(10,travel)){p.phase='gone';continue;}
   p.heading=bearing(p,home);p.bank=0;
   p.x+=(home.x-p.x)*travel/remaining;p.y+=(home.y-p.y)*travel/remaining;
   continue;
  }
  let report=support.lastKnown;
  if(report){const d=distance(p,s),sensitivity=s.difficulty?.detection??1,visible=s.depth<=2&&d<Math.min(2600,e.subVisualRange)*sensitivity||s.scope&&s.depth<=15&&d<400*sensitivity;
   if(visible){support.lastKnown=playerReport(s);report=support.lastKnown;}
   const target=projectedReport(report,s.time),r=distance(p,target);
   if(p.phase==='takeoff'&&s.time>=p.takeoffUntil)p.phase='approach';
   if(p.phase==='approach'&&r<1300)p.phase='search';
   if(visible&&r<1800&&p.phase!=='egress')p.phase='attack';
   let destination=target;if(p.phase==='takeoff')destination={x:p.x+Math.sin(rad(45))*1000,y:p.y+Math.cos(rad(45))*1000};
   if(p.phase==='search'&&!visible){const a=s.time*.06;destination={x:target.x+Math.sin(a)*650,y:target.y+Math.cos(a)*650};}
   if(p.phase==='egress'){p.egress=(p.egress||0)-dt;destination={x:p.x+Math.sin(rad(p.heading))*1000,y:p.y+Math.cos(rad(p.heading))*1000};if(p.egress<=0)p.phase='search';}
   const turn=clamp(delta(bearing(p,destination),p.heading),-dt*22,dt*22);p.heading=wrap(p.heading+turn);p.bank=clamp(-turn/Math.max(dt,.001)*.02,-.5,.5);
   const desiredAltitude=p.phase==='attack'?65:180;p.altitude+=clamp(desiredAltitude-p.altitude,-dt*10,dt*5);
   if(p.phase==='attack'&&r<900&&p.attack<=0){
    if(visible&&s.depth<=2){p.attack=.45;const from={x:p.x,y:p.y,altitude:p.altitude},to={...scatterAim(s,projectedReport(report,s.time,r/500),8+r*.045),altitude:2},n=Math.hypot(to.x-from.x,to.y-from.y,to.altitude-from.altitude);s.gunRounds.push({id:s.weaponSequence++,owner:'aircraft',...from,vx:(to.x-from.x)/n*500,vy:(to.y-from.y)/n*500,vz:(to.altitude-from.altitude)/n*500,age:0,tracer:true});emitSound(s,{type:'gunfire',x:p.x,y:p.y,altitude:p.altitude,power:.5});}
    if(r<450&&!p.bombDropped)dropBomb(s,p,report);
   }
   if((p.phase==='attack'||p.phase==='search')&&r<180){if(!p.bombDropped)dropBomb(s,p,report);p.phase='egress';p.egress=10;}
   // A lost visual contact does not grant clairvoyance: bombs follow the report.
   if(!visible&&r<450&&!p.bombDropped)dropBomb(s,p,report);
  }
  p.x+=Math.sin(rad(p.heading))*p.speed*dt;p.y+=Math.cos(rad(p.heading))*p.speed*dt;
 }
 s.aircraft=s.aircraft.filter(p=>p.phase!=='gone');
 if(support.status!=='airborne')return;
 const flying=s.aircraft.filter(p=>p.hull>0);
 if(!flying.length){support.status='spent';return;}
 const lastReport=Math.max(support.launchAt??0,support.lastKnown?.time??0);
 if(s.time-lastReport>searchDuration(s)){
  support.status='spent';
  for(const plane of flying)plane.phase='return';
  log(s,'Intercepted radio traffic. Air search called off.');
 }
}
export function updateCombat(s,dt){s.gun.cooldown=Math.max(0,s.gun.cooldown-dt);requestSupport(s);updateAircraft(s,dt);updateTorpedoes(s,dt);updateRounds(s,dt);shipDamage(s,dt);}
