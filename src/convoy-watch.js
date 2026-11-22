import {bearing,distance,log,rad} from './mechanics.js';
import {hash01,scopeWashed} from './environment.js';
import {operatingFraction} from './equipment.js';
import {addDebrief} from './debrief.js';
import {emitSound} from './acoustics.js';
import {report} from './patrol-reports.js';
import {replayEvent} from './instant-replay.js';
import {floorSurface} from './seafloor.js';
import {copyLamp,lampRange,makeTransmission,validEstimate,validTransmission} from './signal-lamp.js';

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
 if(!c||s.ships.length!==ids.length||!ids.every(id=>s.ships.some(v=>v.id===id&&v.side===(id==='wolf'?'hostile':'friendly')&&v.kind===(id==='wolf'?'sub':id==='escort'?'escort':'merchant'))))return false;
 const wreck=s.ships.find(v=>v.id==='plover');
 if(!wreck.settled||wreck.hull!==0||!wreck.wreckMark?.observed||!Number.isInteger(c.round)||c.round<0||!Number.isSafeInteger(c.number)||c.number<0||!Number.isFinite(c.next)||c.next<0)return false;
 if(c.message!==null&&(!validTransmission(c.message,s.time)||c.message.estimate.number!==c.number||!convoyIds.includes(c.message.estimate.sender)))return false;
 if(c.pin!==null&&(!validEstimate(c.pin,s.time)||!convoyIds.includes(c.pin.sender)||c.pin.number>c.number))return false;
 const v=c.shot;
 return v===null||v&&v.source==='wolf'&&convoyIds.includes(v.target)&&v.underwater===true&&Number.isInteger(v.id)&&v.id>0&&v.id<s.weaponSequence&&
  [v.from?.x,v.from?.y,v.from?.altitude,v.to?.x,v.to?.y,v.to?.altitude,v.launched,v.arrives,v.damage].every(Number.isFinite)&&v.launched>=0&&v.launched<=s.time&&v.arrives>s.time&&v.damage>=0;
}
