import {boatLocal} from './surface-motion.ts';
// The recorder owns only pictures of the renderable world. Neither playback
// nor its camera can advance a patrol, expend ammunition or write a game save.
type Point={x:number;y:number;depth:number};
type Pose=Point & {heading:number;pitch?:number;speed?:number};
type Ship=Pose & {id:string;kind:string;sinkDepth:number;hull:number};
type Shot=Pose & {id:number;owner:string;age:number;path:(Point & {time:number})[]};
type Actor={id:number; x:number;y:number;altitude:number;heading:number};
type World=Pose & {
  time:number;pitch:number;mission:string; difficulty:{instantReplay:boolean;enemyReplay:boolean};
  ships:Ship[];projectiles:Shot[];aircraft:Actor[];impacts:{id:number;time:number}[];
  blasts:object[];shells:object[];lightning:object[];gunRounds:object[];
  airSupport:object;environment:object;patrol:object;systems:object;gun:object;drone:Pose;
  site:(Pose & {kind:string})|null;operation:object|null;
  planes:number;rudder:number;cavitation:number;propRpm:number;propAngle:number;scopeAngle:number;
  towerAngle:number;towerPitch:number;verticalSpeed:number;scope:boolean;
};
export type ReplayEvent={kind:'ground'|'collision'|'blast'|'torpedo'|'near-miss'|'collapse'|'sinking';
  point:Point; heading?:number; target?:string; shot?:number; enemy?:boolean};
