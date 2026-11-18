// Units: meters, seconds, knots, degrees clockwise from north. No rendering here.
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const rad=d=>d*Math.PI/180;
export const bearing=(a,b)=>(Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI+360)%360;
export const delta=(a,b)=>((a-b+540)%360)-180;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const MISSIONS=[
 {id:'recon',name:'A quiet observation',type:'RECONNAISSANCE',desc:'Photograph two different merchant ships through your periscope. Leave the escort wondering if you were ever there.',short:'Photograph 2 merchant ships',minutes:'8–12 MIN',torps:4},
 {id:'intercept',name:'The long way home',type:'INTERCEPTION',desc:'Intercept the military freighter Cobalt. Confirm her silhouette before firing. The fishing boats are neutral.',short:'Sink military freighter Cobalt',minutes:'10–15 MIN',torps:4},
 {id:'shadow',name:'Just passing through',type:'SURVEILLANCE',desc:'Accumulate three minutes of quiet passive tracking within 4 km of the convoy. Do not fire. Bring the traffic intelligence home.',short:'Track convoy quietly for 180 seconds',minutes:'8–12 MIN',torps:0}
];
export function bottom(x,y){
 const reef=155*Math.exp(-((x-1900)**2+(y-700)**2)/470000);
 const island=460*Math.exp(-((x+3800)**2+(y-4000)**2)/1900000);
 return 230+30*Math.sin(x/1100)*Math.cos(y/900)-reef-island;
}
function rand(s){s.rng^=s.rng<<13;s.rng^=s.rng>>>17;s.rng^=s.rng<<5;return(s.rng>>>0)/4294967296;}
export function log(s,text,kind='info'){s.events.unshift({t:s.time,text,kind});s.events=s.events.slice(0,45);}
export function createGame(mission='recon',seed=19830604){
 const m=MISSIONS.find(m=>m.id===mission)||MISSIONS[0];
 return {version:1,rng:seed,time:0,status:'patrol',mission:m.id,phase:'objective',trackTime:0,photos:[],hull:100,battery:92,oxygen:100,fuel:86,flood:0,repair:0,torps:m.torps,noise:12,alert:0,pingAge:999,pingCooldown:0,photoCooldown:0,decoys:3,engine:'electric',silent:false,scope:true,scopeAngle:0,speed:4,targetSpeed:4,depth:12,targetDepth:12,heading:32,targetHeading:32,x:0,y:0,route:null,home:{x:-1500,y:-1700},events:[{t:0,text:'Helm steady. Faint screws bearing 028. Your patrol begins.',kind:'info'}],contacts:[],projectiles:[],blasts:[],nextId:1,drone:{mode:'stowed',x:0,y:0,depth:25,heading:0,battery:100,speed:0,targetSpeed:0,targetDepth:25,targetHeading:0},ships:[
 {id:'cobalt',name:'Cobalt',kind:'merchant',military:true,x:1450,y:2700,heading:255,speed:5,hull:100,alert:0,attack:0},
 {id:'meridian',name:'Meridian',kind:'merchant',military:false,x:2350,y:2900,heading:255,speed:5,hull:100,alert:0,attack:0},
 {id:'kestrel',name:'Kestrel',kind:'escort',military:true,x:2300,y:2050,heading:255,speed:7,hull:100,alert:0,attack:0},
 {id:'tern',name:'Tern',kind:'fishing',military:false,x:-850,y:1350,heading:110,speed:3,hull:100,alert:0,attack:0},
 {id:'echo',name:'Unknown submarine',kind:'sub',military:true,x:3800,y:900,depth:75,heading:280,speed:4,hull:100,alert:0,attack:0}
 ]};
}
export function isVisible(s,ship,look=null){
 if(ship.hull<=0||ship.kind==='sub'||s.depth>15||!s.scope)return false;
 return distance(s,ship)<6500&&(look===null||Math.abs(delta(bearing(s,ship),look))<19);
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
 if(s.pingCooldown>0||s.status!=='patrol')return false;
 s.pingAge=0;s.pingCooldown=15;s.alert=clamp(s.alert+28,0,100);
 for(const ship of s.ships)if(ship.hull>0&&distance(s,ship)<6000)contact(s,ship,'active');
 for(const ship of s.ships)if(ship.military&&distance(s,ship)<7500)ship.alert=Math.max(ship.alert,65);
 log(s,'Active ping. Ranges resolved. They heard that too.','warning');return true;
}
export function photograph(s,look){
 if(s.photoCooldown>0)return false;
 const seen=s.ships.filter(c=>isVisible(s,c,look)&&Math.abs(delta(bearing(s,c),look))<5&&c.kind==='merchant');
 if(!seen.length){log(s,'No merchant silhouette in the camera reticle.','warning');return false;}
 for(const ship of seen){contact(s,ship,'visual');if(!s.photos.includes(ship.id))s.photos.push(ship.id);}
 s.photoCooldown=4;log(s,`Photograph recorded. ${s.photos.length}/2 merchant silhouettes.`, 'success');return true;
}
export function fire(s,id){
 const c=s.contacts.find(c=>c.id===id);
 if(!c||s.torps<=0||s.status!=='patrol'||s.depth>100)return false;
 s.torps--;s.alert=clamp(s.alert+20,0,100);
 s.projectiles.push({x:s.x,y:s.y,heading:c.bearing,age:0,lock:null});
 log(s,`Tube away. Acoustic seeker running on bearing ${Math.round(c.bearing)}.`, 'warning');return true;
}
export function decoy(s){if(s.decoys<=0)return false;s.decoys--;s.alert=Math.max(0,s.alert-35);for(const v of s.ships)v.alert=Math.max(0,v.alert-50);log(s,'Noisemaker away. Change course and go quiet.');return true;}
export function deployDrone(s){
 if(s.drone.mode==='stowed'&&s.depth<=80&&s.drone.battery>5){const x=s.x+60,y=s.y,heading=bearing({x,y},s);Object.assign(s.drone,{mode:'remote',x,y,depth:s.depth+8,targetDepth:s.depth+8,heading,targetHeading:heading,speed:0,targetSpeed:0});log(s,'Inspection drone deployed. Helm control transferred to ROV.');return true;}
 return false;
}
export function recallDrone(s){if(s.drone.mode!=='stowed'&&s.drone.mode!=='lost'){s.drone.mode='return';log(s,'Drone returning to the boat.');}}
export function hurt(s,amount,text){
 s.hull=clamp(s.hull-amount,0,100);s.flood=clamp(s.flood+amount*.2,0,25);log(s,text,'damage');s.shock=2;
 if(s.hull<=0){s.status='lost';log(s,'Pressure hull lost. All stations, abandon ship.','damage');}
}
export function step(s,dt,input={}){
 if(s.status!=='patrol'||dt<=0||input.paused||input.modal)return;
 // Fixed substeps make time compression obey the same collision and resource rules.
 let left=Math.min(dt,60);while(left>0&&s.status==='patrol'){const t=Math.min(.25,left);tick(s,t,input);left-=t;}
}
function tick(s,dt,input){
 s.time+=dt;s.pingAge+=dt;s.pingCooldown=Math.max(0,s.pingCooldown-dt);s.photoCooldown=Math.max(0,s.photoCooldown-dt);s.shock=Math.max(0,(s.shock||0)-dt);
 if(s.route){s.targetHeading=bearing(s,s.route);if(distance(s,s.route)<100){s.route=null;s.targetSpeed=0;log(s,'Waypoint reached. All stop.');}}
 const electric=s.engine==='electric',diesel=!electric&&s.depth<=14&&s.fuel>0;
 const maxSpeed=s.silent?3:(electric?(s.battery>0?14:0):(diesel?17:0));
 s.speed+=clamp(clamp(s.targetSpeed,-Math.min(4,maxSpeed),maxSpeed)-s.speed,-dt*.35,dt*.35);
 s.heading=(s.heading+clamp(delta(s.targetHeading,s.heading),-dt*1.7,dt*1.7)+360)%360;
 s.depth=clamp(s.depth+clamp(s.targetDepth-s.depth,-dt*.7,dt*.7),0,320);
 s.x+=Math.sin(rad(s.heading))*s.speed*.514444*dt;s.y+=Math.cos(rad(s.heading))*s.speed*.514444*dt;
 s.noise=clamp((diesel?65:8)+s.speed*s.speed*.39+(s.flood>0?12:0)-(s.silent?7:0),2,100);
 if(diesel){s.fuel=clamp(s.fuel-dt*.015,0,100);s.battery=clamp(s.battery+dt*.12,0,100);s.oxygen=clamp(s.oxygen+dt*.35,0,100);}
 else{s.battery=clamp(s.battery-dt*(.009+s.speed*s.speed*.0007),0,100);s.oxygen=clamp(s.oxygen-dt*.024,0,100);}
 if(s.depth<2)s.oxygen=clamp(s.oxygen+dt*.45,0,100);
 if(s.scope&&s.depth>15)s.scope=false;
 const clearance=bottom(s.x,s.y)-s.depth;
 if(clearance<5)hurt(s,dt*(clearance<0?7:1.5),'Seafloor contact. Rise now.');
 if(s.depth>220)hurt(s,dt*(s.depth-220)*.002,'Hull strain. Below test depth.');
 if(s.oxygen<=0)hurt(s,dt*2,'Air exhausted. Surface immediately.');
 if(s.repair>0&&s.battery>0){s.repair-=dt;s.flood=Math.max(0,s.flood-dt*.06);s.hull=Math.min(100,s.hull+dt*.08);s.battery=Math.max(0,s.battery-dt*.016);}
 else if(s.flood>0){s.hull=Math.max(0,s.hull-s.flood*.0009*dt);}
 // Suppress repeated damage log spam while retaining actual damage.
 if(s.events.length>1&&s.events[0].text===s.events[1].text)s.events.splice(1,1);
 if(s.hull<=0)s.status='lost';
 let danger=0;
 for(const ship of s.ships){
   if(ship.hull<=0)continue;
   const d=distance(s,ship);
   if((s.silent||s.speed<9)&&d<(ship.kind==='fishing'?2300:5600)&&Math.floor(s.time/3)!==Math.floor((s.time-dt)/3))contact(s,ship,'passive');
   if(isVisible(s,ship,input.look??((s.heading+s.scopeAngle)%360)))contact(s,ship,'visual');
   if(ship.kind==='escort'||ship.kind==='sub'){
     const exposure=s.depth<3?95:(s.scope&&s.depth<=15?23:0);
     const sound=s.noise*(s.depth>100?.55:1);
     const detection=clamp(1-d/5500,0,1)*(exposure+sound*.7);
     ship.alert=clamp(ship.alert+dt*(detection*.06-.65),0,100);
     if(ship.alert>42){ship.heading=(ship.heading+clamp(delta(bearing(ship,s),ship.heading),-dt*2.5,dt*2.5)+360)%360;ship.speed=ship.kind==='escort'?15:8;danger=Math.max(danger,ship.alert);}
     if(ship.alert>55&&d<(ship.kind==='sub'?2300:420)){
       ship.attack-=dt;if(ship.attack<=0){ship.attack=35;s.blasts.push({x:s.x+(rand(s)-.5)*180,y:s.y+(rand(s)-.5)*180,depth:s.depth,delay:7,age:0});log(s,ship.kind==='sub'?'Incoming hostile weapon. Evade!':'Depth charges in the water. Evade!','damage');}
     }
   }
   ship.x+=Math.sin(rad(ship.heading))*ship.speed*.514444*dt;ship.y+=Math.cos(rad(ship.heading))*ship.speed*.514444*dt;
 }
 s.alert=clamp(Math.max(danger,s.alert-dt*.65),0,100);
 for(const c of s.contacts){c.age+=dt;c.confidence=Math.max(.05,c.confidence-dt*.0006);}
 s.contacts=s.contacts.filter(c=>c.age<240);
 for(const p of s.projectiles){
   p.age+=dt;let best=null,bestScore=0;
   // Seekers can take the loudest return in their forward cone, including neutrals.
   if(p.age>4)for(const ship of s.ships){if(ship.hull<=0)continue;const d=distance(p,ship);if(d<1500&&Math.abs(delta(bearing(p,ship),p.heading))<34){const score=(ship.kind==='merchant'?1.5:1)/(d+50);if(score>bestScore){best=ship;bestScore=score;}}}
   if(best){p.lock=best.id;p.heading=(p.heading+clamp(delta(bearing(p,best),p.heading),-dt*9,dt*9)+360)%360;}
   p.x+=Math.sin(rad(p.heading))*24*dt;p.y+=Math.cos(rad(p.heading))*24*dt;
   for(const ship of s.ships)if(ship.hull>0&&distance(p,ship)<65){ship.hull=0;p.age=999;log(s,ship.military?`Heavy detonation. ${ship.name} is sinking.`:`Neutral vessel hit: ${ship.name}. Patrol compromised.`,ship.military?'success':'damage');if(!ship.military)s.status='compromised';}
 }
 s.projectiles=s.projectiles.filter(p=>p.age<150);
 for(const b of s.blasts){b.delay-=dt;if(b.delay<=0&&b.age===0){const d=Math.hypot(s.x-b.x,s.y-b.y,(s.depth-b.depth)*2);if(d<210)hurt(s,Math.max(3,36*(1-d/210)),'Depth charge shock. Damage control responding.');else log(s,'Distant detonations. That pattern missed.');}if(b.delay<=0)b.age+=dt;}
 s.blasts=s.blasts.filter(b=>b.age<5);
 const dr=s.drone;
 if(dr.mode==='remote'||dr.mode==='return'){
   dr.battery=Math.max(0,dr.battery-dt*(.08+dr.speed*dr.speed*.0007));
   if(dr.mode==='return'){dr.targetHeading=bearing(dr,s);dr.targetDepth=clamp(s.depth+4,0,150);dr.targetSpeed=14;}
   dr.speed+=clamp(clamp(dr.targetSpeed,-3,dr.mode==='return'?14:10)-dr.speed,-dt,dt);
   dr.heading=(dr.heading+clamp(delta(dr.targetHeading,dr.heading),-dt*12,dt*12)+360)%360;
   dr.depth=clamp(dr.depth+clamp(dr.targetDepth-dr.depth,-dt,dt),0,150);
   dr.x+=Math.sin(rad(dr.heading))*dr.speed*.514444*dt;dr.y+=Math.cos(rad(dr.heading))*dr.speed*.514444*dt;
   if(dr.mode==='return'&&distance(dr,s)<25&&Math.abs(dr.depth-s.depth)<10){dr.mode='stowed';dr.speed=dr.targetSpeed=0;log(s,'Drone recovered.');}
   if(dr.battery<20&&dr.mode==='remote'){dr.mode='return';log(s,'Drone battery low. Automatic return.','warning');}
   if(dr.battery<=0||bottom(dr.x,dr.y)<dr.depth){dr.mode='lost';log(s,'Drone signal lost.','warning');}
 }
 if(s.mission==='shadow'&&s.noise<27&&s.depth>15&&s.ships.some(c=>c.kind==='merchant'&&c.hull>0&&distance(s,c)<4000))s.trackTime+=dt;
 const done=s.mission==='recon'?s.photos.length>=2:s.mission==='intercept'?s.ships.find(c=>c.id==='cobalt')?.hull===0:s.trackTime>=180;
 if(done&&s.phase==='objective'){s.phase='extract';log(s,'Objective complete. Return to extraction and surface for pickup.','success');}
 if(s.phase==='extract'&&distance(s,s.home)<400&&s.depth<=1){s.status='won';log(s,'Patrol complete. Surfaced at pickup. Boat and crew home safely.','success');}
 if(s.time>1800&&s.status==='patrol'){s.status='expired';log(s,'Patrol window closed. Command orders withdrawal.','warning');}
}
export function save(s){return JSON.stringify(s);}
export function restore(raw){try{
 const s=JSON.parse(raw);if(!s||s.version!==1||!MISSIONS.some(m=>m.id===s.mission)||!['patrol','won','lost','compromised','expired'].includes(s.status))return null;
 // Migrate existing v1 patrols without discarding their progress or drone state.
 if(s.scopeAngle===undefined)s.scopeAngle=0;
 if(s.drone){for(const [k,v] of Object.entries({speed:0,targetSpeed:0,targetDepth:s.drone.depth,targetHeading:s.drone.heading}))if(s.drone[k]===undefined)s.drone[k]=v;}
 const template=createGame(s.mission);for(const [k,v] of Object.entries(template)){if(typeof v==='number'&&!Number.isFinite(s[k]))return null;if(typeof v==='boolean'&&typeof s[k]!=='boolean')return null;if(Array.isArray(v)&&!Array.isArray(s[k]))return null;}
 if(!['objective','extract'].includes(s.phase)||!['electric','diesel'].includes(s.engine)||!s.home||!Number.isFinite(s.home.x)||!Number.isFinite(s.home.y)||!s.drone||!['stowed','remote','return','lost'].includes(s.drone.mode))return null;
 for(const k of ['x','y','heading','depth','battery','speed','targetSpeed','targetDepth','targetHeading'])if(!Number.isFinite(s.drone[k]))return null;
 if(s.route&&(!Number.isFinite(s.route.x)||!Number.isFinite(s.route.y)))return null;
 for(const ship of s.ships)if(!ship||typeof ship.id!=='string'||typeof ship.name!=='string'||!['merchant','fishing','escort','sub'].includes(ship.kind)||!['x','y','heading','speed','hull','alert','attack'].every(k=>Number.isFinite(ship[k])))return null;
 if(!s.ships.some(c=>c.id==='cobalt'))return null;
 for(const c of s.contacts)if(!c||typeof c.id!=='string'||typeof c.label!=='string'||!['bearing','range','confidence','age','x','y'].every(k=>Number.isFinite(c[k])))return null;
 for(const e of s.events)if(!e||typeof e.text!=='string'||typeof e.kind!=='string'||!Number.isFinite(e.t))return null;
 for(const p of s.projectiles)if(!['x','y','heading','age'].every(k=>Number.isFinite(p[k])))return null;
 for(const b of s.blasts)if(!['x','y','depth','delay','age'].every(k=>Number.isFinite(b[k])))return null;
 return s;
}catch{return null;}}
