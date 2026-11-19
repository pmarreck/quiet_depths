// Units: meters, seconds, knots, degrees clockwise from north. No rendering here.
import {makeEnvironment,environmentAt,scopeWashed,hash01,WEATHER,soundings} from './environment.js';
import {emitSound,updateAcoustics} from './acoustics.js';
import {clamp,rad,bearing,delta,distance,bottom,rand,log} from './mechanics.js';
import {MISSIONS,randomizePatrol,objectiveComplete} from './missions.js';
import {freshSystems,freshMotion,freshDrone,deployDrone,recallDrone,hurt,updateBoat,updateDrone,shipCollision,siteCollision} from './systems.js';
import {freshCombat,launchTorpedo,updateCombat} from './combat.js';
export {clamp,rad,bearing,delta,distance,bottom,log,MISSIONS,deployDrone,recallDrone,hurt};
export function createGame(mission='recon',seed=19830604,options={}){
 const m=MISSIONS.find(m=>m.id===mission)||MISSIONS[0];
 const s={version:1,rng:seed||1,time:0,status:'patrol',mission:m.id,phase:'objective',trackTime:0,photos:[],hull:100,battery:92,oxygen:100,fuel:86,flood:0,repair:0,torps:6,noise:12,alert:0,pingAge:999,pingCooldown:0,photoCooldown:0,decoys:3,engine:'electric',silent:false,scope:true,scopeAngle:0,scopeSteerBearing:null,towerAngle:0,towerPitch:0,systems:freshSystems(),...freshMotion(),...freshCombat(),cavitation:0,propRpm:52,speed:4,targetSpeed:4,depth:12,targetDepth:12,heading:32,targetHeading:32,x:0,y:0,route:null,home:{x:-1500,y:-1700},environment:makeEnvironment(seed,options),lightning:[],nextLightningAt:8+hash01(seed)*8,acoustics:[],soundSequence:1,events:[{t:0,text:'Helm steady. Faint screws bearing 028. Your patrol begins.',kind:'info'}],contacts:[],projectiles:[],blasts:[],shells:[],nextId:1,drone:freshDrone(),ships:[
 {id:'cobalt',name:'Cobalt',kind:'merchant',military:true,x:1450,y:2700,heading:255,speed:5,hull:100,alert:0,attack:0},
 {id:'meridian',name:'Meridian',kind:'merchant',military:false,x:2350,y:2900,heading:255,speed:5,hull:100,alert:0,attack:0},
 {id:'kestrel',name:'Kestrel',kind:'escort',military:true,x:2300,y:2050,heading:255,speed:7,hull:100,alert:0,attack:0},
 {id:'tern',name:'Tern',kind:'fishing',military:false,x:-850,y:1350,heading:110,speed:3,hull:100,alert:0,attack:0},
 {id:'echo',name:'Unknown submarine',kind:'sub',military:true,x:3800,y:900,depth:75,heading:280,speed:4,hull:100,alert:0,attack:0}
 ]};randomizePatrol(s,seed);return s;
}
export function getSoundings(s,drone=false){const v=drone?s.drone:s;return soundings(bottom(v.x,v.y),v.depth,drone?.7:5+27.5*Math.abs(Math.sin(s.pitch)));}
export function isVisible(s,ship,look=null,env=environmentAt(s)){
 if(ship.hull<=0||ship.kind==='sub'||s.depth>15||!s.scope)return false;
 return !scopeWashed(s,env)&&distance(s,ship)<env.opticalRange&&(look===null||Math.abs(delta(bearing(s,ship),look))<19);
}
export function contact(s,ship,method){
 let c=s.contacts.find(c=>c.id===ship.id);
 const b=bearing(s,ship),d=distance(s,ship);
 if(!c){c={id:ship.id,label:`Sierra ${String(s.nextId++).padStart(2,'0')}`,bearing:b,range:0,confidence:0,age:0,identified:false,method:'passive',x:0,y:0};s.contacts.push(c);log(s,`New contact. ${c.label}, bearing ${Math.round(b)}.`, 'contact');}
 c.bearing=(b+(method==='passive'?(rand(s)-.5)*6:0)+360)%360;c.age=0;c.method=method;
 if(method!=='passive'){
   c.range=d*(method==='visual'?.94+rand(s)*.12:.97+rand(s)*.06);c.x=s.x+Math.sin(rad(c.bearing))*c.range;c.y=s.y+Math.cos(rad(c.bearing))*c.range;c.confidence=method==='visual'?.9:.75;
   if(method==='visual'){c.identified=true;c.name=ship.name;c.kind=ship.kind;c.military=ship.military;}
 } else c.confidence=Math.max(.24,c.confidence);
 return c;
}
export function ping(s){
 if(s.pingCooldown>0||s.status!=='patrol'||s.systems.sonar<=25)return false;
 s.pingAge=0;s.pingCooldown=15;s.alert=clamp(s.alert+28,0,100);
 for(const ship of s.ships)if(ship.hull>0&&distance(s,ship)<6000)contact(s,ship,'active');
 for(const ship of s.ships)if(ship.military&&distance(s,ship)<7500)ship.alert=Math.max(ship.alert,65);
 log(s,'Active ping. Ranges resolved. They heard that too.','warning');return true;
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
export function decoy(s){if(s.decoys<=0)return false;s.decoys--;s.alert=Math.max(0,s.alert-35);for(const v of s.ships)v.alert=Math.max(0,v.alert-50);log(s,'Noisemaker away. Change course and go quiet.');return true;}
export function step(s,dt,input={}){
 if(s.status!=='patrol'||dt<=0||input.paused||input.modal)return;
 // Fixed substeps make time compression obey the same collision and resource rules.
 let left=Math.min(dt,60);while(left>0&&s.status==='patrol'){const t=Math.min(.25,left);tick(s,t,input);left-=t;}
}
function tick(s,dt,input){
 s.time+=dt;s.pingAge+=dt;s.pingCooldown=Math.max(0,s.pingCooldown-dt);s.photoCooldown=Math.max(0,s.photoCooldown-dt);s.shock=Math.max(0,(s.shock||0)-dt);
 const env=environmentAt(s);
 if(s.time>=s.nextLightningAt){
  if(env.storm>.35){const angle=s.time<30?rad(s.heading+s.scopeAngle+(rand(s)-.5)*26):rand(s)*Math.PI*2,range=1800+rand(s)*4000,strike={id:s.soundSequence,time:s.time,x:s.x+Math.sin(angle)*range,y:s.y+Math.cos(angle)*range,height:1050+rand(s)*900,seed:Math.floor(rand(s)*1000000)};
   s.lightning.push(strike);emitSound(s,{type:'thunder',x:strike.x,y:strike.y,altitude:strike.height*.65,power:.8+rand(s)*.4});}
  s.nextLightningAt=s.time+18+rand(s)*36;
 }
 s.lightning=s.lightning.filter(e=>s.time-e.time<20);
 if(s.route){s.targetHeading=bearing(s,s.route);if(distance(s,s.route)<(s.route.radius||100)){s.route=null;s.targetSpeed=0;log(s,'Waypoint reached. All stop.');}}
 const diesel=updateBoat(s,dt);siteCollision(s);
 if(s.scopeSteerBearing!==null){s.scopeAngle=(s.scopeSteerBearing-s.heading+360)%360;if(Math.abs(delta(s.scopeSteerBearing,s.heading))<.1){s.scopeAngle=0;s.scopeSteerBearing=null;}}
 // Suppress repeated damage log spam while retaining actual damage.
 if(s.events.length>1&&s.events[0].text===s.events[1].text)s.events.splice(1,1);
 if(s.hull<=0)s.status='lost';
 let danger=0;
 for(const ship of s.ships){
   if(ship.hull<=0)continue;
   const d=distance(s,ship);
   if(s.systems.sonar>25&&(s.silent||s.speed<9)&&d<(ship.kind==='fishing'?2300:5600)*(1-env.storm*.25*Math.exp(-s.depth/80))*(.25+.75*s.systems.sonar/100)&&Math.floor(s.time/3)!==Math.floor((s.time-dt)/3))contact(s,ship,'passive');
   if(isVisible(s,ship,input.look??((s.heading+s.scopeAngle)%360),env))contact(s,ship,'visual');
   if(!ship.disabled&&(ship.kind==='escort'||ship.kind==='sub')){
     const exposure=s.depth<3?95:(s.scope&&s.depth<=15?23:0);
     const sound=s.noise*(s.depth>100?.55:1);
     const detection=clamp(1-d/env.subVisualRange,0,1)*exposure+clamp(1-d/5500,0,1)*sound*.7*(1-env.storm*.38*Math.exp(-s.depth/70));
     ship.alert=clamp(ship.alert+dt*(detection*.06-.65),0,100);
     if(ship.alert>42){ship.heading=(ship.heading+clamp(delta(bearing(ship,s),ship.heading),-dt*2.5,dt*2.5)+360)%360;ship.speed=ship.kind==='escort'?15:8;danger=Math.max(danger,ship.alert);}
     if(ship.kind==='escort'&&ship.alert>55&&s.depth<=2&&d<2600){
       ship.attack-=dt;if(ship.attack<=0){ship.attack=12;const shell={id:s.soundSequence++,x:s.x+(rand(s)-.5)*120,y:s.y+(rand(s)-.5)*120,depth:0,delay:1.5+d/550,fromX:ship.x,fromY:ship.y,total:1.5+d/550};s.shells.push(shell);emitSound(s,{type:'gunfire',x:ship.x,y:ship.y,altitude:12,power:1});log(s,'Escort firing. Shells incoming. Dive or return fire.','damage');}
     }else if(ship.alert>55&&d<(ship.kind==='sub'?2300:420)){
       ship.attack-=dt;if(ship.attack<=0){ship.attack=35;dropDepthCharge(s,{x:s.x+(rand(s)-.5)*180,y:s.y+(rand(s)-.5)*180,depth:s.depth,delay:Math.max(4,s.depth/4.5),kind:ship.kind==='sub'?'weapon':'charge'});log(s,ship.kind==='sub'?'Incoming hostile weapon. Evade!':'Depth charges in the water. Evade!','damage');}
     }
   }
   if(ship.disabled)ship.speed=0;ship.x+=Math.sin(rad(ship.heading))*ship.speed*.514444*dt;ship.y+=Math.cos(rad(ship.heading))*ship.speed*.514444*dt;
   shipCollision(s,ship);
 }
 s.alert=clamp(Math.max(danger,s.alert-dt*.65),0,100);
 for(const c of s.contacts){c.age+=dt;c.confidence=Math.max(.05,c.confidence-dt*.0006);}
 s.contacts=s.contacts.filter(c=>c.age<240);
 updateCombat(s,dt);
 for(const b of s.blasts){b.delay-=dt;if(b.delay<=0&&!b.exploded){b.exploded=true;b.explodedAt=s.time;emitSound(s,{type:'blast',x:b.x,y:b.y,depth:b.depth,power:1.2});}if(b.exploded)b.age=s.time-b.explodedAt;}
 s.blasts=s.blasts.filter(b=>b.age<5);
 for(const shell of s.shells){shell.delay-=dt;if(shell.delay<=0&&!shell.hit){shell.hit=true;emitSound(s,{type:'detonation',x:shell.x,y:shell.y,depth:0,power:.8});if(s.depth<7&&distance(s,shell)<65)hurt(s,Math.max(4,24*(1-distance(s,shell)/65)),'Shell impact near the hull.','engine');}}
 s.shells=s.shells.filter(p=>p.delay>-3);
 updateAcoustics(s,(source,d)=>{if(d<210)hurt(s,Math.max(3,36*(1-d/210)),'Depth charge shock. Damage control responding.');else if(d<2500)log(s,'Depth charge detonation. That pattern missed.');});
 updateDrone(s,dt,diesel);
 if(s.mission==='shadow'&&s.noise<27&&s.depth>15&&s.ships.some(c=>c.kind==='merchant'&&c.hull>0&&distance(s,c)<4000))s.trackTime+=dt;
 const done=objectiveComplete(s,dt);
 if(s.status==='patrol'&&done&&s.phase==='objective'){s.phase='extract';log(s,'Objective complete. Return to extraction and surface for pickup.','success');}
 if(s.status==='patrol'&&s.phase==='extract'&&distance(s,s.home)<400&&s.depth<=1){s.status='won';log(s,'Patrol complete. Surfaced at pickup. Boat and crew home safely.','success');}
 if(s.time>1800&&s.status==='patrol'){s.status='expired';log(s,'Patrol window closed. Command orders withdrawal.','warning');}
}
export function save(s){return JSON.stringify(s);}
export function dropDepthCharge(s,{x,y,depth,delay=7,kind='charge'}){const charge={id:s.soundSequence++,x,y,depth,delay,totalDelay:delay,age:0,exploded:false,kind};s.blasts.push(charge);return charge;}
export function restore(raw){try{
 const s=JSON.parse(raw);if(!s||s.version!==1||!MISSIONS.some(m=>m.id===s.mission)||!['patrol','won','lost','compromised','expired'].includes(s.status))return null;
 // Migrate existing v1 patrols without discarding their progress or drone state.
 if(s.scopeAngle===undefined)s.scopeAngle=0;
 if(s.scopeSteerBearing===undefined)s.scopeSteerBearing=null;
 if(s.environment===undefined)s.environment=makeEnvironment(s.rng);
 if(s.lightning===undefined)s.lightning=[];if(s.acoustics===undefined)s.acoustics=[];
 if(s.nextLightningAt===undefined)s.nextLightningAt=s.time+8;if(s.soundSequence===undefined)s.soundSequence=1;
 if(s.patrol===undefined)s.patrol={seed:s.environment.seed,photoGoal:2,trackGoal:180,variant:0};
 for(const [k,v] of Object.entries(freshCombat()))if(s[k]===undefined)s[k]=v;
 for(const [k,v] of Object.entries({...freshMotion(),towerAngle:0,towerPitch:0,cavitation:0,propRpm:0}))if(s[k]===undefined)s[k]=v;
 if(s.systems===undefined)s.systems=freshSystems();else if(s.systems&&s.systems.deckgun===undefined)s.systems.deckgun=100;if(s.shells===undefined)s.shells=[];
 if(s.site===undefined)s.site=null;if(s.operation===undefined)s.operation=null;
 if(s.drone){for(const [k,v] of Object.entries({...freshDrone(),targetDepth:s.drone.depth,targetHeading:s.drone.heading}))if(s.drone[k]===undefined)s.drone[k]=v;}
 const template=createGame(s.mission);for(const [k,v] of Object.entries(template)){if(typeof v==='number'&&!Number.isFinite(s[k]))return null;if(typeof v==='boolean'&&typeof s[k]!=='boolean')return null;if(Array.isArray(v)&&!Array.isArray(s[k]))return null;}
 if(!['objective','extract'].includes(s.phase)||!['electric','diesel'].includes(s.engine)||!s.home||!Number.isFinite(s.home.x)||!Number.isFinite(s.home.y)||!s.drone||!['stowed','remote','return','lost'].includes(s.drone.mode))return null;
 if(!s.environment||!WEATHER[s.environment.startWeather]||!Number.isFinite(s.environment.startHour)||!Number.isFinite(s.environment.seed)||typeof s.environment.changing!=='boolean')return null;
 if(!s.systems||Object.keys(freshSystems()).some(k=>!Number.isFinite(s.systems[k])||s.systems[k]<0||s.systems[k]>100))return null;
 if(!s.patrol||!['seed','photoGoal','trackGoal','variant'].every(k=>Number.isFinite(s.patrol[k]))||s.scopeSteerBearing!==null&&!Number.isFinite(s.scopeSteerBearing))return null;
 if(!s.gun||!['ammo','cooldown','shots','angle','elevation'].every(k=>Number.isFinite(s.gun[k])))return null;
 if(!s.airSupport||!['idle','arming','airborne','spent'].includes(s.airSupport.status)||!s.airSupport.base||!['x','y'].every(k=>Number.isFinite(s.airSupport.base[k])))return null;
 for(const k of ['requestedAt','launchAt'])if(s.airSupport[k]!==null&&!Number.isFinite(s.airSupport[k]))return null;
 if(s.airSupport.lastKnown&&!['x','y','time'].every(k=>Number.isFinite(s.airSupport.lastKnown[k])))return null;
 for(const p of s.aircraft)if(!['x','y','altitude','heading','speed','hull'].every(k=>Number.isFinite(p[k]))||typeof p.id!=='string')return null;
 for(const p of s.gunRounds)if(!['id','x','y','altitude','vx','vy','vz','age'].every(k=>Number.isFinite(p[k]))||!['player','aircraft'].includes(p.owner)||typeof p.tracer!=='boolean')return null;
 for(const p of s.impacts)if(!['id','x','y','altitude','time'].every(k=>Number.isFinite(p[k])))return null;
 for(const k of ['hull','mobility','buoyancy','camera','verticalSpeed','collisionCooldown'])if(!Number.isFinite(s.drone[k]))return null;
 if(['undersea-rescue','surface-rescue','survey'].includes(s.mission)){
  if(!s.site||!s.operation||!['x','y','depth','heading'].every(k=>Number.isFinite(s.site[k]))||!['surface','wreck','sub'].includes(s.site.kind)||typeof s.site.name!=='string')return null;
  const o=s.operation;if(!['rescued','remaining','dead','assessment','boarding','diverReturn','scan','lastCasualty'].every(k=>Number.isFinite(o[k])&&o[k]>=0)||!['known','holding','active','completed'].every(k=>typeof o[k]==='boolean')||!Array.isArray(o.photoAngles)||!o.photoAngles.every(Number.isFinite))return null;
 }else if(s.site||s.operation)return null;
 for(const p of s.shells)if(!['id','x','y','depth','delay','fromX','fromY','total'].every(k=>Number.isFinite(p[k])))return null;
 for(const k of ['x','y','heading','depth','battery','speed','targetSpeed','targetDepth','targetHeading'])if(!Number.isFinite(s.drone[k]))return null;
 if(s.route&&(!Number.isFinite(s.route.x)||!Number.isFinite(s.route.y)))return null;
 for(const ship of s.ships)if(!ship||typeof ship.id!=='string'||typeof ship.name!=='string'||!['merchant','fishing','escort','sub'].includes(ship.kind)||!['x','y','heading','speed','hull','alert','attack'].every(k=>Number.isFinite(ship[k])))return null;
 if(s.mission==='intercept'&&!s.ships.some(c=>c.id==='cobalt'))return null;
 for(const c of s.contacts)if(!c||typeof c.id!=='string'||typeof c.label!=='string'||!['bearing','range','confidence','age','x','y'].every(k=>Number.isFinite(c[k])))return null;
 for(const e of s.events)if(!e||typeof e.text!=='string'||typeof e.kind!=='string'||!Number.isFinite(e.t))return null;
 for(const p of s.projectiles){if(!['x','y','heading','age'].every(k=>Number.isFinite(p[k])))return null;if(p.id===undefined)p.id=s.weaponSequence++;for(const [k,v] of Object.entries({intended:p.lock??null,depth:Math.min(s.depth,6),pingAge:99,path:[{x:p.x,y:p.y,depth:Math.min(s.depth,6),time:s.time}]}))if(p[k]===undefined)p[k]=v;if(!['id','depth','pingAge'].every(k=>Number.isFinite(p[k]))||!Array.isArray(p.path)||!p.path.every(v=>['x','y','depth','time'].every(k=>Number.isFinite(v[k]))))return null;}
 for(const b of s.blasts){if(!['x','y','depth','delay','age'].every(k=>Number.isFinite(b[k])))return null;if(b.id===undefined)b.id=s.soundSequence++;if(b.totalDelay===undefined)b.totalDelay=Math.max(1,b.delay);if(b.exploded===undefined)b.exploded=b.age>0;if(b.exploded&&b.explodedAt===undefined)b.explodedAt=s.time-b.age;}
 for(const e of s.lightning)if(!['id','time','x','y','height','seed'].every(k=>Number.isFinite(e[k])))return null;
 for(const e of s.acoustics)if(!['id','time','x','y','power'].every(k=>Number.isFinite(e[k]))||!['thunder','blast','detonation','gunfire','seeker'].includes(e.type)||typeof e.heard!=='boolean')return null;
 return s;
}catch{return null;}}
