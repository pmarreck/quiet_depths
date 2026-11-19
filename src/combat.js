// Fictional combat tuning. Positions are meters; gun aim is compass/elevation.
import {clamp,rad,bearing,delta,distance,log,rand,bottom} from './mechanics.js';
import {hash01,environmentAt} from './environment.js';
import {emitSound} from './acoustics.js';
import {hurt} from './systems.js';
import {isSurfaced} from './vehicle-status.js';
import {estimateAt} from './track-estimates.js';

export const freshCombat=()=>({gun:{ammo:240,cooldown:0,shots:0,angle:0,elevation:0},gunRounds:[],impacts:[],aircraft:[],airSupport:{status:'idle',requestedAt:null,launchAt:null,base:{x:-3200,y:3400},lastKnown:null},weaponSequence:1,gunLoudUntil:0});
const wrap=n=>(n%360+360)%360;
export function chargeAltitude(charge){
 if(charge.exploded)return -charge.depth;
 const elapsed=clamp(charge.totalDelay-charge.delay,0,charge.totalDelay),air=charge.airTime||0;
 if(air&&elapsed<air)return (charge.airHeight||0)*(1-(elapsed/air)**2);
 return -charge.depth*clamp((elapsed-air)/Math.max(.001,charge.totalDelay-air),0,1)||0;
}
export function firingBearing(s,contact){const estimate=contact.fix?estimateAt(contact,s.time):null;return estimate?bearing(s,estimate):contact.bearing;}
export function launchTorpedo(s,id){
 const c=s.contacts.find(v=>v.id===id);
 if(!c||s.torps<=0||s.status!=='patrol'||s.depth>100)return false;
 s.torps--;s.alert=clamp(s.alert+20,0,100);
 const target=s.ships.find(v=>v.id===id),depth=target?.kind==='sub'?s.depth:Math.min(6,s.depth);
 const heading=firingBearing(s,c);s.projectiles.push({id:s.weaponSequence++,x:s.x,y:s.y,depth,heading,age:0,intended:id,lock:null,pingAge:99,path:[{x:s.x,y:s.y,depth,time:s.time}]});
 log(s,`Tube away. Bearing ${Math.round(heading)}. Seeker arms after its run-out.`,'warning');return true;
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
function shipHit(from,to,ship){
 const a=rad(ship.heading),sn=Math.sin(a),cs=Math.cos(a),scale=ship.kind==='fishing'?.38:ship.kind==='escort'?.78:ship.kind==='sub'?.5:1;
 const local=p=>[(p.x-ship.x)*cs-(p.y-ship.y)*sn,(p.x-ship.x)*sn+(p.y-ship.y)*cs,p.altitude+(ship.sinkDepth||0)];
 const p=local(from),q=local(to),bounds=[[-14*scale,14*scale],[-65*scale,65*scale],[-7,ship.kind==='sub'?7:23*scale]];let enter=0,leave=1;
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
   if(type==='ship'){target.hull=Math.max(0,target.hull-12);if(point.altitude+(target.sinkDepth||0)<5)target.flood=(target.flood||0)+2.4;
    if(!target.military){s.status='compromised';log(s,'Neutral vessel struck by deck-gun fire. Patrol compromised.','damage');}
    else if(s.time-(target.lastHitLog??-99)>2){target.lastHitLog=s.time;log(s,`Gun hit on ${target.name}${target.flood?' · flooding reported.':'.'}`,'success');}
   }else if(type==='aircraft'){target.hull=Math.max(0,target.hull-38);if(target.hull<=0)log(s,'Aircraft hit. Going down.','success');}
   else hurt(s,3,'Aircraft strafing the surfaced hull. Dive!','deckgun');
  }else if(r.altitude<0){const f=clamp(from.altitude/(from.altitude-r.altitude),0,1);impact(s,r,{x:from.x+(r.x-from.x)*f,y:from.y+(r.y-from.y)*f,altitude:0},'splash');r.age=99;}
 }
 s.gunRounds=s.gunRounds.filter(r=>r.age<6);s.impacts=s.impacts.filter(p=>s.time-p.time<3).slice(-64);
}
function shipDamage(s,dt){
 for(const v of s.ships){v.flood=v.flood||0;v.sinkDepth=v.sinkDepth||0;
  if(v.hull>0&&v.flood>0){v.hull=Math.max(0,v.hull-v.flood*.05*dt);if(v.hull<48||v.flood>8){if(!v.disabled)log(s,`${v.name} is disabled and taking on water.`,'success');v.disabled=true;v.speed=0;}v.sinkDepth=Math.min(4,v.sinkDepth+dt*v.flood*.002);}
  if(v.hull<=0){if(v.sunkAt===undefined){v.sunkAt=s.time;log(s,`${v.name} is sinking.`,'success');}v.sinkDepth=Math.min(80,v.sinkDepth+dt*.8);v.speed=0;}
 }
}
function updateTorpedoes(s,dt){
 for(const p of s.projectiles){p.age+=dt;p.pingAge+=dt;let best=null,score=0;
  if(p.age>=4){if(p.pingAge>=2.4){p.pingAge=0;emitSound(s,{type:'seeker',x:p.x,y:p.y,depth:p.depth,power:.24});}
   for(const ship of s.ships){if(ship.hull<=0)continue;const d=distance(p,ship);if(d>1800||Math.abs(delta(bearing(p,ship),p.heading))>40)continue;
    const loud=ship.noise??(ship.kind==='merchant'?75:ship.kind==='escort'?65:ship.kind==='sub'?28:40)+Math.abs(ship.speed)*3,preference=ship.id===p.intended?2.5:1,value=loud*preference/(d+80);
    if(value>score){best=ship;score=value;}}
   p.lock=best?.id??null;
   if(best){p.heading=wrap(p.heading+clamp(delta(bearing(p,best),p.heading),-dt*10,dt*10));const depth=best.kind==='sub'?(best.depth||65):4;p.depth+=clamp(depth-p.depth,-dt*1.5,dt*1.5);}
  }
  p.x+=Math.sin(rad(p.heading))*24*dt;p.y+=Math.cos(rad(p.heading))*24*dt;
  if(!p.path.length||s.time-p.path.at(-1).time>=.5)p.path.push({x:p.x,y:p.y,depth:p.depth,time:s.time});p.path=p.path.filter(v=>s.time-v.time<40).slice(-80);
  for(const ship of s.ships){const vertical=(ship.kind==='sub'?ship.depth||65:4)-p.depth;if(ship.hull>0&&Math.hypot(distance(p,ship),vertical)<55){ship.hull=0;p.age=999;emitSound(s,{type:'detonation',x:ship.x,y:ship.y,depth:ship.depth||4,power:1});log(s,ship.military?`Heavy detonation. ${ship.name} is sinking.`:`Neutral vessel hit: ${ship.name}. Patrol compromised.`,ship.military?'success':'damage');if(!ship.military)s.status='compromised';break;}}
 }
 s.projectiles=s.projectiles.filter(p=>p.age<180);
}
function requestSupport(s){
 const support=s.airSupport;
 for(const v of s.ships){if(!v.military||v.hull<=0||v.alert<=55)continue;
  const d=distance(s,v),located=s.depth<=2||s.scope&&s.depth<=15&&d<1200||s.noise>45&&d<1800||s.pingAge<4&&d<7000;
  if(!located)continue;
  support.lastKnown={x:s.x,y:s.y,time:s.time,depth:s.depth};
  if(support.status==='idle'){support.status='arming';support.requestedAt=s.time;support.launchAt=s.time+45+Math.floor(hash01(s.patrol.seed,591)*15);log(s,'Intercepted radio traffic. Island aircraft are preparing to launch.','warning');}
 }
 if(support.status==='arming'&&s.time>=support.launchAt){support.status='airborne';for(let i=0;i<2;i++)s.aircraft.push({id:'air-'+s.weaponSequence++,name:'Island attack aircraft '+(i+1),x:support.base.x-i*20,y:support.base.y,altitude:Math.max(8,-bottom(support.base.x,support.base.y)+8+i*12),heading:45,speed:70,hull:100,phase:'takeoff',takeoffUntil:s.time+6,attack:0,bank:0,bombDropped:false});log(s,'Aircraft airborne from Greybank. They still have to reach the patrol area.','warning');}
}
function dropBomb(s,plane,report){
 const depth=clamp((report.depth||40),15,90),airTime=2+plane.altitude/70,delay=airTime+depth/6;
 s.blasts.push({id:s.soundSequence++,x:report.x+(rand(s)-.5)*90,y:report.y+(rand(s)-.5)*90,depth,delay,totalDelay:delay,airTime,airHeight:plane.altitude,age:0,exploded:false,kind:'bomb'});
 plane.bombDropped=true;log(s,'Aircraft releasing ordnance over the last reported position.','damage');
}
function updateAircraft(s,dt){
 const support=s.airSupport,e=environmentAt(s);
 for(const p of s.aircraft){p.previous={x:p.x,y:p.y,altitude:p.altitude};p.attack=Math.max(0,(p.attack||0)-dt);
  if(p.hull<=0){p.phase='down';p.altitude-=dt*45;p.bank=(p.bank||0)+dt*1.3;if(p.altitude<-10)p.phase='gone';continue;}
  let report=support.lastKnown;
  if(report){const d=distance(p,s),visible=s.depth<=2&&d<Math.min(2600,e.subVisualRange)||s.scope&&s.depth<=15&&d<400;
   if(visible){support.lastKnown={x:s.x,y:s.y,time:s.time,depth:s.depth};report=support.lastKnown;}
   const r=distance(p,report);
   if(p.phase==='takeoff'&&s.time>=p.takeoffUntil)p.phase='approach';
   if(p.phase==='approach'&&r<1300)p.phase='search';
   if(visible&&r<1800&&p.phase!=='egress')p.phase='attack';
   let destination=report;if(p.phase==='takeoff')destination={x:p.x+Math.sin(rad(45))*1000,y:p.y+Math.cos(rad(45))*1000};
   if(p.phase==='search'&&!visible){const a=s.time*.06;destination={x:report.x+Math.sin(a)*650,y:report.y+Math.cos(a)*650};}
   if(p.phase==='egress'){p.egress=(p.egress||0)-dt;destination={x:p.x+Math.sin(rad(p.heading))*1000,y:p.y+Math.cos(rad(p.heading))*1000};if(p.egress<=0)p.phase='search';}
   const turn=clamp(delta(bearing(p,destination),p.heading),-dt*22,dt*22);p.heading=wrap(p.heading+turn);p.bank=clamp(-turn/Math.max(dt,.001)*.02,-.5,.5);
   const desiredAltitude=p.phase==='attack'?65:180;p.altitude+=clamp(desiredAltitude-p.altitude,-dt*10,dt*5);
   if(p.phase==='attack'&&r<900&&p.attack<=0){
    if(visible&&s.depth<=2){p.attack=.45;const from={x:p.x,y:p.y,altitude:p.altitude},to={x:s.x+(rand(s)-.5)*22,y:s.y+(rand(s)-.5)*22,altitude:2},n=Math.hypot(to.x-from.x,to.y-from.y,to.altitude-from.altitude);s.gunRounds.push({id:s.weaponSequence++,owner:'aircraft',...from,vx:(to.x-from.x)/n*500,vy:(to.y-from.y)/n*500,vz:(to.altitude-from.altitude)/n*500,age:0,tracer:true});emitSound(s,{type:'gunfire',x:p.x,y:p.y,altitude:p.altitude,power:.5});}
    if(r<450&&!p.bombDropped)dropBomb(s,p,report);
   }
   if((p.phase==='attack'||p.phase==='search')&&r<180){if(!p.bombDropped)dropBomb(s,p,report);p.phase='egress';p.egress=10;}
   // A lost visual contact does not grant clairvoyance: bombs follow the report.
   if(!visible&&r<450&&!p.bombDropped)dropBomb(s,p,report);
  }
  p.x+=Math.sin(rad(p.heading))*p.speed*dt;p.y+=Math.cos(rad(p.heading))*p.speed*dt;
 }
 s.aircraft=s.aircraft.filter(p=>p.phase!=='gone');if(support.status==='airborne'&&!s.aircraft.some(p=>p.hull>0))support.status='spent';
}
export function updateCombat(s,dt){s.gun.cooldown=Math.max(0,s.gun.cooldown-dt);requestSupport(s);updateAircraft(s,dt);updateTorpedoes(s,dt);updateRounds(s,dt);shipDamage(s,dt);}