type TimedEvent=ReplayEvent & {time:number};
type Frame=ReturnType<typeof picture>;
export type Clip={event:TimedEvent;frames:Frame[];wall:number};
const copies=<T extends object>(items:T[])=>items.map(item=>({...item}));
function picture(s:World){
  return {time:s.time,x:s.x,y:s.y,depth:s.depth,heading:s.heading,speed:s.speed,pitch:s.pitch,
    verticalSpeed:s.verticalSpeed,planes:s.planes,rudder:s.rudder,propRpm:s.propRpm,propAngle:s.propAngle,
    scopeAngle:s.scopeAngle,towerAngle:s.towerAngle,towerPitch:s.towerPitch,scope:s.scope,cavitation:s.cavitation,
    mission:s.mission,environment:s.environment,patrol:s.patrol,difficulty:s.difficulty,systems:{...s.systems},
    drone:{...s.drone},gun:{...s.gun},site:s.site?{...s.site}:null,operation:s.operation?{...s.operation}:null,airSupport:{...s.airSupport},
    ships:copies(s.ships),aircraft:copies(s.aircraft),projectiles:s.projectiles.map(p=>({...p,path:p.path.slice(-32)})),
    impacts:copies(s.impacts),lightning:copies(s.lightning),blasts:copies(s.blasts),shells:copies(s.shells),gunRounds:copies(s.gunRounds)};
}
const observers=new WeakMap<object,ReplayRecorder>();
export function replayEvent(s:World,event:ReplayEvent){observers.get(s)?.mark(s.time,event);}
const waitTime={ground:1.2,collision:1.2,blast:5,torpedo:3,'near-miss':.15,collapse:2,sinking:1};
const lead=5, aftermath=1.2;
export class ReplayRecorder {
  history:Frame[]=[];pending:Clip[]=[];
  passes=new Map<number,{gap:number;point:Point}>();
  private readonly clock:()=>number;
  constructor(world:World,clock=()=>performance.now()/1000){
    this.clock=clock;
    if(world.difficulty.instantReplay){observers.set(world,this);this.capture(world);}
  }
  mark(time:number,event:ReplayEvent){
    const latest=this.history.at(-1);
    if(!latest)return;
    if(event.kind==='torpedo'){
      if(event.shot!==undefined)this.passes.delete(event.shot);
      this.pending=this.pending.filter(c=>!(c.event.kind==='near-miss'&&c.event.shot===event.shot&&time-c.event.time<3));
    }
    if(event.enemy&&!latest.difficulty.enemyReplay)return;
    if(!latest.difficulty.instantReplay)return;
    if(this.pending.some(c=>c.event.kind===event.kind&&c.event.target===event.target&&c.event.shot===event.shot&&Math.abs(c.event.time-time)<1&&Math.hypot(c.event.point.x-event.point.x,c.event.point.y-event.point.y)<.5))return;
    // Simultaneous impacts share snapshots. Bound the pending queue even on a
    // crowded patrol, giving events concerning the player's boat first place.
    if(this.pending.length>=8){
      const i=this.pending.findIndex(c=>c.event.enemy);if(i<0||event.enemy)return;
      this.pending.splice(i,1);
    }
    this.pending.push({event:{...event,time},wall:this.clock(),frames:this.history.filter(f=>f.time>=time-lead-.26&&f.time<=time+aftermath)});
  }
  capture(s:World){
    this.nearMisses(s);
    const last=this.history.at(-1);
    if(last&&s.time-last.time<.1-1e-6&&!this.pending.some(c=>c.event.time===s.time&&last.time!==s.time))return;
    const frame=picture(s);this.history.push(frame);
    while(this.history.length>1 && this.history[1].time<s.time-lead-.26)this.history.shift();
    for(const clip of this.pending)if((clip.frames.at(-1)?.time??-1)<s.time && s.time<=clip.event.time+aftermath+.25)clip.frames.push(frame);
  }
  private nearMisses(s:World){
    if(!s.projectiles.length&&!this.passes.size)return;

    for(const p of s.projectiles){
      if(p.owner!=='enemy')continue;
      const {side,forward,down}=boatLocal(s,p);
      const hullGap=Math.hypot(side,down,Math.max(0,Math.abs(forward)-27.5))-5;
      const sailGap=Math.hypot(side,forward-5,Math.max(0,down+4,-11-down))-2.1;
      const gap=Math.min(hullGap,sailGap);
      const pass=this.passes.get(p.id);
      if(gap<=20&&(!pass||gap<pass.gap))this.passes.set(p.id,{gap,point:{x:p.x,y:p.y,depth:p.depth}});
      if(pass&&gap>22){
        this.mark(s.time,{kind:'near-miss',shot:p.id,point:pass.point});
        this.passes.delete(p.id);
      }
    }
    // Detonation and expiry remove the projectile, never confirming a pass.
    for(const id of this.passes.keys())if(!s.projectiles.some(p=>p.id===id))this.passes.delete(id);
  }
  take(time:number,ended:boolean,tail:(event:TimedEvent)=>boolean){
    const c=this.pending[0];if(!c)return null;
    const delay=waitTime[c.event.kind];
    if(this.clock()-c.wall<delay || (!ended&&time<c.event.time+Math.max(delay,aftermath)) || tail(c.event))return null;
    this.pending.shift();return c;
  }
}
const blend=(a:number,b:number,f:number)=>a+(b-a)*f;
function tween<T extends {x:number;y:number}>(a:T,b:T|undefined,f:number):T{
  if(!b)return a;
  const out={...a,x:blend(a.x,b.x,f),y:blend(a.y,b.y,f)};
  for(const key of ['depth','pitch','altitude','age','sinkDepth','propAngle','pingAge','bank'] as const){
    const left=Reflect.get(a,key),right=Reflect.get(b,key);
    if(typeof left==='number'&&typeof right==='number')Reflect.set(out,key,blend(left,right,f));
  }
  if('heading' in a&&'heading' in b&&typeof a.heading==='number'&&typeof b.heading==='number')
    Reflect.set(out,'heading',a.heading+(((b.heading-a.heading+540)%360)-180)*f);
  return out;
}
function actors<T extends {id:string|number;x:number;y:number}>(a:T[],b:T[],f:number){
  return a.map(v=>tween(v,b.find(next=>next.id===v.id),f));
}
export function replayPicture(clip:Clip,time:number){
  const i=clip.frames.findIndex(f=>f.time>time);
  if(i<=0)return i<0?clip.frames[clip.frames.length-1]:clip.frames[0];
  const a=clip.frames[i-1],b=clip.frames[i],f=(time-a.time)/(b.time-a.time);
  return {...tween(a,b,f),time,ships:actors(a.ships,b.ships,f),projectiles:actors(a.projectiles,b.projectiles,f),
    aircraft:actors(a.aircraft,b.aircraft,f),drone:tween(a.drone,b.drone,f)};
}
export function replayCamera(frame:Frame,event:TimedEvent,rotation:{yaw:number;pitch:number;zoom:number}){
  const shot=frame.projectiles.find(p=>p.id===event.shot),v=frame.ships.find(p=>p.id===event.target);
  const vessel=v?{x:v.x,y:v.y,depth:(v.depth??0)+(v.sinkDepth||0)}:event.point;
  const boat={x:frame.x,y:frame.y,depth:frame.depth};
  let focus=boat, yaw=frame.heading*Math.PI/180+1.7, pitch=.19, distance=84;
  if(event.kind==='torpedo'&&event.target){
    const p=shot??event.point;
    const heading=shot?.heading??event.heading??0;
    const ahead=Math.min(12,Math.hypot(event.point.x-p.x,event.point.y-p.y));
    focus={x:p.x+Math.sin(heading*Math.PI/180)*ahead,y:p.y+Math.cos(heading*Math.PI/180)*ahead,depth:p.depth};
    yaw=(heading+180)*Math.PI/180;pitch=.27;distance=shot?48:78;
  }else if(event.kind==='sinking'||event.kind==='collapse'){
    focus=event.kind==='sinking'?{...vessel,depth:2}:vessel;yaw=(v?.heading??0)*Math.PI/180+1.25;distance=v?.kind==='carrier'?250:v?.kind==='sub'?85:145;pitch=event.kind==='sinking'?.14:.12;
  }else if(event.kind!=='ground'){
    const p=shot??(event.kind==='collision'&&v?vessel:event.point),dx=p.x-boat.x,dy=p.y-boat.y,dz=p.depth-boat.depth;
    focus={x:(boat.x+p.x)/2,y:(boat.y+p.y)/2,depth:(boat.depth+p.depth)/2};
    if(Math.hypot(dx,dy)>1)yaw=Math.atan2(dx,dy)+Math.PI/2;
    if(event.kind==='near-miss')yaw=frame.heading*Math.PI/180+1.08;
    distance=78+1.10*Math.hypot(dx,dy,dz);

  }
  if(focus.depth>2)pitch=Math.min(pitch,Math.asin(Math.min(1,Math.max(0,focus.depth-1.5)/(distance*rotation.zoom))));
  return {focus,yaw:yaw+rotation.yaw,pitch:Math.max(-1.28,Math.min(1.28,pitch+rotation.pitch)),distance:distance*rotation.zoom};
}

