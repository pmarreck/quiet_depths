import {validTubeTimes} from './torpedo-tubes.js';
import {convoyLosses,updateLamp,updateConvoyRaid,resolveConvoyCharge} from './convoy-watch.js';
import {replayEvent} from './instant-replay.js';
import {gameEcho,observeTorpedo,validEcho,validTracks} from './torpedo-watch.js';
import {fullCondition,BOAT_PARTS,DRONE_PARTS,readLimits,operatingFraction} from './equipment.js';
import {report,hearWreck} from './patrol-reports.js';
import {incidentalHull} from './carrier.js';
import {resolveTraffic} from './hull-contacts.js';
// Units: meters, seconds, knots, degrees clockwise from north. No rendering here.
import {makeEnvironment,environmentAt,scopeWashed,hash01,WEATHER,soundings} from './environment.js';
import {emitSound,updateAcoustics} from './acoustics.js';
import {clamp,rad,bearing,delta,distance,separation,bottom,rand,log} from './mechanics.js';
import {MISSIONS,randomizePatrol,objectiveComplete,validMissionTargets,updateFleetBattle} from './missions.js';
import {isDieselMode} from './power-plant.js';
import {maxNosePitch} from './rov-flight.js';
import {classifyEcho,fleetShotPose,isOpponent,sidesAfloat} from './fleet-action.js';
import {freshSystems,freshMotion,freshDrone,deployDrone,recallDrone,hurt,updateBoat,updateDrone} from './systems.js';
import {TORPEDO_SPEED,MAX_RUN,ENEMY_DECOY_SUPPLY,freshCombat,launchHostileTorpedo,launchTorpedo,restoreIncomingRun,restoreTorpedo,updateCombat} from './combat.js';
import {freshRecon,updateRecon,validateReconState} from './recon.js';
import {designation,fixContact,estimateAt,applyReconPacket} from './track-estimates.js';
import {observationBias} from './contact-readings.js';
import {photoArchive,validPhoto,PHOTO_BUDGET} from './photos.js';
import {playerReport,pursueAndAttack,reportHunterState,updateHostileTrack,validReport} from './hostile-tracks.js';
import {patrolDifficulty} from './difficulty.js';
import {longPatrol,advanceApproach,approachProgress,validSearch} from './patrol-search.js';
import {addDebrief,validDebrief} from './debrief.js';
export {clamp,rad,bearing,delta,distance,bottom,log,MISSIONS,deployDrone,recallDrone,hurt};
export function createGame(mission='recon',seed=19830604,options={}){
 const m=MISSIONS.find(m=>m.id===mission)||MISSIONS[0];
 const s={version:1,rng:seed||1,time:0,status:'patrol',mission:m.id,phase:'objective',trackTime:0,photos:[],hull:100,battery:92,oxygen:100,fuel:86,flood:0,repair:0,torps:m.torps,noise:12,alert:0,pingAge:999,pingCooldown:0,photoCooldown:0,decoys:3,engine:'electric',silent:false,scope:true,scopeAngle:0,scopeSteerBearing:null,towerAngle:0,towerPitch:0,systems:freshSystems(),...freshMotion(),...freshCombat(),cavitation:0,propRpm:52,speed:4,targetSpeed:4,depth:12,targetDepth:12,heading:32,targetHeading:32,x:0,y:0,route:null,home:{x:-1500,y:-1700},environment:makeEnvironment(seed,options),lightning:[],nextLightningAt:8+hash01(seed)*8,acoustics:[],soundSequence:1,events:[{t:0,text:'Helm steady. Faint screws bearing 028. Your patrol begins.',kind:'info'}],contacts:[],projectiles:[],blasts:[],shells:[],nextId:1,drone:freshDrone(),ships:[
 {id:'cobalt',name:'Cobalt',kind:'merchant',military:true,x:1450,y:2700,heading:255,speed:5,hull:100,alert:0,attack:0},
 {id:'meridian',name:'Meridian',kind:'merchant',military:false,x:2350,y:2900,heading:255,speed:5,hull:100,alert:0,attack:0},
 {id:'kestrel',name:'Kestrel',kind:'escort',military:true,x:2300,y:2050,heading:255,speed:7,hull:100,alert:0,attack:0},
 {id:'tern',name:'Tern',kind:'fishing',military:false,x:-850,y:1350,heading:110,speed:3,hull:100,alert:0,attack:0},
 {id:'echo',name:'Unknown submarine',kind:'sub',military:true,x:3800,y:900,depth:75,heading:280,speed:4,hull:100,alert:0,attack:0}
 ]};s.torpedoTracks=[];s.repairLimits=fullCondition(BOAT_PARTS);s.drone.repairLimits=fullCondition(DRONE_PARTS);s.debrief=[];s.difficulty=patrolDifficulty(options.difficulty);s.recon=freshRecon();s.reconArchivedSequence=0;s.photoArchive=[];s.photoSequence=1;randomizePatrol(s,seed);
 if(s.difficulty.longPatrol){
  Object.assign(s,longPatrol(s));
  if(s.battle){
   const east=Math.sign(s.battle.areas[1].x-s.battle.areas[0].x);
   for(const ship of s.ships){
    const direction=ship.side==='friendly'?east:-east;
    ship.x-=direction*800;ship.heading=direction>0?90:270;
   }
  }
  if(s.departure)s.departure={x:s.x,y:s.y};
  log(s,'Long patrol. Search the dashed area on the chart. Its center is an estimate.');
 }
 return s;
}
export function getSoundings(s,drone=false){const v=drone?s.drone:s;return soundings(bottom(v.x,v.y,s.environment.chartSeed),v.depth,drone?.7:5+27.5*Math.abs(Math.sin(s.pitch)));}
export function isVisible(s,ship,look=null,env=environmentAt(s)){
 if(ship.hull<=0||ship.kind==='sub'||s.depth>15||!s.scope)return false;
 return !scopeWashed(s,env)&&distance(s,ship)<env.opticalRange*operatingFraction(s.systems.periscope)&&(look===null||Math.abs(delta(bearing(s,ship),look))<19);
}
export function contact(s,ship,method){
 let c=s.contacts.find(c=>c.id===ship.id);
 const b=bearing(s,ship),d=distance(s,ship);
 if(!c){c={id:ship.id,label:designation(s.nextId++),bearing:b,range:0,confidence:0,age:0,identified:false,method:'passive',x:0,y:0};s.contacts.push(c);log(s,`New contact. ${c.label}, bearing ${Math.round(b)}.`, 'contact');}
 // Patrol saves share a random stream across systems. Reserve the original
 // draw for every observation so changing the display preserves seeded events.
 const observationRoll=rand(s);
 c.bearing=(b+(method==='passive'?3*observationBias(s.patrol.seed,c.id,'passive'):0)+360)%360;c.age=0;c.method=method;
 if(s.convoy&&method==='passive'){c.passiveBearing=c.bearing;c.passiveAt=s.time;c.passiveX=s.x;c.passiveY=s.y;}
 if(method!=='passive'&&method!=='lights'){
   const sigma=method==='visual'?Math.max(25,d*.045):Math.max(15,d*.03);
   const continuedSight=method==='visual'&&c.fix?.source==='visual';
   if(!c.fix||s.time-c.fix.time>=5&&(continuedSight||estimateAt(c,s.time).major>sigma*2.448)){
    c.range=d*(method==='visual'?1+.06*observationBias(s.patrol.seed,c.id,'visual'):.97+observationRoll*.06);
    c.x=s.x+Math.sin(rad(b))*c.range;c.y=s.y+Math.cos(rad(b))*c.range;c.confidence=method==='visual'?.9:.75;
    const measurement={x:c.x,y:c.y,time:s.time,positionSigma:sigma,velocitySigma:1.5,maneuverSigma:.03,source:method};
    if(method==='active'&&ship.kind==='sub'){
     c.kind='sub';c.depthEstimate=clamp(Math.round((ship.depth+(rand(s)-.5)*(12+d*.012))/10)*10,0,320);
     if(c.fix){
      const dt=s.time-c.fix.time,dx=(c.x-c.fix.x)/dt,dy=(c.y-c.fix.y)/dt,scale=Math.max(1,Math.hypot(dx,dy)/9);
      measurement.vx=dx/scale;measurement.vy=dy/scale;c.courseEstimated=true;
     }
    }
    fixContact(c,measurement);
   }
   if(method==='visual'){c.identified=true;c.name=ship.name;c.kind=ship.kind;c.military=ship.military;if(ship.side)c.side=ship.side;}
   if(method==='active'&&s.mission==='tiebreaker'&&!c.identified&&!c.probableSide){
    const guess=classifyEcho(s.battle,ship,c,observationRoll);if(guess)c.probableSide=guess;
   }
 } else c.confidence=Math.max(.24,c.confidence);
 return c;
}
export function ping(s){
 if(s.pingCooldown>0||s.status!=='patrol'||!operatingFraction(s.systems.sonar))return false;
 s.pingAge=0;s.pingCooldown=15;
 if(s.search&&!s.search.located&&s.site&&separation(s,s.site)<1500*operatingFraction(s.systems.sonar)){
  s.search.located=true;log(s,'Mission site echo identified. Position marked on chart.','success');
 }
 for(const p of s.projectiles)if(Math.hypot(distance(s,p),s.depth-p.depth)<6000*operatingFraction(s.systems.sonar))observeTorpedo(s,gameEcho(s,p,s.time,TORPEDO_SPEED),true);
 for(const volley of s.battle?.volleys??(s.convoy?.shot?[s.convoy.shot]:[])){
  if(!volley.underwater)continue;
  const p=fleetShotPose(volley,s.time);
  if(separation(s,p)<6000*operatingFraction(s.systems.sonar))observeTorpedo(s,gameEcho(s,p,s.time,p.speed),true);
 }
 for(const ship of s.ships)if(ship.hull>0&&distance(s,ship)<6000*operatingFraction(s.systems.sonar))contact(s,ship,'active');
 for(const ship of s.ships){
  if(!isOpponent(ship)||ship.hull<=0||ship.disabled)continue;
  const chance=s.difficulty.pingDetection*clamp(1-distance(s,ship)/7500,0,1);
  if(chance>0&&rand(s)<chance){ship.alert=Math.max(ship.alert,65);ship.report={...playerReport(s),reason:'an active sonar ping'};}
 }
 log(s,'Active ping. Ranges resolved. Nearby hunters may have heard it.','warning');return true;
}
export function photograph(s,look){
 if(s.photoCooldown>0)return false;
 const seen=s.ships.filter(c=>isVisible(s,c,look)&&Math.abs(delta(bearing(s,c),look))<5&&c.kind==='merchant').sort((a,b)=>Math.abs(delta(bearing(s,a),look))-Math.abs(delta(bearing(s,b),look))).slice(0,1);
 if(!seen.length){log(s,'No merchant silhouette in the camera reticle.','warning');return false;}
 for(const ship of seen){contact(s,ship,'visual');if(!s.photos.includes(ship.id))s.photos.push(ship.id);}
 s.photoCooldown=4;log(s,`Photograph recorded. ${s.photos.length}/${s.patrol.photoGoal} merchant silhouettes.`, 'success');return true;
}
export function fire(s,id){
 return launchTorpedo(s,id);
}
export function decoy(s){
 if(s.decoys<=0||s.status!=='patrol')return false;
 s.decoys--;s.alert=Math.max(0,s.alert-35);
 s.noisemaker={x:s.x,y:s.y,depth:s.depth,heading:s.heading,speed:0,time:s.time};
 for(const v of s.ships)v.alert=Math.max(0,v.alert-50);
 log(s,'Noisemaker away. Change course and go quiet.');return true;
}
export function step(s,dt,input={}){
 if(s.status!=='patrol'||dt<=0||input.paused||input.modal)return;
 // Fixed substeps make time compression obey the same collision and resource rules.
 let left=Math.min(dt,60);while(left>0&&s.status==='patrol'){const t=Math.min(.25,left);tick(s,t,input);input.afterTick?.(s);left-=t;}
}
function patrolSweep(s,ship){
 if(ship.nextSweep===undefined||ship.disabled||s.time<ship.nextSweep)return;
 ship.nextSweep=s.time+28+rand(s)*45;
 const nearby=clamp(1-distance(ship,s)/4500,0,1);
 if(rand(s)<s.difficulty.pingDetection*nearby*operatingFraction(s.systems.sonar)){
  emitSound(s,{type:'sweep',x:ship.x,y:ship.y,depth:ship.depth??0,power:.85,vessel:ship.id});
 }
 if(rand(s)<.25*nearby*s.difficulty.detection){
  ship.report={...playerReport(s),reason:'a patrol sweep'};ship.alert=Math.max(55,ship.alert);
 }
}
function patrolReceipt(s,source){
 if(source.type==='seeker'&&source.echo&&operatingFraction(s.systems.sonar)&&source.perceived.distance<6000*operatingFraction(s.systems.sonar))observeTorpedo(s,source.echo,false);
 if(source.ownHit)report(s,'impact','Explosion heard. Possible torpedo hit.');
 if(source.type==='sweep'&&operatingFraction(s.systems.sonar)>0){
  // The receiver gets the bearing to the emission, without a range or identity.
  const c=contact(s,{id:source.vessel,x:source.x,y:source.y},'passive');
  if(c.lastSweep!==undefined&&s.time-c.lastSweep<120){
   const size=900;
   c.sweepArea={x:(Math.floor(source.x/size)+.5)*size,y:(Math.floor(source.y/size)+.5)*size,size,time:s.time};
  }
  c.lastSweep=s.time;
  report(s,'sweep','Search ping heard · bearing '+String(Math.round(c.bearing)%360).padStart(3,'0')+'°');
 }
 if(source.type==='collapse'||source.type==='settling'){
  if(source.type==='collapse')report(s,'collapse','Possible implosion heard');
  else report(s,'settling','Heavy breakup heard. Probable wreck.');
  if(operatingFraction(s.systems.sonar)>0)hearWreck(s,source);
 }
}
function tick(s,dt,input){
 // Continue older saves from the wave they last displayed.
 if(s.wavePhase===undefined)s.wavePhase=s.time*environmentAt(s).waveSpeed;
 s.time+=dt;s.pingAge+=dt;s.pingCooldown=Math.max(0,s.pingCooldown-dt);s.photoCooldown=Math.max(0,s.photoCooldown-dt);s.shock=Math.max(0,(s.shock||0)-dt);
 if(s.noisemaker&&s.time-s.noisemaker.time>32)delete s.noisemaker;
 const env=environmentAt(s);
 const previousApproach=s.search&&approachProgress(s.search);
 const approaching=s.search&&advanceApproach(s.search,dt,input.timeRate||1);
 const formationTravel=approaching&&s.battle?800*(approachProgress(s.search)-previousApproach):0;
 if(approaching&&s.operation)s.operation.lastCasualty+=dt;
 // Only the next interval uses the new weather speed. The sea keeps wall
 // time during compression while objectives and traffic keep patrol time.
 s.wavePhase+=env.waveSpeed*dt/Math.max(1,input.timeRate||1);
 env.wavePhase=s.wavePhase;
 if(s.time>=s.nextLightningAt){
  if(env.storm>.35){const angle=s.time<30?rad((input.look??(s.heading+s.scopeAngle))+(rand(s)-.5)*26):rand(s)*Math.PI*2,range=1800+rand(s)*4000,strike={id:s.soundSequence,time:s.time,x:s.x+Math.sin(angle)*range,y:s.y+Math.cos(angle)*range,height:1050+rand(s)*900,seed:Math.floor(rand(s)*1000000)};
   if(hash01(strike.seed,910)<.09){
    const exposed=s.ships.filter(v=>v.hull>0&&(v.depth??0)<=1&&distance(s,v)<6000);
    if(s.depth<=1)exposed.push(s);
    const hit=exposed[Math.floor(hash01(strike.seed,911)*exposed.length)];
    if(hit){
     strike.x=hit.x;strike.y=hit.y;strike.altitude=hit===s?9:18;
     const damage=5+Math.floor(12*hash01(strike.seed,912));
     if(hit===s)hurt(s,damage,'Lightning struck the surfaced sub.',null);
     else{hit.hull=incidentalHull(hit,damage);addDebrief(s,'Lightning struck '+hit.name+'.');}
    }
   }
   s.lightning.push(strike);emitSound(s,{type:'thunder',x:strike.x,y:strike.y,altitude:strike.height*.65,power:.8+rand(s)*.4});}
  s.nextLightningAt=s.time+18+rand(s)*36;
 }
 s.lightning=s.lightning.filter(e=>s.time-e.time<20);
 if(s.route){s.targetHeading=bearing(s,s.route);if(distance(s,s.route)<(s.route.radius||100)){s.route=null;s.targetSpeed=0;log(s,'Waypoint reached. All stop.');}}
 const diesel=updateBoat(s,dt);if(s.status!=='patrol')return;
 if(s.scopeSteerBearing!==null){s.scopeAngle=(s.scopeSteerBearing-s.heading+360)%360;if(Math.abs(delta(s.scopeSteerBearing,s.heading))<.1){s.scopeAngle=0;s.scopeSteerBearing=null;}}
 // Suppress repeated damage log spam while retaining actual damage.
 if(s.events.length>1&&s.events[0].text===s.events[1].text)s.events.splice(1,1);
 if(s.hull<=0)s.status='lost';
 let danger=0;
 for(const ship of s.ships){
   if(ship.hull<=0)continue;
   const d=distance(s,ship);
   if(operatingFraction(s.systems.sonar)>0&&(s.silent||s.speed<9)&&d<(ship.kind==='fishing'?2300:5600)*(1-env.storm*.25*Math.exp(-s.depth/80))*operatingFraction(s.systems.sonar)&&Math.floor(s.time/3)!==Math.floor((s.time-dt)/3))contact(s,ship,'passive');
   const topside=['tower','gun'].includes(input.observation)&&s.depth<=1;
   const look=input.look??((s.heading+s.scopeAngle)%360);
   if(topside?ship.kind!=='sub'&&d<env.opticalRange&&Math.abs(delta(bearing(s,ship),look))<25:isVisible(s,ship,look,env))contact(s,ship,'visual');
   else if(env.fog>.16&&ship.kind!=='sub'&&ship.lights!==false&&!ship.blackout&&d<env.lightRange&&
    (topside||input.observation==='scope'&&s.scope&&s.depth<=15&&operatingFraction(s.systems.periscope)>0&&!scopeWashed(s,env))&&
    Math.abs(delta(bearing(s,ship),look))<19&&Math.floor(s.time/3)!==Math.floor((s.time-dt)/3))contact(s,ship,'lights');
   if(approaching&&!s.battle&&!ship.report)ship.heading=(ship.heading+dt*.36)%360;
   if(s.mission==='sneaky-seamen')patrolSweep(s,ship);
   if(isOpponent(ship)&&!ship.disabled){
     const track=updateHostileTrack(s,ship,env,dt);
     if(ship.kind==='escort'||ship.kind==='sub'){
      reportHunterState(s,ship,track);
      if(track){pursueAndAttack(s,ship,track,dt,dropDepthCharge,launchHostileTorpedo);danger=Math.max(danger,ship.alert);}
     }
   }
   if(ship.disabled)ship.speed=0;
   const travel=approaching&&s.battle&&!ship.report&&!ship.disabled?formationTravel:ship.speed*.514444*dt;
   ship.x+=Math.sin(rad(ship.heading))*travel;ship.y+=Math.cos(rad(ship.heading))*travel;

 }
 if(s.mission==='tiebreaker'&&!approaching)updateFleetBattle(s);
 if(s.convoy){updateConvoyRaid(s,dt,approaching,dropDepthCharge);updateLamp(s,env,input,dt);}
 if(s.search&&!s.search.located){
  if(s.site){
   const surfaceSight=s.site.kind==='surface'&&['scope','tower','gun'].includes(input.observation)&&
    (input.observation==='scope'?s.scope&&s.depth<=15&&!scopeWashed(s,env):s.depth<=1)&&
    distance(s,s.site)<env.opticalRange&&Math.abs(delta(bearing(s,s.site),input.look??s.heading))<19;
   const close=separation(s,s.site)<120||s.drone.mode==='remote'&&separation(s.drone,s.site)<80;
   if(surfaceSight||close){s.search.located=true;log(s,'Mission site located. Position marked on chart.','success');}
  }else{
   for(const c of s.contacts)if((c.identified||c.kind==='sub'&&c.fix)&&s.search.targets.includes(c.id)&&!s.search.recognized.includes(c.id))s.search.recognized.push(c.id);
   if(s.search.recognized.length===s.search.targets.length){
    s.search.located=true;log(s,'Search contacts accounted for. Chart now shows their individual tracks.');
   }
  }
 }
 resolveTraffic(s,hurt);
 s.alert=clamp(Math.max(danger,s.alert-dt*.65),0,100);
 for(const c of s.contacts){c.age+=dt;c.confidence=Math.max(.05,c.confidence-dt*.0006);}
 s.contacts=s.contacts.filter(c=>c.age<240||c.fix?.source==='satellite'&&s.time-c.fix.time<900);
 const packet=updateRecon(s,dt);if(packet&&applyReconPacket(s,packet))log(s,`Orbital reconnaissance received. ${packet.tracks.length} timestamped surface tracks.`,'success');
 updateCombat(s,dt);
 for(const b of s.blasts){b.delay-=dt;if(b.delay<=0&&!b.exploded){b.exploded=true;b.explodedAt=s.time;if(s.convoy&&b.convoyCharge)resolveConvoyCharge(s,b);emitSound(s,{type:'blast',x:b.x,y:b.y,depth:b.depth,power:1.2});}if(b.exploded)b.age=s.time-b.explodedAt;}
 s.blasts=s.blasts.filter(b=>b.age<5);
 for(const shell of s.shells){shell.delay-=dt;if(shell.delay<=0&&!shell.hit){shell.hit=true;emitSound(s,{type:'detonation',x:shell.x,y:shell.y,depth:0,power:.8});
  const range=distance(s,shell),hit=s.depth<7&&range<65;
  if(hit)hurt(s,Math.max(4,24*(1-range/65)),'Shell impact near the hull.','engine');
  addDebrief(s,hit?'An escort shell struck close enough to damage the hull.':s.depth>=7?'You were below the surface shell’s damage zone when it arrived.':'An escort shell splashed wide of your sub.');
 }}
 s.shells=s.shells.filter(p=>p.delay>-3);
 updateAcoustics(s,(source,d)=>{
  if(d<210){replayEvent(s,{kind:'blast',point:{x:source.x,y:source.y,depth:source.depth}});hurt(s,Math.max(3,36*(1-d/210)),'Depth charge shock. Damage control responding.',null,source);addDebrief(s,'An underwater explosion was close enough to damage your sub.');}
  else if(d<2500){log(s,'Depth charge detonation. That pattern missed.');addDebrief(s,'The sub was outside the depth-charge damage zone when it detonated.');}
 },source=>patrolReceipt(s,source));
 s.torpedoTracks=s.torpedoTracks.filter(t=>s.time-t.time<35);
 updateDrone(s,dt,diesel);
 if(input.observation){
  const rov=input.observation==='drone',eye=rov?s.drone:s;
  const optical=rov?s.drone.mode==='remote'&&operatingFraction(s.drone.camera)>0:input.observation==='scope'?s.scope&&s.depth<=15&&operatingFraction(s.systems.periscope)>0&&!scopeWashed(s,env):s.depth<=1;
  if(optical)for(const v of s.ships){
   if(rov&&(s.convoy||s.mission==='tiebreaker')&&v.hull>0&&Math.hypot(distance(eye,v),eye.depth-(v.depth||0))<70*operatingFraction(s.drone.camera)&&Math.abs(delta(bearing(eye,v),input.look??eye.heading))<25)contact(s,v,'visual');
   if(v.hull>0||v.wreckMark?.observed)continue;
   const depth=(v.kind==='sub'?v.depth:0)+(v.sinkDepth||0);
   if((rov?Math.hypot(distance(eye,v),eye.depth-depth)<70*operatingFraction(s.drone.camera):depth<5&&distance(s,v)<Math.min(1200,env.opticalRange)*(input.observation==='scope'?operatingFraction(s.systems.periscope):1))&&Math.abs(delta(bearing(eye,v),input.look??eye.heading))<25){
    v.wreckMark={x:v.x,y:v.y,observed:true};report(s,'wreck','Wreck sighted. Position marked on chart.');
   }
  }
 }
 if(s.mission==='shadow'&&s.noise<27&&s.depth>15){
  const listeningRange=4000*operatingFraction(s.systems.sonar);
  if(s.ships.some(c=>c.kind==='merchant'&&c.hull>0&&distance(s,c)<listeningRange))s.trackTime+=dt;
 }
 const done=objectiveComplete(s,dt);
 if(s.convoy&&s.status==='patrol'){
  const limit=MISSIONS.find(m=>m.id===s.mission).objective.lossLimit;
  if(convoyLosses(s)>=limit){s.status='convoy-lost';addDebrief(s,'Two more convoy vessels were lost after Plover.');}
  else if(done){s.status='won';addDebrief(s,'The hunter sank. The surviving convoy is clear.');}
 }
 if(s.mission==='sneaky-seamen'&&done&&s.status==='patrol'){s.status='won';log(s,'Gate B reached. Patrol corridor cleared.','success');}
 if(s.status==='patrol'&&done&&s.phase==='objective'){
  s.phase='extract';
  if(s.mission==='tiebreaker'){log(s,'Command confirms a two-vessel lead. Extraction open. Stay to assist or surface at pickup.','success');addDebrief(s,'The friendly fleet earned its two-vessel lead. Extraction opened.');}
  else if(!['intercept','seek-and-destroy','big-kahuna'].includes(s.mission))log(s,'Objective complete. Return to extraction and surface for pickup.','success');
 }
 if(s.status==='patrol'&&s.phase==='extract'&&distance(s,s.home)<400&&s.depth<=1){s.status='won';log(s,'Patrol complete. Surfaced at pickup. Sub and crew home safely.','success');}
 if(s.mission==='tiebreaker'&&s.phase==='objective'&&s.status==='patrol'&&sidesAfloat(s.ships).friendly<2){s.status='expired';addDebrief(s,'Too few friendly vessels remained to establish the lead. Command recalled the patrol.');}
 const patrolWindow=s.search?5400+s.search.protectedTime:1800;
 if(s.time>patrolWindow&&s.status==='patrol'&&!(s.mission==='tiebreaker'&&s.phase==='extract')){s.status='expired';log(s,'Patrol window closed. Command orders withdrawal.','warning');}
}
export function save(s){return JSON.stringify(s);}
export function dropDepthCharge(s,{x,y,depth,delay=7,kind='charge'}){const charge={id:s.soundSequence++,x,y,depth,delay,totalDelay:delay,age:0,exploded:false,kind};s.blasts.push(charge);return charge;}
export function restore(raw){try{
 const s=JSON.parse(raw);if(!s||s.version!==1||!MISSIONS.some(m=>m.id===s.mission)||!['patrol','won','lost','compromised','expired','convoy-lost'].includes(s.status))return null;
 if(s.mission!=='wolf-in-the-henhouse'&&(s.convoy!==undefined||s.status==='convoy-lost'))return null;
 if(s.wavePhase!==undefined&&(!Number.isFinite(s.wavePhase)||s.wavePhase<0))return null;
 // Patrols saved before the orbit option existed always used station views.
 s.difficulty=patrolDifficulty({orbitCamera:false,instantReplay:false,...s.difficulty});
 if(s.torpedoTracks===undefined)s.torpedoTracks=[];
 if(!validTracks(s.torpedoTracks,s.time))return null;
 s.debrief??=[];
 if(!validDebrief(s.debrief,s.time)||s.patrolId!==undefined&&(typeof s.patrolId!=='string'||!/^[a-f0-9]{32}$/.test(s.patrolId)))return null;
 if(s.noisemaker!==undefined&&!validReport(s.noisemaker,s.time))return null;
 // Migrate existing v1 patrols without discarding their progress or drone state.
 if(s.recon===undefined)s.recon=freshRecon();if(s.reconArchivedSequence===undefined)s.reconArchivedSequence=0;if(s.photoArchive===undefined)s.photoArchive=[];if(s.photoSequence===undefined)s.photoSequence=1;
 if(!validateReconState(s.recon)||!Array.isArray(s.photoArchive)||s.photoArchive.length>24||!Number.isSafeInteger(s.photoSequence)||s.photoSequence<1)return null;
 if(!s.photoArchive.every(p=>validPhoto(p)&&Number.isSafeInteger(p.id)&&p.id>0)||new Set(s.photoArchive.map(p=>p.id)).size!==s.photoArchive.length||s.photoArchive.reduce((n,p)=>n+p.image.length,0)>PHOTO_BUDGET)return null;
 photoArchive(s);
 if(s.scopeAngle===undefined)s.scopeAngle=0;
 if(s.scopeSteerBearing===undefined)s.scopeSteerBearing=null;
 if(s.environment===undefined){s.environment=makeEnvironment(s.rng);delete s.environment.chartSeed;}
 if(s.lightning===undefined)s.lightning=[];if(s.acoustics===undefined)s.acoustics=[];
 if(s.nextLightningAt===undefined)s.nextLightningAt=s.time+8;if(s.soundSequence===undefined)s.soundSequence=1;
 if(s.patrol===undefined)s.patrol={seed:s.environment.seed,photoGoal:2,trackGoal:180,variant:0};
 if(s.plantVersion===undefined){
  if(s.systems)for(const key of ['diesel','fuelTank','batteryBank','tubes']){
   s.systems[key]=key==='diesel'?s.systems.engine:100;
   if(s.repairLimits)s.repairLimits[key]=key==='diesel'?s.repairLimits.engine:100;
  }
 }else if(s.plantVersion!==1||![s.fuelLeak,s.fuelFire].every(Number.isFinite)||s.fuelLeak<0||s.fuelLeak>1||s.fuelFire<0||s.fuelFire>24||typeof s.cookoff!=='boolean')return null;
 for(const [k,v] of Object.entries(freshCombat()))if(s[k]===undefined)s[k]=v;
 if(!validTubeTimes(s.tubeReadyAt,s.time)||!Number.isInteger(s.torps)||s.torps<0)return null;
 if(s.outerHull===undefined)s.outerHull=s.hull;
 for(const [k,v] of Object.entries({...freshMotion(),towerAngle:0,towerPitch:0,cavitation:0,propRpm:0}))if(s[k]===undefined)s[k]=v;
 if(s.systems===undefined)s.systems=freshSystems();else if(s.systems&&s.systems.deckgun===undefined)s.systems.deckgun=100;if(s.shells===undefined)s.shells=[];
 if(s.site===undefined)s.site=null;if(s.operation===undefined)s.operation=null;
 if(s.drone){for(const [k,v] of Object.entries({...freshDrone(),targetDepth:s.drone.depth,targetHeading:s.drone.heading}))if(s.drone[k]===undefined)s.drone[k]=v;}
 const template=createGame(s.mission);for(const [k,v] of Object.entries(template)){if(typeof v==='number'&&!Number.isFinite(s[k]))return null;if(typeof v==='boolean'&&typeof s[k]!=='boolean')return null;if(Array.isArray(v)&&!Array.isArray(s[k]))return null;}
 if(s.outerHull<0||s.outerHull>100||s.criticalExposure<0||![0,1,2].includes(s.pressureAlarm)||!s.collisionHits||Array.isArray(s.collisionHits)||typeof s.collisionHits!=='object'||!Object.values(s.collisionHits).every(t=>Number.isFinite(t)&&t>=0&&t<=s.time))return null;
 if(!isDieselMode(s.dieselMode))return null;
 if(!['objective','extract'].includes(s.phase)||!['electric','diesel'].includes(s.engine)||!s.home||!Number.isFinite(s.home.x)||!Number.isFinite(s.home.y)||!s.drone||!['stowed','remote','return','lost'].includes(s.drone.mode))return null;
 if(s.environment?.chartSeed!==undefined&&(!Number.isInteger(s.environment.chartSeed)||s.environment.chartSeed<0||s.environment.chartSeed>0xffffffff))return null;
 if(!s.environment||!WEATHER[s.environment.startWeather]||!Number.isFinite(s.environment.startHour)||!Number.isFinite(s.environment.seed)||typeof s.environment.changing!=='boolean')return null;
 if(!s.systems||Object.keys(freshSystems()).some(k=>!Number.isFinite(s.systems[k])||s.systems[k]<0||s.systems[k]>100))return null;
 s.repairLimits=readLimits(BOAT_PARTS,{...s.systems,hull:s.hull},s.repairLimits);
 s.drone.repairLimits=readLimits(DRONE_PARTS,s.drone,s.drone.repairLimits);
 if(!s.repairLimits||!s.drone.repairLimits)return null;
 if(!s.patrol||!['seed','photoGoal','trackGoal','variant'].every(k=>Number.isFinite(s.patrol[k]))||s.scopeSteerBearing!==null&&!Number.isFinite(s.scopeSteerBearing))return null;
 if(s.runSetting<100||s.runSetting>MAX_RUN||!s.reports.every(r=>r&&typeof r.id==='string'&&typeof r.text==='string'&&Number.isFinite(r.time)&&r.time<=s.time))return null;
 if(!s.gun||!['ammo','cooldown','shots','angle','elevation'].every(k=>Number.isFinite(s.gun[k])))return null;
 if(!s.airSupport||!['idle','arming','airborne','spent'].includes(s.airSupport.status)||!s.airSupport.base||!['x','y'].every(k=>Number.isFinite(s.airSupport.base[k])))return null;
 for(const k of ['requestedAt','launchAt'])if(s.airSupport[k]!==null&&!Number.isFinite(s.airSupport[k]))return null;
 if(s.airSupport.lastKnown&&!validReport(s.airSupport.lastKnown,s.time,true))return null;
 for(const p of s.aircraft)if(!['x','y','altitude','heading','speed','hull'].every(k=>Number.isFinite(p[k]))||typeof p.id!=='string')return null;
 for(const p of s.gunRounds)if(!['id','x','y','altitude','vx','vy','vz','age'].every(k=>Number.isFinite(p[k]))||!['player','aircraft'].includes(p.owner)||typeof p.tracer!=='boolean')return null;
 for(const p of s.impacts)if(!['id','x','y','altitude','time'].every(k=>Number.isFinite(p[k])))return null;
 for(const k of ['hull','mobility','buoyancy','camera','verticalSpeed','collisionCooldown','returnStage','returnClearance','returnHoldSide','returnHoldForward'])if(!Number.isFinite(s.drone[k]))return null;
 if(['undersea-rescue','surface-rescue','survey'].includes(s.mission)){
  if(!s.site||!s.operation||!['x','y','depth','heading'].every(k=>Number.isFinite(s.site[k]))||!['surface','wreck','sub'].includes(s.site.kind)||typeof s.site.name!=='string')return null;
  s.site.hull??=100;if(!Number.isFinite(s.site.hull)||s.site.hull<0||s.site.hull>100)return null;
  const o=s.operation;if(!['rescued','remaining','dead','assessment','boarding','diverReturn','scan','lastCasualty'].every(k=>Number.isFinite(o[k])&&o[k]>=0)||!['known','holding','active','completed'].every(k=>typeof o[k]==='boolean')||!Array.isArray(o.photoAngles)||!o.photoAngles.every(Number.isFinite))return null;
 }else if(s.site||s.operation)return null;
 for(const p of s.shells)if(!['id','x','y','depth','delay','fromX','fromY','total'].every(k=>Number.isFinite(p[k])))return null;
 for(const k of ['x','y','heading','depth','battery','speed','targetSpeed','targetDepth','targetHeading'])if(!Number.isFinite(s.drone[k]))return null;
 if(s.route&&(!Number.isFinite(s.route.x)||!Number.isFinite(s.route.y)))return null;
 for(const ship of s.ships)if(!ship||typeof ship.id!=='string'||typeof ship.name!=='string'||!['merchant','fishing','escort','sub','carrier'].includes(ship.kind)||!['x','y','heading','speed','hull','alert','attack'].every(k=>Number.isFinite(ship[k])))return null;
 for(const v of s.ships){
  for(const key of ['sinkDepth','sunkAt','nextCreak','collapsedAt','nextSweep','neutralHitAt'])if(v[key]!==undefined&&(!Number.isFinite(v[key])||v[key]<0))return null;
  if(v.wreckMark&&(!Number.isFinite(v.wreckMark.x)||!Number.isFinite(v.wreckMark.y)||typeof v.wreckMark.observed!=='boolean'))return null;
 }
 if(s.ships.some(ship=>ship.report!==undefined&&!validReport(ship.report,s.time)))return null;
 if(s.ships.some(ship=>ship.torpedoDecoys!==undefined&&(!Number.isInteger(ship.torpedoDecoys)||ship.torpedoDecoys<0||ship.torpedoDecoys>ENEMY_DECOY_SUPPLY)))return null;
 if(!validMissionTargets(s))return null;
 if(s.difficulty.longPatrol?!validSearch(s):s.search!==undefined)return null;
 for(const c of s.contacts)if(!c||typeof c.id!=='string'||typeof c.label!=='string'||!['bearing','range','confidence','age','x','y'].every(k=>Number.isFinite(c[k]))||c.depthEstimate!==undefined&&!Number.isFinite(c.depthEstimate)||c.courseEstimated!==undefined&&typeof c.courseEstimated!=='boolean')return null;
 if(s.drone.nosePitch!==null&&(!Number.isFinite(s.drone.nosePitch)||Math.abs(s.drone.nosePitch)>maxNosePitch))return null;
 if(s.drone.returnStage<0||s.drone.returnStage>3||!Number.isInteger(s.drone.returnStage))return null;
 for(const c of s.contacts){
  for(const side of [c.side,c.probableSide])if(side!==undefined&&(!s.convoy&&s.mission!=='tiebreaker'||!['friendly','hostile'].includes(side)))return null;
  if(c.passiveAt!==undefined&&(!Number.isFinite(c.passiveAt)||c.passiveAt<0||c.passiveAt>s.time||![c.passiveBearing,c.passiveX,c.passiveY].every(Number.isFinite)))return null;
  if(c.lastSweep!==undefined&&(!Number.isFinite(c.lastSweep)||c.lastSweep<0||c.lastSweep>s.time))return null;
  if(c.sweepArea&&(!['x','y','time','size'].every(k=>Number.isFinite(c.sweepArea[k]))||c.sweepArea.size!==900||c.sweepArea.time>s.time))return null;
  if(c.fix&&!fixContact({},c.fix))return null;const old=/^Sierra (\d+)$/.exec(c.label);if(old)c.label=designation(Number(old[1]));}
 for(const e of s.events)if(!e||typeof e.text!=='string'||typeof e.kind!=='string'||!Number.isFinite(e.t))return null;
 if(!s.projectiles.every(p=>restoreTorpedo(s,p)))return null;
 for(const b of s.blasts){if(!['x','y','depth','delay','age'].every(k=>Number.isFinite(b[k])))return null;if(b.id===undefined)b.id=s.soundSequence++;if(b.totalDelay===undefined)b.totalDelay=Math.max(1,b.delay);if(b.exploded===undefined)b.exploded=b.age>0;if(b.exploded&&b.explodedAt===undefined)b.explodedAt=s.time-b.age;}
 s.blasts=s.blasts.filter(b=>{
  if(b.kind!=='weapon'||b.exploded)return true;
  restoreIncomingRun(s,b);return false;
 });
 for(const e of s.lightning)if(!['id','time','x','y','height','seed'].every(k=>Number.isFinite(e[k])))return null;
 for(const e of s.acoustics){
  if(!['id','time','x','y','power'].every(k=>Number.isFinite(e[k]))||!['thunder','blast','detonation','gunfire','seeker','creak','collapse','settling','sweep'].includes(e.type)||typeof e.heard!=='boolean')return null;
  if(['sweep','collapse','settling'].includes(e.type)&&!s.ships.some(v=>v.id===e.vessel))return null;
  if(e.echo!==undefined&&(e.type!=='seeker'||!validEcho(e.echo,e.time)||e.echo.time!==e.time))return null;
  if(e.ownHit!==undefined&&typeof e.ownHit!=='boolean')return null;
 }
 return s;
}catch{return null;}}
