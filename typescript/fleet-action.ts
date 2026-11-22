import {hash01} from './surface-motion.ts';

type Side = 'friendly' | 'hostile';
type Point = {x:number;y:number};
type Position = Point & {altitude:number};
interface Vessel extends Point {
  id:string;name:string;side:Side;kind:'escort'|'sub';hull:number;speed:number;heading:number;depth:number;
  military:true;disabled:boolean;flood:number;sinkDepth:number;alert:number;attack:number;
}
type Area = Point & {label:string;radius:number};
export interface Volley {id:number;underwater:boolean;from:Position;to:Position;source:string;target:string;launched:number;arrives:number;damage:number}
interface Battle {areas:Area[];volleys:Volley[];round:number;next:number}
interface Theater {time:number;weaponSequence:number;ships:Vessel[];battle:Battle;patrol:{seed:number}}
export const isOpponent = (v:{military?:boolean;side?:Side}) => v.military && v.side !== 'friendly';
export function sidesAfloat(ships:readonly {side?:Side;hull:number}[]){
  let friendly=0,hostile=0;
  for(const v of ships)if(v.hull>0){if(v.side==='friendly')friendly++;else if(v.side==='hostile')hostile++;}
  return {friendly,hostile};
}
export const friendlyLead=(ships:Parameters<typeof sidesAfloat>[0])=>{
  const {friendly,hostile}=sidesAfloat(ships);return friendly-hostile;
};
const names={friendly:['Lark','Marlin','Calliope','Nacre'],hostile:['Flint','Tempest','Greywing','Basalt']};
export function fleetTheater(origin:Point,seed:number){
  const h=(n:number)=>hash01(seed,1200+n);
  const east=h(0)<.5?-1:1,center={x:origin.x+east*250,y:origin.y+1300};
  const areas=[{x:center.x-east*540,y:center.y+100,radius:560,label:'Friendly surface patrol area'},
    {x:center.x-east*250,y:center.y-500,radius:440,label:'Friendly submarine patrol area'}];
  const ships:Vessel[]=[];
  for(const side of ['friendly','hostile'] as const)for(let i=0;i<4;i++){
    const sub=i===3,area=areas[sub?1:0],offset=side==='friendly'?0:4;
    const angle=2*Math.PI*(i/3+h(1+offset)*.28),radius=(.45+.40*h(10+i+offset))*area.radius;
    ships.push({id:side+'-'+(i+1),name:names[side][i],side,kind:sub?'sub':'escort',military:true,
      x:(side==='friendly'?area.x:2*center.x-area.x)+Math.cos(angle)*radius,
      y:(side==='friendly'?area.y:2*center.y-area.y)+Math.sin(angle)*radius,
      depth:sub?38+Math.floor(36*h(30+offset)):0,heading:h(40+i+offset)*360,speed:sub?3:4+i*.5,
      hull:100,alert:0,attack:0,disabled:false,flood:0,sinkDepth:0});
  }
  return {ships,battle:{areas,volleys:[],round:0,next:0} as Battle};
}
type BattleEvent = (ship:Vessel, volley:Volley, fired:boolean)=>void;
// Both casts use the same seeded encounter rules. A unit gets a turn to answer,
// and may yield its turn to a healthier ship; neither cast reads the player's helm.
export function advanceFleetAction(s:Theater, onEvent:BattleEvent){
  const b=s.battle;
  b.volleys=b.volleys.filter(v=>{
    const target=s.ships.find(ship=>ship.id===v.target)!;
    if(target.hull<=0)v.damage=0;
    if(v.damage){
      // Replace the endpoint so earlier replay frames keep the position they recorded.
      v.to={x:target.x,y:target.y,altitude:v.underwater?-Math.max(2,target.depth):2};
    }
    if(v.arrives>s.time)return true;
    target.hull=Math.max(0,target.hull-v.damage);
    onEvent(target,v,false);return false;
  });
  if(s.time<b.next)return;
  const round=b.round++,roll=(n:number)=>hash01(s.patrol.seed,3000+round*64+n);
  b.next=s.time+9+roll(0)*9;
  for(const [index,side] of (['friendly','hostile'] as const).entries()){
    const team=s.ships.filter(v=>v.side===side&&v.hull>0&&!v.disabled);
    const others=s.ships.filter(v=>v.side!==side&&v.hull>0);
    if(!team.length||!others.length)continue;
    const n=index*16;
    if(team.length<others.length&&roll(n+10)>.45+.55*team.length/others.length)continue;
    let unit=team[(round+Math.floor(roll(n+1)*team.length))%team.length];
    if(unit.hull<40&&team.length>1&&roll(n+2)<.7)unit=team.reduce((a,v)=>v.hull>a.hull?v:a);
    const target=others[Math.floor(roll(n+3)*others.length)];
    const hit=roll(n+4)<(unit.kind==='sub'?.78:.58);
    const damage=hit?Math.round((unit.kind==='sub'?28:17)+roll(n+5)*16):0;
    const underwater=unit.kind==='sub'||target.kind==='sub';
    const point={x:target.x,y:target.y,altitude:underwater?-Math.max(2,target.depth):2};
    if(!hit){point.x+=90*(roll(n+6)<.5?-1:1);point.y+=120*(roll(n+7)-.5);}
    const duration=underwater?Math.min(48,Math.max(5,Math.hypot(point.x-unit.x,point.y-unit.y)/30)):2.5+roll(n+8)*2;
    const shot={id:s.weaponSequence++,underwater,from:{x:unit.x,y:unit.y,altitude:underwater?-Math.max(2,unit.depth):3},to:point,source:unit.id,target:target.id,
      launched:s.time,arrives:s.time+duration,damage};
    b.volleys.push(shot);onEvent(unit,shot,true);
    // Stage a broad turn between exchanges, keeping the encounter near its patrol area.
    const area=b.areas[unit.kind==='sub'?1:0];
    if(Math.hypot(unit.x-area.x,unit.y-area.y)>1800)unit.heading=(Math.atan2(area.x-unit.x,area.y-unit.y)*180/Math.PI+360)%360;
    else unit.heading=(unit.heading+(roll(n+9)-.5)*32+360)%360;
  }
}
export function fleetShotPose(v:Volley,time:number){
  const seconds=v.arrives-v.launched,age=Math.max(0,time-v.launched),f=Math.min(1,age/seconds);
  const dx=v.to.x-v.from.x,dy=v.to.y-v.from.y,dz=v.to.altitude-v.from.altitude;
  return {id:v.id,x:v.from.x+dx*f,y:v.from.y+dy*f,depth:-(v.from.altitude+dz*f),time,age,
    heading:(Math.atan2(dx,dy)*180/Math.PI+360)%360,pitch:Math.atan2(dz,Math.hypot(dx,dy)),speed:Math.hypot(dx,dy,dz)/seconds};
}
// Briefing overlays come from the sailing plan. They never follow a live contact.
export function classifyEcho(battle:Battle, ship:Vessel, observation:Point, roll:number){
  const area=battle.areas[ship.kind==='sub'?1:0];
  const nearPlan=Math.hypot(observation.x-area.x,observation.y-area.y)<area.radius*1.8;
  if(ship.side==='friendly'&&roll<(nearPlan?.88:.62))return 'friendly';
  if(ship.side==='hostile'&&roll<.28)return 'hostile';
  return undefined;
}
export function affiliation(c:{side?:Side;probableSide?:Side;military?:boolean;identified?:boolean}){
  if(c.side)return c.side==='friendly'?'FRIENDLY':'HOSTILE';
  if(c.probableSide)return c.probableSide==='friendly'?'PROBABLE FRIENDLY':'PROBABLE HOSTILE';
  return c.identified?(c.military?'MILITARY':'NEUTRAL'):'';
}
export function validTheater(s:Theater){
  const b=s.battle,finite=Number.isFinite;
  if(!b||!Number.isInteger(b.round)||b.round<0||!finite(b.next)||b.next<0||
    !Array.isArray(b.areas)||b.areas.length!==2||!b.areas.every(a=>a&&finite(a.x)&&finite(a.y)&&finite(a.radius)&&a.radius>0&&typeof a.label==='string'))return false;
  if(s.ships.length!==8||!(['friendly','hostile'] as const).every(side=>names[side].every((_,i)=>s.ships.some(v=>
    v.id===side+'-'+(i+1)&&v.side===side&&v.military&&v.kind===(i===3?'sub':'escort')&&finite(v.depth)))))return false;
  const position=(p:Position)=>p&&finite(p.x)&&finite(p.y)&&finite(p.altitude);
  const ids=new Set<number>();
  return Array.isArray(b.volleys)&&b.volleys.length<=12&&b.volleys.every(v=>{
    if(!v||!Number.isSafeInteger(v.id)||v.id<1||v.id>=s.weaponSequence||ids.has(v.id))return false;
    ids.add(v.id);
    if(typeof v.underwater!=='boolean'||!position(v.from)||!position(v.to)||!finite(v.launched)||!finite(v.arrives))return false;
    if(v.launched<0||v.launched>s.time||v.arrives<=s.time||v.arrives<=v.launched||!finite(v.damage)||v.damage<0)return false;
    const source=s.ships.find(u=>u.id===v.source),target=s.ships.find(u=>u.id===v.target);
    return source&&target&&source.side!==target.side;
  });
}
