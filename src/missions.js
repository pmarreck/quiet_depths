import {recordLocalLaunch} from './mess-watch.js';
import {carrierId,carrierGroup,validCarrier} from './carrier.js';
import {setupHenhouse,validConvoy,convoyLosses} from './convoy-watch.js';
import {advanceFleetAction,fleetTheater,validTheater} from './fleet-action.js';
import {emitSound,launchNoise} from './acoustics.js';
import {replayEvent} from './instant-replay.js';
import {operatingFraction} from './equipment.js';
import {clamp,rad,bearing,delta,distance,separation,bottom,log} from './mechanics.js';
import {hash01,TIMES} from './environment.js';
import {MISSIONS,allSunk,convoyTransportIds,evaluateObjective} from './mission-objective.js';
import {addScan,scanRate,surveyComplete,surveyCriteria} from './wreck-survey.js';
import {rescueCriteriaFor,stationKeeping} from './rescue-operation.js';
export {MISSIONS};

export function updateFleetBattle(s){
 advanceFleetAction(s,(ship,v,fired)=>{
  const p=fired?v.from:v.to;
  if(fired&&v.underwater){recordLocalLaunch(s,p);launchNoise(s,{...p,depth:-p.altitude});}
  const type=fired?(v.underwater?'seeker':'gunfire'):'detonation';
  emitSound(s,{type,x:p.x,y:p.y,depth:Math.max(0,-p.altitude),altitude:p.altitude,power:fired?.55:.9});
  if(!fired){
   const kind=v.damage&&v.underwater?'torpedo':!v.damage&&p.altitude>=-2?'splash':'hit';
   s.impacts.push({id:s.weaponSequence++,x:p.x,y:p.y,altitude:p.altitude,time:s.time,kind});
   if(v.underwater&&v.damage)replayEvent(s,{kind:'torpedo',shot:v.id,target:ship.id,enemy:true,point:{x:p.x,y:p.y,depth:-p.altitude}});
  }
 });
}

export function patrolSetup(state){
 const env=state.environment;
 const timeOfDay=Object.keys(TIMES).find(key=>TIMES[key].hour===env.startHour);
 return {mission:state.mission,seed:state.patrol.seed,options:{
  timeOfDay:timeOfDay??'random',weather:env.startWeather,changing:env.changing,difficulty:{...state.difficulty}
 }};
}

export function parsePatrolSeed(text){
 const digits=text.trim();
 if(digits==='')return null;
 if(!/^[0-9]{1,10}$/.test(digits))return undefined;
 const seed=Number(digits);
 return seed<=0xffffffff?seed:undefined;
}

