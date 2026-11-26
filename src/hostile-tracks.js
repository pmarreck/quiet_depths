import {searchSeconds} from './suspicion.js';
import {bearing,clamp,delta,distance,log,rad,rand} from './mechanics.js';
import {emitSound} from './acoustics.js';
import {addDebrief} from './debrief.js';

export function playerReport(s){
 return {x:s.x,y:s.y,depth:s.depth,heading:s.heading,speed:s.speed,time:s.time};
}

export const searchDuration=s=>searchSeconds(s.difficulty?.pursuit??1);

export function projectedReport(report,time,lead=0){
 const age=Math.max(0,time-report.time),travel=(age+lead)*(report.speed??0)*.514444,course=rad(report.heading??0);
 return {...report,age,x:report.x+Math.sin(course)*travel,y:report.y+Math.cos(course)*travel};
}

export function validReport(report,time,legacy=false){
 if(!report||!['x','y','time'].every(key=>Number.isFinite(report[key]))||report.time<0||report.time>time)return false;
 const fields=['depth','heading','speed'];
 return fields.every(key=>Number.isFinite(report[key])||legacy&&report[key]===undefined);
}

export function scatterAim(s,target,radius){
 const direction=2*Math.PI*rand(s),offset=radius*Math.sqrt(rand(s));
 return {x:target.x+Math.sin(direction)*offset,y:target.y+Math.cos(direction)*offset};
}

export function updateHostileTrack(s,ship,env,dt){
 const range=distance(s,ship),exposure=s.depth<3?95:s.scope&&s.depth<=15?23:0;
 const visual=ship.kind==='sub'&&ship.depth>15?0:clamp(1-range/env.subVisualRange,0,1)*exposure;
 const depthStealth=s.difficulty?.depthStealth??1;
 const noise=s.noise*(1-.45*depthStealth*clamp(s.depth/120,0,1));
 const acoustic=clamp(1-range/5500,0,1)*noise*.7*(1-env.storm*.38*Math.exp(-s.depth/70));
 const pursuit=s.difficulty?.pursuit??1,sensitivity=s.difficulty?.detection??1;
 const canSee=visual*sensitivity>=9;
 const decoyRange=s.noisemaker?distance(ship,s.noisemaker):Infinity;
 const fooled=!canSee&&decoyRange<1050&&s.time-s.noisemaker.time<=32&&(acoustic*sensitivity<8||decoyRange<range*.65);
 const observed=canSee||acoustic*sensitivity>=8;
 if(fooled){ship.report={...s.noisemaker,time:s.time,reason:'noisemaker'};ship.alert=clamp(ship.alert+dt*1.35,0,100);}
 else if(observed&&(!ship.report||s.time-ship.report.time>=2||ship.report.reason==='noisemaker')){
  const reason=canSee?(s.depth<3?'surfaced hull':'raised periscope'):s.engine==='diesel'&&s.depth<=14?'diesel noise':'propulsion noise';
  ship.report={...playerReport(s),reason};
 }
 if(!fooled)ship.alert=clamp(ship.alert+dt*((observed?(visual+acoustic)*sensitivity*.06:0)-.65/pursuit),0,100);
 if(!ship.report||s.time-ship.report.time>searchDuration(s)||ship.alert<=42)return null;
 return projectedReport(ship.report,s.time);
}

export function reportHunterState(s,ship,track){
 const name=ship.kind==='sub'?'An enemy submarine':ship.name;
 const status=track?(track.reason==='noisemaker'?'decoy':track.age>4?'searching':'tracking'):null;
 if((ship.tracking??null)===status)return;
 if(status==='tracking')addDebrief(s,`${name} ${ship.tracking?'reacquired':'detected'} you by ${track.reason||'a sonar ping'}.`);
 if(status==='searching')addDebrief(s,`${name} lost contact and searched along your last observed course of ${Math.round(track.heading)}° at ${Math.abs(track.speed).toFixed(1)} kn.`);
 if(status==='decoy')addDebrief(s,`${name} followed the noisemaker.`);
 if(!status){
  addDebrief(s,`${name} broke off pursuit.`);
  if(ship.patrolSpeed!==undefined){ship.speed=ship.patrolSpeed;delete ship.patrolSpeed;}
 }
 ship.tracking=status;
}

export function pursueAndAttack(s,ship,track,dt,dropCharge,launchTorpedo){
 ship.patrolSpeed??=ship.speed;
 ship.heading=(ship.heading+clamp(delta(bearing(ship,track),ship.heading),-dt*2.5,dt*2.5)+360)%360;
 ship.speed=ship.kind==='escort'?15:8;
 if(ship.alert<=55)return;
 const range=distance(ship,track),guns=ship.kind==='escort'&&track.depth<=2;
 const reach=guns?2600:ship.kind==='sub'?2300:420;
 if(range>=reach)return;
 ship.attack-=dt;
 if(ship.attack>0)return;
 ship.lastAttackAt=s.time;
 if(guns){
  const delay=1.5+range/550,aim=projectedReport(ship.report,s.time,delay);
  const point=scatterAim(s,aim,25+range*.065+track.age*.6);
  ship.attack=12;
  s.shells.push({id:s.soundSequence++,...point,depth:0,delay,fromX:ship.x,fromY:ship.y,total:delay});
  emitSound(s,{type:'gunfire',x:ship.x,y:ship.y,altitude:12,power:1});
  log(s,'Escort firing. Shells incoming. Dive or return fire.','damage');
 }else if(ship.kind==='sub'){
  ship.attack=35;
  launchTorpedo(s,ship,track);
 }else{
  const depth=clamp(track.depth+(rand(s)-.5)*(12+track.age*.35),0,220);
  const delay=Math.max(4,depth/4.5),aim=projectedReport(ship.report,s.time,delay);
  const point=scatterAim(s,aim,70+range*.48+track.age*1.4);
  ship.attack=35;
  dropCharge(s,{...point,depth,delay,kind:'charge'});
  addDebrief(s,ship.name+' dropped a depth charge.');
 }
}
