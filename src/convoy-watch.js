import {recordLocalLaunch} from './mess-watch.js';
import {bearing,distance,log,rad} from './mechanics.js';
import {hash01,scopeWashed} from './environment.js';
import {operatingFraction} from './equipment.js';
import {addDebrief} from './debrief.js';
import {emitSound,launchNoise} from './acoustics.js';
import {report} from './patrol-reports.js';
import {replayEvent} from './instant-replay.js';
import {floorSurface} from './seafloor.js';
import {alliedFix,liveTransmission,validLampFix,validCopy,copyLamp,lampRange,makeTransmission,validEstimate,validTransmission} from './signal-lamp.js';

const convoyIds=['wren','dahlia','petrel','escort'];
export const convoyLosses=s=>s.ships.filter(v=>convoyIds.includes(v.id)&&v.hull<=0).length;
export function setupHenhouse(s){
 const h=n=>hash01(s.patrol.seed,11700+n),base={x:s.x+500+h(1)*300,y:s.y+950+h(2)*400},heading=35+h(3)*55;
 function vessel(id,name,kind,x,y){
  return {id,name,kind,x:base.x+x,y:base.y+y,heading,speed:4,hull:100,depth:kind==='sub'?45+h(4)*30:0,
   side:id==='wolf'?'hostile':'friendly',military:true,alert:0,attack:0,disabled:false,flood:0,sinkDepth:0};
 }
 const side=h(5)<.5?-1:1;
 const wreck=vessel('plover','Plover','merchant',-480,-450);
 Object.assign(wreck,{hull:0,speed:0,settled:true,sunkAt:0,sinkDepth:Math.max(0,-floorSurface(wreck.x,wreck.y,s.environment.chartSeed).height-8),
  wreckMark:{x:wreck.x,y:wreck.y,observed:true}});
 s.ships=[vessel('wren','Wren','merchant',0,0),vessel('dahlia','Dahlia','merchant',-400,350),
  vessel('petrel','Petrel','merchant',300,620),vessel('escort','Ibis','escort',side*1000,580),
  vessel('wolf','Wolf','sub',side*(1100+h(6)*500),840+h(7)*420),wreck];
 s.convoy={message:null,pin:null,number:0,round:0,next:80+h(8)*30,shot:null};
 s.depth=s.targetDepth=0;s.heading=s.targetHeading=(bearing(s,s.ships[0])+356)%360;
 log(s,'Plover already lost. Wreck marked. The surviving convoy can signal an estimate if they see you surface.');
}
export function signalHail(ship,range){
 return ship.name+' hails us. Hold her lamp in your scope or tower binoculars within '+(Math.floor(range/100)*.1).toFixed(1)+' km.';
}
export function updateLamp(s,env,input,dt){
 const c=s.convoy,wolf=s.ships.find(v=>v.id==='wolf');if(wolf.hull<=0)return;
 const range=lampRange(env);
 let message=c.message,ship=message&&s.ships.find(v=>v.id===message.estimate.sender);
 if(ship&&ship.hull<=0){c.message=message=ship=null;}
 if(!message&&s.depth<=1){
  const nearby=s.ships.filter(v=>convoyIds.includes(v.id)&&v.hull>0&&distance(s,v)<=Math.max(3400,range*1.35));
  ship=nearby.sort((a,b)=>distance(s,a)-distance(s,b))[0];
  if(ship){report(s,'convoy-hail',signalHail(ship,range));c.message=message=makeTransmission(ship,wolf,s.patrol.seed,++c.number,s.time);}
 }
 if(!message)return;
 if(message.delivered&&message.elapsed>=90&&message.elapsed-message.completedAt>=60){
  c.message=message=makeTransmission(ship,wolf,s.patrol.seed,++c.number,s.time);
  report(s,'convoy-update',ship.name+' is repeating a new lamp report.');
 }
 const optical=input.observation==='scope'?s.scope&&s.depth<=15&&operatingFraction(s.systems.periscope)>0&&!scopeWashed(s,env):input.observation==='tower'&&s.depth<=1;
 const seen=optical&&input.lampInView===ship.id&&distance(s,ship)<=range;
 if(copyLamp(message,dt/Math.max(1,input.timeRate||1),seen)){
  c.pin={...message.estimate};
  report(s,'telegram-'+c.number,'TELEGRAM '+c.number+' · '+ship.name.toUpperCase()+' · '+c.pin.text+' FROM US · estimate plotted.');
 }
}
export function updateConvoyRaid(s,dt,approaching,dropCharge){
 const c=s.convoy,wolf=s.ships.find(v=>v.id==='wolf');
 if(approaching){c.next+=dt;return;}
 if(c.shot){
  const shot=c.shot,target=s.ships.find(v=>v.id===shot.target);
  if(shot.damage&&target.hull>0)shot.to={x:target.x,y:target.y,altitude:-2};
  if(s.time>=shot.arrives){
   const hit=shot.damage>0&&target.hull>0;
   if(hit)target.hull=Math.max(0,target.hull-shot.damage);
   const p=shot.to;s.impacts.push({id:s.weaponSequence++,x:p.x,y:p.y,altitude:p.altitude,kind:hit?'torpedo':'splash',time:s.time});
   emitSound(s,{type:'detonation',x:p.x,y:p.y,depth:2,power:.85});
   if(hit){addDebrief(s,'The hunter struck '+target.name+'.');replayEvent(s,{kind:'torpedo',shot:shot.id,target:target.id,enemy:true,point:{x:p.x,y:p.y,depth:2}});}
   c.shot=null;
  }
 }
 if(s.time<c.next||wolf.hull<=0||c.shot)return;
 const round=c.round++,roll=n=>hash01(s.patrol.seed,13000+round*12+n);
 c.next=s.time+42+roll(0)*28;
 const ships=s.ships.filter(v=>convoyIds.includes(v.id)&&v.hull>0);
 if(!ships.length)return;
 const chosen=ships[Math.floor(roll(1)*ships.length)];
 const hit=roll(2)<.76,damage=hit?45+Math.floor(roll(3)*21):0;
 c.shot={id:s.weaponSequence++,underwater:true,source:wolf.id,target:chosen.id,launched:s.time,arrives:s.time+12+roll(4)*14,damage,
  from:{x:wolf.x,y:wolf.y,altitude:-wolf.depth},to:{x:chosen.x+(hit?0:120),y:chosen.y,altitude:-2}};
 recordLocalLaunch(s,wolf);launchNoise(s,wolf);
 emitSound(s,{type:'seeker',x:wolf.x,y:wolf.y,depth:wolf.depth,power:.45});
 const escort=ships.find(v=>v.kind==='escort'&&!v.disabled);
 if(escort){
  const charge=dropCharge(s,{x:escort.x+Math.sin(rad(escort.heading))*-30,y:escort.y-Math.cos(rad(escort.heading))*30,depth:40+roll(5)*30,delay:6});
  charge.convoyCharge=true;
 }
}
export function resolveConvoyCharge(s,charge){
 const wolf=s.ships.find(v=>v.id==='wolf');
 if(wolf?.hull>0&&distance(wolf,charge)<650&&hash01(s.patrol.seed,charge.id+14600)<.32){
  wolf.hull=Math.max(0,wolf.hull-14-12*hash01(charge.id,2));
  addDebrief(s,'An escort depth charge damaged the hunter.');
 }
}
export function validConvoy(s){
 const c=s.convoy,ids=[...convoyIds,'plover','wolf'];
 if(!c||s.ships.filter(v=>!v.incidental).length!==ids.length||!ids.every(id=>s.ships.some(v=>v.id===id&&v.side===(id==='wolf'?'hostile':'friendly')&&v.kind===(id==='wolf'?'sub':id==='escort'?'escort':'merchant'))))return false;
 const wreck=s.ships.find(v=>v.id==='plover');
 if(!wreck.settled||wreck.hull!==0||!wreck.wreckMark?.observed||!Number.isInteger(c.round)||c.round<0||!Number.isSafeInteger(c.number)||c.number<0||!Number.isFinite(c.next)||c.next<0)return false;
 if(c.message!==null&&(!validTransmission(c.message,s.time)||c.message.estimate.number!==c.number||!convoyIds.includes(c.message.estimate.sender)))return false;
 if(c.pin!==null&&(!validEstimate(c.pin,s.time)||!convoyIds.includes(c.pin.sender)||c.pin.number>c.number))return false;
 const v=c.shot;
 return v===null||v&&v.source==='wolf'&&convoyIds.includes(v.target)&&v.underwater===true&&Number.isInteger(v.id)&&v.id>0&&v.id<s.weaponSequence&&
  [v.from?.x,v.from?.y,v.from?.altitude,v.to?.x,v.to?.y,v.to?.altitude,v.launched,v.arrives,v.damage].every(Number.isFinite)&&v.launched>=0&&v.launched<=s.time&&v.arrives>s.time&&v.damage>=0;
}

