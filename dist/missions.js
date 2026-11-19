import {clamp,rad,bearing,delta,distance,separation,bottom,log} from './mechanics.js';
import {hash01} from './environment.js';
export const MISSIONS=[
 {id:'recon',name:'A quiet observation',type:'RECONNAISSANCE',desc:'Photograph two different merchant ships through your periscope. Leave the escort wondering if you were ever there.',short:'Photograph 2 merchant ships',minutes:'8–12 MIN',torps:4},
 {id:'intercept',name:'The long way home',type:'INTERCEPTION',desc:'Intercept the military freighter Cobalt. Confirm her silhouette before firing. The fishing boats are neutral.',short:'Sink military freighter Cobalt',minutes:'10–15 MIN',torps:4},
 {id:'shadow',name:'Just passing through',type:'SURVEILLANCE',desc:'Accumulate three minutes of quiet passive tracking within 4 km of the convoy. Do not fire. Bring the traffic intelligence home.',short:'Track convoy quietly for 180 seconds',minutes:'8–12 MIN',torps:0},
 {id:'undersea-rescue',name:'Someone is still knocking',type:'UNDERSEA RESCUE',desc:'A disabled submarine lies on the reef shelf. Hold 30–75 m from her at rescue depth, below 0.6 knots, while divers assess and recover survivors. Hostile patrols may still be nearby.',short:'Hold at the wreck; recover survivors',minutes:'8–14 MIN',torps:4},
 {id:'surface-rescue',name:'A light in the swell',type:'SURFACE RESCUE',desc:'A damaged research vessel is sinking. Surface and hold 30–85 m away, below 0.6 knots. Rescue launches bring survivors aboard. Enemy gunfire or ramming may force you to move.',short:'Surface beside the casualty; hold position',minutes:'7–12 MIN',torps:4},
 {id:'survey',name:'What the sea remembers',type:'WRECK SURVEY',desc:'Survey an old wreck on the reef shelf. Collect 45 seconds of close sonar scanning, or photograph it from three different sides with your drone. Stay within the drone’s 100 m link.',short:'Scan the wreck or take 3 drone photographs',minutes:'8–12 MIN',torps:0}
];
export function setupOperation(s,seed){
 s.site=null;s.operation=null;
 if(!['undersea-rescue','surface-rescue','survey'].includes(s.mission))return;
 const surface=s.mission==='surface-rescue',survey=s.mission==='survey',x=1650,y=650;
 s.site={x,y,depth:surface?2:bottom(x,y)-5,heading:65,kind:surface?'surface':survey?'wreck':'sub',name:surface?'R/V Halcyon':survey?'SS Aster, 1912':'SS-118 Lantern',speed:0};
 s.operation={rescued:0,remaining:hash01(seed,811)<.08?0:8+Math.floor(hash01(seed,812)*8),dead:0,known:false,assessment:0,boarding:0,diverReturn:0,holding:false,active:false,scan:0,photoAngles:[],lastCasualty:240,completed:false,find:null};
 Object.assign(s,{x:1320,y:300,depth:surface?0:48,targetDepth:surface?0:48,heading:43,targetHeading:43,speed:3,targetSpeed:3,scope:surface});
 s.home={x:1020,y:-100};
 const hostile=hash01(seed,813)>.4;
 const escort=s.ships.find(v=>v.id==='kestrel');Object.assign(escort,{x:x+1200,y:y+700,heading:230,speed:5,alert:hostile?35:0});
 // Civil traffic remains distant; an optional hunter is the pressure on a rescue.
 if(!hostile||survey)s.ships=s.ships.filter(v=>v.kind!=='escort'&&v.kind!=='sub');
 log(s,survey?'Wreck coordinates received. Plot an approach and inspect the reef shelf.':'Distress coordinates received. Survivor count unknown. Time matters.');
}
export function operationApproach(s){
 if(!s.site)return null;
 return {x:s.site.x-55,y:s.site.y,depth:s.site.kind==='surface'?0:Math.max(0,s.site.depth-11),radius:8};
}
export function operationConditions(s){
 if(!s.site)return null;
 const d=distance(s,s.site),surface=s.site.kind==='surface',depth=surface?0:s.site.depth-11;
 return {range:d,depth,holding:d>=30&&d<=(surface?85:75)&&Math.abs(s.depth-depth)<(surface?1:5)&&Math.abs(s.speed)<=.6};
}
export function dronePhotograph(s){
 const d=s.drone,o=s.operation,site=s.site;
 if(s.mission!=='survey'||!o||!['remote','return'].includes(d.mode)||s.photoCooldown>0)return {ok:false,text:'No survey camera task available.'};
 if(separation(d,site)>85||separation(d,site)<8||Math.abs(delta(bearing(d,site),d.heading))>32)return {ok:false,text:'Aim at the wreck within 85 m. Inspect from above or beside it.'};
 const angle=bearing(site,d);
 if(o.photoAngles.some(a=>Math.abs(delta(angle,a))<55))return {ok:false,text:'This side is already recorded. Move around the wreck for another angle.'};
 o.photoAngles.push(angle);s.photoCooldown=4;log(s,`Wreck photograph ${o.photoAngles.length}/3 recorded.`,'success');return {ok:true,text:`Survey image ${o.photoAngles.length}/3 recorded.`};
}
export function updateOperation(s,dt){
 const o=s.operation;if(!o||o.completed)return false;
 const c=operationConditions(s);o.holding=c.holding;
 if(s.mission==='survey'){
  const scan=c.range<100&&Math.abs(s.depth-s.site.depth)<32&&Math.abs(s.speed)>=.5&&Math.abs(s.speed)<=3&&s.systems.sonar>25;
  o.active=scan;if(scan)o.scan=Math.min(45,o.scan+dt);
  if(o.scan>=45||o.photoAngles.length>=3){o.completed=true;const finds=['A brass ship’s bell, engraved ASTER · 1912. A museum will want her story.','A sealed navigation journal and ceramic cargo. The archaeology team is delighted.','Silver trade coins in a broken strongbox. Treasure, with a provenance worth preserving.'];o.find=finds[Math.floor(hash01(s.environment.seed,819)*finds.length)];log(s,o.find,'success');}
 }else{
  if(c.holding){o.active=true;o.assessment+=dt;
   if(o.assessment>=22&&!o.known){o.known=true;log(s,`Rescue team report: ${o.remaining} survivors still awaiting transfer.`,'success');}
   if(o.remaining>0){o.boarding+=dt;if(o.boarding>=9){o.boarding-=9;o.remaining--;o.rescued++;log(s,`Survivor aboard. ${o.rescued} rescued.`,'success');}}
   if(o.known&&o.remaining===0){o.diverReturn+=dt;if(o.diverReturn>=9){o.completed=true;o.active=false;log(s,o.rescued?`Rescue team recovered. ${o.rescued} survivors safe aboard.`:'Rescue search complete. No survivors found. Team recovered.',o.rescued?'success':'warning');}}
  }else{o.active=false;o.boarding=0;o.diverReturn=0;}
  if(s.time>o.lastCasualty+70&&o.remaining>0){o.lastCasualty=s.time;o.remaining--;o.dead++;if(o.known)log(s,'A survivor’s signal has stopped. Rescue window is narrowing.','warning');}
  if(s.site.kind==='surface'){
   s.site.depth=Math.min(bottom(s.site.x,s.site.y)-5,2+s.time/500+Math.max(0,s.time-600)*.35);
   if(s.site.depth>15&&o.remaining>0){o.dead+=o.remaining;o.remaining=0;log(s,'The casualty has gone under. No further survivor signals. Recover the rescue team.','damage');}
  }
 }
 return o.completed;
}
export function objectiveState(s){
 if(s.operation){const o=s.operation,c=operationConditions(s);
  if(s.mission==='survey')return {label:'SURVEY THE WRECK',text:`${Math.floor(o.scan)}/45 s scan · ${o.photoAngles.length}/3 camera angles`,progress:o.photoAngles.length+'/3',advice:o.find||'Scan within 100 m at 0.5–3 kn, or take drone photos from three sides.'};
  return {label:s.site.kind==='surface'?'RECOVER SURVIVORS':'DIVER RESCUE',text:`${o.rescued} aboard · ${o.known?o.remaining:'?'} awaiting rescue`,progress:o.rescued+'/'+(o.known?o.rescued+o.remaining:'?'),advice:o.completed?`${o.rescued} survivors and the rescue team aboard. Surface at extraction.`:c.holding?(o.known?'Hold position. Transfers every 9 seconds.':'Hold position. Rescue team assessing the casualty…'):`Hold 30–${s.site.kind==='surface'?85:75} m away · depth ${c.depth.toFixed(0)} m ±${s.site.kind==='surface'?1:5} · ≤0.6 kn`};
 }
 return {label:s.mission==='recon'?'PHOTOGRAPH THE CONVOY':s.mission==='intercept'?'INTERCEPT COBALT':'LISTEN WITHOUT BEING SEEN',text:MISSIONS.find(m=>m.id===s.mission).short,progress:s.mission==='recon'?s.photos.length+'/2':s.mission==='shadow'?Math.min(180,Math.floor(s.trackTime))+'/180':'0/1',advice:''};
}
const completionRules={recon:s=>s.photos.length>=2,intercept:s=>s.ships.find(v=>v.id==='cobalt')?.hull===0,shadow:s=>s.trackTime>=180,'undersea-rescue':updateOperation,'surface-rescue':updateOperation,survey:updateOperation};
if(MISSIONS.length!==Object.keys(completionRules).length||MISSIONS.some(m=>!Object.hasOwn(completionRules,m.id)))throw new Error('Every mission must have an explicit completion rule.');
export const objectiveComplete=(s,dt)=>completionRules[s.mission](s,dt);
