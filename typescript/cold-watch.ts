import {incidentalHull} from './carrier.ts';
import {chartDepth} from './coast.ts';
import {hash01} from './surface-motion.ts';
import {missions} from './mission-catalog.ts';
import {DAY_SECONDS} from './patrol-calendar.ts';
import type {Volley} from './fleet-action.ts';

type Point={x:number;y:number};
type Side='friendly'|'hostile';
type Order='watch'|'approach'|'stop'|'warn'|'fight'|'retreat';
interface Stand {against:string;level:number;range:number;next:number;order:Order;cruise:number;origin?:(Point & {time:number})}
interface Vessel extends Point {id:string;name:string;kind:string;military:boolean;side?:Side;depth?:number;heading:number;speed:number;hull:number;alert:number;attack:number;
  incidental?:boolean;parley?:Stand;disabled?:boolean;flood?:number;lastAttackAt?:number;tracking?:string;report?:Point & {time:number};}
interface Traffic {window:number;next:number;turn:number;volleys:Volley[]}
interface Patrol extends Point {time:number;mission:string;depth:number;heading:number;environment:{chartSeed?:number};patrol:{seed:number};ships:Vessel[];traffic:Traffic;weaponSequence:number}
type Action='ping'|'shell'|'short-run'|'attack'|'answer'|'arrival'|'withdraw';
type Signal=(action:Action,ship:Vessel,shot?:Volley)=>void;
const halfDay=DAY_SECONDS/2;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const range=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const heading=(a:Point,b:Point)=>(Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI+360)%360;
const orders=new Set<string>(missions.filter(m=>m.engaged).map(m=>m.id));
const scripted=(s:Patrol,v:Vessel)=>!v.incidental&&orders.has(s.mission);
const sideOf=(v:Vessel)=>v.side??'hostile';
const strength=(v:Vessel)=>(v.kind==='merchant'?1:v.kind==='carrier'?4:3)*v.hull/100*(v.disabled?.5:1);
function identity(id:string){let n=17;for(const c of id)n=(Math.imul(n,31)+c.charCodeAt(0))>>>0;return n;}
export const temperament=(seed:number,id:string)=>hash01(seed,identity(id));
export function freshTraffic(time=0):Traffic{return {window:Math.floor(time/halfDay)-1,next:0,turn:0,volleys:[]};}
export function encounterTime(seed:number,window:number){return halfDay*window+90+hash01(seed,81000+window*100)*(.91*halfDay);}
export function resumeTraffic(time:number,seed:number){
 const traffic=freshTraffic(time),window=Math.floor(time/halfDay);
 if(time>=encounterTime(seed,window))traffic.window=window;
 return traffic;
}
export function encounterGroups(seed:number,window:number){
 const roll=(i:number)=>hash01(seed,81000+100*window+i);
 return {friendlySub:roll(1)<.28,hostileSub:roll(2)<.30,friendlySurface:roll(3)<.30,hostileSurface:roll(4)<.30};
}
function visitors(s:Patrol,window:number,signal:Signal){
 const seed=s.patrol.seed,g=encounterGroups(seed,window);
 const groups=[g.friendlySub,g.hostileSub,g.friendlySurface,g.hostileSurface];
 for(let group=0;group<4;group++){
  if(!groups[group])continue;
  const roll=(n:number)=>hash01(seed,81010+window*100+group*18+n);
  const side=group%2?'hostile':'friendly',sub=group<2,offset=1150+roll(1)*1750;
  const count=sub||roll(2)<.52?1:2+Math.floor(roll(3)*3);
  const startAngle=roll(0)*Math.PI*2;
  let passage:Point[]|undefined,angle=startAngle;
  for(let trial=0;trial<16;trial++){
   angle=startAngle+trial*Math.PI/8;
   const points=Array.from({length:count},(_,i)=>({x:s.x+offset*Math.sin(angle)+i*140,y:s.y+offset*Math.cos(angle)-i*170}));
   if(points.every(p=>chartDepth(p.x,p.y,s.environment.chartSeed)>(sub?30:10))){passage=points;break;}
  }
  if(!passage)continue;
  for(let i=0;i<count;i++){
   const escort=!sub&&(i===0&&(count>1||roll(4)<.65)),kind=sub?'sub':escort?'escort':'merchant';
   const id='passage-'+window+'-'+group+'-'+i,name=['Petrel','Fulmar','Sanderling','Gannet','Curlew','Tern','Teal','Avocet'][Math.floor(roll(6+i)*8)]+' '+(window+1)+'-'+(group+1)+(i?String.fromCharCode(65+i):'');
   const position=passage[i],depth=sub?Math.min(35+roll(5)*35,chartDepth(position.x,position.y,s.environment.chartSeed)-8):0;
   const v={id,name,kind,military:true,side:side as Side,depth,...position,
    heading:(angle*180/Math.PI+145+roll(12)*70)%360,speed:sub?4:6,hull:100,alert:0,attack:0,sinkDepth:0,incidental:true,flood:0,disabled:false};
   s.ships.push(v);signal('arrival',v);
  }
 }
}
function stand(s:Patrol,v:Vessel,target:string,d:number){
 if(v.parley?.against!==target)v.parley={against:target,level:0,order:'watch',range:d,next:s.time,cruise:v.parley?.cruise??v.speed};
 return v.parley!;
}
export function playerSignal(s:Patrol,v:Vessel|undefined,serious:boolean,source:Point|null=s){
 if(!v||!v.military||v.hull<=0||sideOf(v)==='friendly')return;
 const p=stand(s,v,'player',range(s,v));
 const heard=source??v.report;
 if(heard)p.origin={x:Math.round(heard.x/250)*250,y:Math.round(heard.y/250)*250,time:s.time};
 if(p.order==='fight')return;
 p.level=serious?4:Math.min(4,p.level+1);p.next=s.time;p.order=serious?'fight':'warn';
}
export function canAttackPlayer(s:Patrol,v:Vessel){
 if(!v.parley&&!v.incidental&&v.alert>=80)return true;
 if(v.parley)return v.parley.order==='fight'&&v.parley.against==='player';
 return scripted(s,v);
}
function volley(s:Patrol,v:Vessel,target:Point & {id:string;depth?:number},warning:boolean,roll:number){
 const underwater=v.kind==='sub',from={x:v.x,y:v.y,altitude:underwater?-(v.depth??20):4};
 const to={x:target.x,y:target.y,altitude:underwater?-Math.max(2,target.depth??0):0};
 if(warning){
  if(underwater){to.x=v.x+(to.x-v.x)*.45;to.y=v.y+(to.y-v.y)*.45;}
  else{to.x+=100;to.y-=100;}
 }
 const shot={id:s.weaponSequence++,source:v.id,target:target.id,underwater,warning,from,to,launched:s.time,arrives:s.time+(underwater?9:3),damage:warning||roll<.34?0:18+Math.round(18*roll)};
 s.traffic.volleys.push(shot);return shot;
}
const attackingPlayer=(s:Patrol,v:Vessel)=>v.parley?.against==='player'&&v.parley.order==='fight'||v.lastAttackAt!==undefined&&s.time-v.lastAttackAt<45;
export function advanceTraffic(s:Patrol,holiday:boolean,signal:Signal){
 const t=s.traffic,window=Math.floor(s.time/halfDay);
 if(t.window<window&&s.time>=encounterTime(s.patrol.seed,window)){t.window=window;visitors(s,window,signal);}
 t.volleys=t.volleys.filter(shot=>{
  if(s.time<shot.arrives)return true;
  const target=s.ships.find(v=>v.id===shot.target);
  if(target&&target.hull>0&&shot.damage){target.hull=incidentalHull(target,shot.damage);const p=stand(s,target,shot.source,range(target,shot.from));p.level=4;p.order='fight';}
  const source=s.ships.find(v=>v.id===shot.source);
  if(source)signal('answer',source,shot);
  return false;
 });
 if(s.time<t.next)return;
 t.next=s.time+4;const turn=t.turn++;
 for(const v of s.ships){
  if(v.hull<=0||!v.military)continue;
  const prior=v.parley;
  if(prior&&s.time<prior.next)continue;
  const script=scripted(s,v);
  // The opposing casts of a scripted battle already have orders. Passing
  // traffic can still intervene when one of those ships threatens the player.
  let other:Vessel|undefined,nearest=2600;
  for(const candidate of s.ships){
   if(candidate===v||candidate.hull<=0||!candidate.military||sideOf(candidate)===sideOf(v)||script&&!candidate.incidental)continue;
   const d=range(v,candidate);
   const assisting=sideOf(v)==='friendly'&&attackingPlayer(s,candidate);
   const weight=assisting?.45:strength(v)>strength(candidate)*1.5?.8:1;
   if(d<2600&&d*weight<nearest){other=candidate;nearest=d*weight;}
  }
  const observed=v.report&&s.time-v.report.time<=30?v.report:undefined;
  const player=sideOf(v)==='hostile'&&!script&&observed&&range(v,observed)<nearest;
  const deliberate=prior?.against==='player'&&prior.origin&&prior.level>0&&s.time-prior.origin.time<75;
  const target=player||deliberate?{...(observed??prior!.origin!),id:'player',depth:0}:other;
  if(!target){
   if(prior){if(!v.disabled)v.speed=prior.cruise;delete v.parley;}continue;
  }
  const d=range(v,target),p=stand(s,v,target.id,d);
  const key=identity(v.id)+turn*9;
  const roll=(n:number)=>hash01(s.patrol.seed,key+n);
  const aggression=temperament(s.patrol.seed,v.id),initiative=holiday?.25:1;
  const damage=clamp((100-v.hull)/100+(v.flood??0)*.035+(v.disabled?.48:0));
  const help=sideOf(v)==='friendly'&&other?.id===target.id&&attackingPlayer(s,other);
  const leaving=p.level>0&&d>p.range+75;
  p.next=s.time+12+roll(1)*12;
  if(leaving||damage>.28&&roll(2)<damage*(1.25-.75*aggression)||p.level>0&&p.order!=='fight'&&roll(3)<(1-aggression)*.44){
   if(p.order!=='retreat')signal('withdraw',v);
   p.order='retreat';p.level=0;v.heading=(heading(v,target)+180)%360;v.speed=v.disabled?0:Math.max(4,p.cruise)*(1-.5*damage);p.next+=65;
  }else if(p.order==='fight'||p.level>=4||help&&roll(3)<.3+.65*aggression||aggression>.91&&roll(4)<initiative*.65){
   p.order='fight';p.level=4;
   if(target.id!=='player'&&!v.disabled&&v.kind!=='merchant')signal('attack',v,volley(s,v,target,false,roll(5)));
  }else if(p.order==='approach'){
   v.speed=0;p.order='stop';
  }else if(roll(4)<initiative*(.12+.74*aggression)){
   p.level=Math.min(4,p.level+1);const action=Math.floor(roll(6)*3);
   if(action===0||v.kind==='merchant'){
    v.heading=heading(v,target);v.speed=v.disabled?0:p.cruise+2;p.order='approach';
   }else{
    p.order='warn';
    if(v.kind==='sub'&&action===1)signal('ping',v);
    else signal(v.kind==='sub'?'short-run':'shell',v,volley(s,v,target,true,0));
   }
   if(other&&target.id===other.id&&other.parley?.order!=='fight'&&other.parley?.order!=='retreat'){const reply=stand(s,other,v.id,d);reply.level=Math.min(4,reply.level+1);}
  }else if(p.order==='stop'||p.order==='retreat'){v.speed=p.cruise;p.order='watch';}
  p.range=d;
 }
}