export function validMissionTargets(s){
 if(s.mission==='wolf-in-the-henhouse')return validConvoy(s);
 if(s.mission==='tiebreaker')return validTheater(s);
 if(s.mission==='big-kahuna'){
  const carriers=s.ships.filter(v=>v.kind==='carrier'||v.id===carrierId);
  return carriers.length===1&&carriers[0].kind==='carrier'&&carriers[0].id===carrierId&&carriers[0].military===true&&validCarrier(carriers[0])&&(s.phase==='objective'||carriers[0].hull===0);
 }
 if(s.mission==='sneaky-seamen')return s.departure&&Number.isFinite(s.departure.x)&&Number.isFinite(s.departure.y)&&s.ships.some(v=>v.kind==='sub'&&v.military)&&s.ships.some(v=>v.kind==='merchant');
 if(s.mission==='intercept')return s.ships.some(ship=>ship.id==='cobalt');
 if(s.mission==='seek-and-destroy-sub')return s.ships.some(ship=>ship.id==='echo'&&ship.kind==='sub'&&ship.military===true);
 if(s.mission!=='seek-and-destroy')return true;
 const valid=convoyTransportIds.every(id=>{
  const matches=s.ships.filter(ship=>ship.id===id);
  return matches.length===1&&matches[0].kind==='merchant'&&matches[0].military===true;
 });
 return valid&&(s.phase==='objective'||allSunk(s.ships,convoyTransportIds));
}
export function setupOperation(s,seed){
 s.site=null;s.operation=null;
 if(!['undersea-rescue','surface-rescue','survey'].includes(s.mission))return;
 const surface=s.mission==='surface-rescue',survey=s.mission==='survey',x=1430+hash01(seed,801)*330,y=420+hash01(seed,802)*450;
 s.site={x,y,hull:100,depth:surface?2:bottom(x,y,s.environment.chartSeed)-5,heading:35+hash01(seed,803)*100,kind:surface?'surface':survey?'wreck':'sub',name:surface?['R/V Halcyon','M/V Solway','R/V Northstar'][Math.floor(hash01(seed,804)*3)]:survey?['SS Aster, 1912','SS Caledonia, 1906','SS Pelican, 1921'][Math.floor(hash01(seed,804)*3)]:['SS-118 Lantern','SS-142 Cormorant','SS-107 Narwhal'][Math.floor(hash01(seed,804)*3)],speed:0};
 s.operation={rescued:0,remaining:hash01(seed,811)<.08?0:8+Math.floor(hash01(seed,812)*8),dead:0,known:false,assessment:0,boarding:0,diverReturn:0,holding:false,active:false,scan:0,photoAngles:[],lastCasualty:240,completed:false,find:null};
 const start={x:x-260-hash01(seed,805)*120,y:y-200-hash01(seed,806)*180},heading=bearing(start,s.site),depth=surface?0:35+Math.floor(hash01(seed,807)*20);
 Object.assign(s,{...start,depth,targetDepth:depth,heading,targetHeading:heading,speed:3,targetSpeed:3,scope:surface});
 s.home={x:start.x-250-hash01(seed,808)*150,y:start.y-350-hash01(seed,809)*180};
 const hostile=hash01(seed,813)>.4;
 const escort=s.ships.find(v=>v.id==='kestrel');Object.assign(escort,{x:x+1200,y:y+700,heading:230,speed:5,alert:hostile?35:0});
 // Civil traffic remains distant; an optional hunter is the pressure on a rescue.
 if(!hostile||survey)s.ships=s.ships.filter(v=>v.kind!=='escort'&&v.kind!=='sub');
 log(s,s.difficulty.longPatrol?'Last report received. Search the briefed area for the mission site.':survey?'Wreck coordinates received. Plot an approach and inspect the reef shelf.':'Distress coordinates received. Survivor count unknown. Time matters.');
}
export function operationApproach(s){
 if(!s.site||s.search&&!s.search.located)return null;
 return {x:s.site.x-55,y:s.site.y,depth:s.site.kind==='surface'?0:Math.max(0,s.site.depth-11),radius:8};
}
export function operationConditions(s){
 if(!s.site)return null;
 const d=distance(s,s.site),surface=s.site.kind==='surface',depth=surface?0:s.site.depth-11;
 return {range:d,depth,...stationKeeping(d,s.speed,s.depth-depth,rescueCriteriaFor(s.site.kind))};
}
export function startRescue(s){
 const c=operationConditions(s);
 if(!c?.onStation||s.status!=='patrol'||s.mission==='survey'||s.operation.completed)return false;
 s.route=null;s.targetSpeed=0;s.targetDepth=c.depth;
 log(s,c.holding?'Rescue team on station. Hold here for transfers.':'Holding station. Moving to rescue depth.');
 return true;
}
export function casualtyDeadline(s){
 const o=s.operation,seed=s.patrol.seed;
 return o.lastCasualty+(o.dead===0?145+hash01(seed,821)*90:105+hash01(seed,822+o.dead)*110);
}
export function dronePhotograph(s){
 const d=s.drone,o=s.operation,site=s.site;
 if(s.mission!=='survey'||!o||!['remote','return'].includes(d.mode)||s.photoCooldown>0)return {ok:false,text:'No survey camera task available.'};
 const reach=85*operatingFraction(d.camera);
 if(!reach)return {ok:false,text:'ROV camera offline.'};
 if(separation(d,site)>reach||separation(d,site)<8||Math.abs(delta(bearing(d,site),d.heading))>32)return {ok:false,text:`Aim at the wreck within ${Math.floor(reach)} m. Inspect from above or beside it.`};
 const angle=bearing(site,d);
 const c=surveyCriteria;
 if(o.photoAngles.some(a=>Math.abs(delta(angle,a))<c.photoSeparation))return {ok:false,text:'This side is already recorded. Move around the wreck for another angle.'};
 o.photoAngles.push(angle);s.photoCooldown=4;log(s,`Wreck photograph ${o.photoAngles.length}/${c.photographs} recorded.`,'success');return {ok:true,text:`Survey image ${o.photoAngles.length}/${c.photographs} recorded.`};
}
const SURVEY_FINDS=['A brass ship’s bell, engraved ASTER · 1912. A museum will want her story.','A sealed navigation journal and ceramic cargo. The archaeology team is delighted.','Silver trade coins in a broken strongbox. Treasure, with a provenance worth preserving.'];
export function updateSurvey(s,dt,criteria=surveyCriteria){
 const o=s.operation;if(!o||o.completed)return false;
 const c=operationConditions(s);o.holding=c.holding;
 const rate=scanRate({range:c.range,vertical:Math.abs(s.depth-s.site.depth),speed:s.speed,sonar:s.systems.sonar},criteria);
 o.active=rate>0;if(o.active)o.scan=addScan(o.scan,rate,dt,criteria);
 if(surveyComplete(o,criteria)){o.completed=true;o.find=SURVEY_FINDS[Math.floor(hash01(s.environment.seed,819)*SURVEY_FINDS.length)];log(s,o.find,'success');}
 return o.completed;
}
export function updateOperation(s,dt){
 if(s.mission==='survey')return updateSurvey(s,dt);
 return updateRescue(s,dt,rescueCriteria(s));
}
const rescueCriteria=s=>rescueCriteriaFor(s.site?.kind);
export function updateRescue(s,dt,rules){
 const o=s.operation;if(!o||o.completed)return false;
 const c=operationConditions(s);o.holding=c.holding;
 if(c.holding){o.active=true;o.assessment+=dt;
  if(o.assessment>=rules.assessmentSeconds&&!o.known){o.known=true;log(s,`Rescue team report: ${o.remaining} survivors still awaiting transfer.`,'success');}
  if(o.remaining>0){o.boarding+=dt;if(o.boarding>=rules.transferSeconds){o.boarding-=rules.transferSeconds;o.remaining--;o.rescued++;log(s,`Survivor aboard. ${o.rescued} rescued.`,'success');}}
  if(o.known&&o.remaining===0){o.diverReturn+=dt;if(o.diverReturn>=rules.returnSeconds){o.completed=true;o.active=false;log(s,o.rescued?`Rescue team recovered. ${o.rescued} survivors safe aboard.`:'Rescue search complete. No survivors found. Team recovered.',o.rescued?'success':'warning');}}
 }else{o.active=false;o.boarding=0;o.diverReturn=0;}
 if(s.time>casualtyDeadline(s)&&o.remaining>0){o.lastCasualty=s.time;o.remaining--;o.dead++;if(o.known)log(s,'A survivor’s signal has stopped. Rescue window is narrowing.','warning');}
 if(s.site.kind==='surface'){
  const age=s.time-(s.search?.protectedTime??0);
  s.site.depth=Math.min(bottom(s.site.x,s.site.y,s.environment.chartSeed)-5,2+age/500+Math.max(0,age-(860+hash01(s.patrol.seed,820)*220))*.35);
  if(s.site.depth>15&&o.remaining>0){o.dead+=o.remaining;o.remaining=0;log(s,'The casualty has gone under. No further survivor signals. Recover the rescue team.','damage');}
 }
 return o.completed;
}
export function objectiveState(s){
 if(s.convoy)return {label:'PROTECT THE CONVOY',text:'Sink the hunter. Further convoy losses: '+convoyLosses(s)+'/2.',progress:'',advice:''};
 if(s.site&&s.search&&!s.search.located)return {label:'FIND THE MISSION SITE',text:'Search the last reported area.',progress:'',advice:'Look for the casualty or wreck. A close sonar ping can resolve the site.'};
 if(s.mission==='tiebreaker')return {label:s.phase==='extract'?'EXTRACTION OPEN':'TURN THE TIDE',text:s.phase==='extract'?'Stay to assist or surface at extraction.':'Put the friendly fleet two vessels ahead. Your sub is excluded.',progress:s.phase==='extract'?'CLEARED':'',advice:''};
 if(s.mission==='big-kahuna')return {label:'BIG KAHUNA',text:'Sink fleet carrier Solstice and return to extraction',progress:s.ships.find(v=>v.id===carrierId)?.wreckMark?'WRECK MARKED':'',advice:''};
 if(s.mission==='sneaky-seamen')return {label:'GATE A → GATE B',text:'Reach Gate B at any depth',progress:(distance(s,s.home)/1000).toFixed(1)+' km',advice:'The convoy is expecting you.'};
 if(s.mission==='seek-and-destroy-sub')return {label:'HUNT OR WITHDRAW',text:'Surface at extraction to survive the patrol',progress:s.ships.filter(ship=>ship.wreckMark).length+' WRECK SITES',advice:''};
 if(s.mission==='seek-and-destroy')return {label:'SINK THE CONVOY',text:'Find and sink the military transports',progress:s.ships.filter(ship=>ship.wreckMark).length+' WRECK SITES',advice:''};
 if(s.operation){const o=s.operation,c=operationConditions(s),r=rescueCriteria(s);
  if(s.mission==='survey'){
   const camera=s.difficulty?.drone!==false&&s.drone.mode!=='lost',v=surveyCriteria;
   const tally=Math.floor(o.scan)+'/'+v.scanSeconds,prefix=o.active?'Scanning. ':s.drone.mode==='lost'?'ROV lost. ':'';
   return {label:'SURVEY THE WRECK',text:tally+' s scan'+(camera?' · '+o.photoAngles.length+'/'+v.photographs+' camera angles':''),
    progress:tally,advice:o.find||prefix+`Your sub scans automatically at ${v.slowestKnots}–${v.fastestKnots} kn, within ${v.horizontalRange} m horizontally and ${v.verticalRange} m vertically. Slow passes add up.`};
  }
  return {label:s.site.kind==='surface'?'RECOVER SURVIVORS':'DIVER RESCUE',text:`${o.rescued} aboard · ${o.known?o.remaining:'?'} awaiting rescue`,progress:o.rescued+'/'+(o.known?o.rescued+o.remaining:'?'),advice:o.completed?`${o.rescued} survivors and the rescue team aboard. Surface at extraction.`:c.holding?(o.known?`Hold position. Transfers every ${r.transferSeconds} seconds.`:'Hold position. Rescue team assessing the casualty…'):`Hold ${r.closestRange}–${r.farthestRange} m away · depth ${c.depth.toFixed(0)} m ±${r.depthTolerance} · ≤${r.fastestKnots} kn`};
 }
 return {label:s.mission==='recon'?'PHOTOGRAPH THE CONVOY':s.mission==='intercept'?'INTERCEPT '+(s.ships.find(v=>v.id==='cobalt')?.name||'MILITARY FREIGHTER').toUpperCase():'LISTEN WITHOUT BEING SEEN',text:s.mission==='recon'?`Photograph ${s.patrol.photoGoal} different merchant ships`:s.mission==='shadow'?`Track quietly for ${s.patrol.trackGoal} seconds`:MISSIONS.find(m=>m.id===s.mission).short,progress:s.mission==='recon'?s.photos.length+'/'+s.patrol.photoGoal:s.mission==='shadow'?Math.min(s.patrol.trackGoal,Math.floor(s.trackTime))+'/'+s.patrol.trackGoal:'0/1',advice:''};
}
export const objectiveComplete=(s,dt)=>evaluateObjective(s,dt,{rescue:updateRescue,survey:updateSurvey});
export function randomizePatrol(s,seed){
 const h=n=>hash01(seed,n),heading=220+h(21)*65,start={x:(h(22)-.5)*500,y:(h(23)-.5)*500};
 s.patrol={seed,startingTorpedoes:s.torps,photoGoal:2+Math.floor(h(24)*2),trackGoal:150+30*Math.floor(h(25)*4),variant:1+Math.floor(h(26)*999)};
 Object.assign(s,{...start,heading:20+h(27)*35,targetHeading:20+h(27)*35});
 s.home={x:start.x-1100-h(28)*650,y:start.y-1000-h(29)*650};
 const convoy={x:start.x+1050+h(30)*650,y:start.y+1800+h(31)*650},speed=3.5+h(32)*3;
 const hunting=s.mission==='seek-and-destroy';
 if(hunting){
  const course=rad(-15+h(84)*85),range=2700+h(85)*1200;
  convoy.x=start.x+Math.sin(course)*range;
  convoy.y=start.y+Math.cos(course)*range;
 }
 const militaryNames=['Cobalt','Borealis','Vesper','Ironwood','Kittiwake'];
 for(const [i,v] of s.ships.entries()){
  v.x=convoy.x+(i===3?-2200:0)+(h(40+i)-.5)*800;v.y=convoy.y+(i===3?-900:0)+(h(50+i)-.5)*700;v.heading=heading+(h(60+i)-.5)*12;v.speed=v.kind==='fishing'?2+h(70+i)*2:speed+(v.kind==='escort'?2:0);v.flood=0;v.disabled=false;v.sinkDepth=0;
  if(v.id==='cobalt')v.name=militaryNames[Math.floor(h(80)*militaryNames.length)];
 }
 // Recon always has enough distinct silhouettes, without reusing a photograph.
 s.ships.push({id:'alder',name:['Alder','Seaforth','Larch'][Math.floor(h(81)*3)],kind:'merchant',military:false,x:convoy.x+400+h(82)*500,y:convoy.y+450+h(83)*300,heading,speed,hull:100,alert:0,attack:0,flood:0,disabled:false,sinkDepth:0});
 setupOperation(s,seed);
 s.events=s.events.filter(e=>!e.text.startsWith('Helm steady.'));
 if(s.mission==='wolf-in-the-henhouse'){setupHenhouse(s);return;}
 if(s.mission==='tiebreaker'){
  Object.assign(s,fleetTheater(start,seed));s.home={x:start.x-450,y:start.y-550};
  if(!s.difficulty.longPatrol)updateFleetBattle(s);
  log(s,'Lark, Marlin and Calliope fly blue forked pennants. The orange pennants are hostile. Nacre is our submarine.');
  log(s,s.difficulty.longPatrol?'Both fleets are approaching the sector. Friendly patrol areas are marked on the chart.':'Fleet action in progress. Chart rings are friendly patrol areas from the briefing. No current positions confirmed.');
  return;
 }
 if(s.mission==='big-kahuna'){
  s.ships=carrierGroup(convoy.x,convoy.y,heading,speed,h(981)<.5,h(982));
  s.airSupport.base={...convoy};
  log(s,'Fleet carrier Solstice and her escort were last reported to the northeast. No alarm has been raised.');
  return;
 }
 if(s.mission==='seek-and-destroy-sub'){
  s.ships=s.ships.filter(ship=>ship.kind==='fishing'||ship.id==='echo');
  const primary=s.ships.find(ship=>ship.id==='echo');
  Object.assign(primary,{depth:55+h(86)*40,heading:188+h(88)*60});
  if(h(89)<.36)s.ships.push({...primary,id:'echo-two',x:primary.x+700+h(90)*1200,y:primary.y+400+h(91)*1100,depth:45+h(92)*45,heading:150+h(93)*105});
  s.phase='extract';
  log(s,`Patrol ${seed}. An enemy submarine was reported in this sector. Engage or withdraw. Surface at extraction to survive.`);
  return;
 }
 if(s.mission==='sneaky-seamen'){
  s.departure={...start};
  const course=rad(30+h(920)*35),east=Math.sin(course),north=Math.cos(course),length=2700+h(921)*550;
  s.home={x:start.x+east*length,y:start.y+north*length};
  s.heading=s.targetHeading=bearing(start,s.home);
  s.ships.forEach((v,i)=>{
   const along=length*(.37+h(930+i)*.36),across=(h(940+i)-.5)*1100;
   v.x=start.x+east*along+north*across;v.y=start.y+north*along-east*across;
   if(v.kind==='escort'||v.kind==='sub')v.nextSweep=15+h(960+i)*35;
  });
  log(s,'Gate A passed. Cross the convoy patrol and reach Gate B. No attack or surfacing required.');
  return;
 }
 if(hunting){
  for(const ship of s.ships)if(convoyTransportIds.includes(ship.id))ship.military=true;
  if(h(87)>=.4)s.ships=s.ships.filter(ship=>ship.id!=='echo');
  const lastBearing=(Math.round(bearing(start,convoy)/45)*45)%360;
  if(!s.difficulty.longPatrol)log(s,`Patrol ${seed}. Last report put the convoy around bearing ${String(lastBearing).padStart(3,'0')}°. Listen for the transports and escort.`);
  return;
 }
 log(s,`Patrol ${seed}. ${s.operation?s.site.name:s.mission==='shadow'?s.patrol.trackGoal+' seconds of passive tracking':s.mission==='recon'?s.patrol.photoGoal+' merchant photographs required':s.ships[0].name+' is the objective'}.`);
}