export function stationLamp(s){
 return s.alliedLamp?.message??s.convoy?.message;
}

// Friendly surface units take discrete observations. A telegram freezes the
// observation at issue, including what was known before the player surfaced.
export function updateAlliedWatch(s,env,input,dt,recordFix){
 if(!s.battle&&!s.convoy&&!s.ships.some(v=>v.incidental&&v.side==='friendly'&&v.kind!=='sub'))return;
 const watch=s.alliedLamp??={message:null,sequence:0,lastIssue:-1};
 const subs=s.ships.filter(v=>v.kind==='sub'&&v.side==='hostile'&&v.hull>0);
 const range=lampRange(env);
 let candidate;
 for(const [index,ship] of s.ships.entries()){
  if(ship.kind==='sub'||ship.side!=='friendly'||ship.hull<=0||ship.disabled)continue;
  const offset=7+index*6;
  if(s.time>=offset&&Math.floor((s.time-offset)/36)!==Math.floor((s.time-dt-offset)/36)){
   if(distance(s,ship)<4200&&hash01(s.patrol.seed,Math.floor(s.time)*17+index)<s.difficulty.pingDetection)
    emitSound(s,{type:'sweep',friendly:true,x:ship.x,y:ship.y,depth:0,power:.6,vessel:ship.id});
   const found=subs.filter(v=>distance(ship,v)<1800).sort((a,b)=>distance(ship,a)-distance(ship,b))[0];
   if(found)ship.lampFix=alliedFix(ship,found,s.time,++watch.sequence);
  }
  const fix=ship.lampFix;
  if(fix&&fix.time>watch.lastIssue&&s.time-fix.time<45&&distance(s,ship)<=range&&(!candidate||fix.time>candidate.time))candidate=fix;
 }
 let message=watch.message;
 if(message){
  const sender=s.ships.find(v=>v.id===message.estimate.sender);
  if(sender.hull<=0||sender.disabled||message.delivered&&message.elapsed-message.completedAt>=6||!message.delivered&&s.time-message.estimate.time>180){
   watch.message=message=null;
  }
 }
 const initial=s.convoy?.message;
 const copyingInitial=initial&&!initial.delivered&&(initial.elapsed<20||initial.copied!==0||initial.since!==null);
 if(!message&&candidate&&s.depth<=1&&!copyingInitial){
  watch.lastIssue=candidate.time;
  message=watch.message=liveTransmission(candidate);
  const sender=s.ships.find(v=>v.id===candidate.sender);
  report(s,'allied-hail',signalHail(sender,range));
 }
 if(!message)return;
 const fix=message.estimate,ship=s.ships.find(v=>v.id===fix.sender);
 const optical=input.observation==='tower'&&s.depth<=1||input.observation==='scope'&&s.depth<=15&&s.scope&&operatingFraction(s.systems.periscope)>0&&!scopeWashed(s,env);
 if(copyLamp(message,dt/Math.max(1,input.timeRate||1),optical&&input.lampInView===ship.id&&distance(s,ship)<=range)){
  recordFix(s,fix);
  report(s,'allied-fix','TELEGRAM · '+ship.name.toUpperCase()+' · '+fix.text+' · Sub contact plotted, '+fix.depth+' m deep, '+fix.course+'° at '+fix.speed+' kn. Fix age '+Math.round(s.time-fix.time)+' s.');
 }
}
export function validAlliedWatch(s){
 const w=s.alliedLamp;
 const sender=id=>s.ships.some(v=>v.id===id&&v.side==='friendly'&&v.kind!=='sub');
 const valid=f=>validLampFix(f,s.time)&&sender(f.sender)&&s.ships.some(v=>v.id===f.target&&v.side==='hostile'&&v.kind==='sub')&&f.number<=w.sequence;
 if(w===undefined)return s.ships.every(v=>v.lampFix===undefined);
 if(!w||(!s.convoy&&!s.battle&&!s.ships.some(v=>v.incidental&&v.side==='friendly'&&v.kind!=='sub'))||!Number.isSafeInteger(w.sequence)||w.sequence<0||!Number.isFinite(w.lastIssue)||w.lastIssue< -1||w.lastIssue>s.time)return false;
 return (w.message===null||w.message&&valid(w.message.estimate)&&validCopy(w.message,s.time))&&s.ships.every(v=>v.lampFix===undefined||valid(v.lampFix)&&v.lampFix.sender===v.id);
}