export function validTraffic(s:Patrol){
 const t=s.traffic,finite=Number.isFinite,ids=new Set(s.ships.map(v=>v.id));
 if(!t||!Number.isInteger(t.window)||t.window< -1||t.window>Math.floor(s.time/halfDay)||
    !Number.isSafeInteger(t.turn)||t.turn<0||!finite(t.next)||t.next<0||!Array.isArray(t.volleys)||ids.size!==s.ships.length)return false;
 const point=(p:Point)=>p&&finite(p.x)&&finite(p.y);
 for(const v of s.ships){
  if(v.incidental!==undefined&&(v.incidental!==true||!/^passage-\d+-[0-3]-[0-3]$/.test(v.id)||!['hostile','friendly'].includes(v.side??'')))return false;
  if(v.lastAttackAt!==undefined&&(!finite(v.lastAttackAt)||v.lastAttackAt<0||v.lastAttackAt>s.time))return false;
  const p=v.parley;
  if(p&&(!['watch','approach','stop','warn','fight','retreat'].includes(p.order)||!Number.isInteger(p.level)||p.level<0||p.level>4||
   ![p.next,p.cruise,p.range].every(finite)||p.range<0||p.next<0||p.against!=='player'&&!ids.has(p.against)||p.origin&&(!point(p.origin)||!finite(p.origin.time)||p.origin.time>s.time)))return false;
 }
 const shots=new Set<number>();
 return t.volleys.every(v=>{
  if(!v||!Number.isSafeInteger(v.id)||v.id<1||v.id>=s.weaponSequence||shots.has(v.id))return false;
  shots.add(v.id);
  return typeof v.warning==='boolean'&&typeof v.underwater==='boolean'&&point(v.from)&&point(v.to)&&
   [v.from.altitude,v.to.altitude,v.launched,v.arrives,v.damage].every(finite)&&v.launched>=0&&v.launched<=s.time&&v.arrives>s.time&&
   v.damage>=0&&(!v.warning||v.damage===0)&&ids.has(v.source)&&(ids.has(v.target)||v.target==='player'&&v.warning);
 });
}