export const replayLabels:Record<ReplayEvent['kind'],string>={
  ground:'Seafloor contact',collision:'Hull collision',blast:'Underwater blast',torpedo:'Torpedo impact',
  'near-miss':'Torpedo near miss',collapse:'Hull implosion',sinking:'Ship slipping below the surface'
};

export class ReplayPlayback {
  readonly clip:Clip;
  readonly world:Frame;
  readonly rotation={yaw:0,pitch:0,zoom:1};
  cursor:number;
  private points=new Map<number,{x:number;y:number}>();
  constructor(clip:Clip){
    this.clip=clip;
    this.cursor=Math.max(clip.frames[0].time,clip.event.time-lead);
    this.world={...replayPicture(clip,this.cursor)};
  }
  advance(seconds:number){
    this.cursor+=seconds;
    Object.assign(this.world,replayPicture(this.clip,this.cursor),{time:this.cursor});
    return this.cursor<=this.clip.event.time+aftermath;
  }
  camera(){return replayCamera(this.world,this.clip.event,this.rotation);}
  press(id:number,x:number,y:number){this.points.set(id,{x,y});}
  release(id:number){this.points.delete(id);}
  zoomBy(factor:number){this.rotation.zoom=Math.max(.45,Math.min(2.4,this.rotation.zoom*factor));}
  move(id:number,x:number,y:number){
    const original=this.points.get(id);
    if(!original)return;
    const other=Array.from(this.points).find(([key])=>key!==id)?.[1];
    if(other){
      const old=Math.hypot(original.x-other.x,original.y-other.y);
      const next=Math.hypot(x-other.x,y-other.y);
      if(old>2&&next>2)this.zoomBy(old/next);
    }else{
      this.rotation.yaw=(this.rotation.yaw+(x-original.x)*.008)%(Math.PI*2);
      this.rotation.pitch=Math.max(-1.28,Math.min(1.28,this.rotation.pitch+(y-original.y)*.008));
    }
    this.points.set(id,{x,y});
  }
}
